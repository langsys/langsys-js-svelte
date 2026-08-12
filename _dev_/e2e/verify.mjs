/**
 * E2E verification for ticket 838 (write-key gating & content discovery).
 *
 * Not part of the published package — a dev harness. Requires a running dev
 * server and a `.env` (gitignored) supplying the API base, project id, keys and
 * the write-grant signing secret. Run:
 *
 *     npm run dev                       # terminal 1, must be 127.0.0.1:5173
 *     node --env-file=.env _dev_/e2e/verify.mjs
 *
 * Takes ~90s: the hint-attribution assertion deliberately waits out the SDK's
 * 5–30s jitter window.
 *
 * NOT covered here, by design — the SSR write lane (`ssrTokenStrategy:'server'`).
 * `LangsysApp` is a process-wide singleton and the dev server is long-lived, so
 * the first `init()` wins for every later request including other routes. Folding
 * the SSR cases in would silently contaminate the hydration assertions, which
 * also init on the server. Each SSR case needs a freshly started server; see
 * `_dev_/e2e/README.md`.
 */
import { chromium } from 'playwright';
import { createHmac } from 'node:crypto';

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
const SECRET = process.env.VITE_LANGSYS_WRITE_GRANT_SECRET;
const API = process.env.VITE_LANGSYS_BASE_URL ?? 'http://langsys2.test/api';
const PROJECT = process.env.VITE_LANGSYS_PROJECT_ID;
const KEY_READ = process.env.VITE_LANGSYS_KEY_READ;

if (!SECRET || !PROJECT || !KEY_READ) {
    console.error(
        'Missing env. Need VITE_LANGSYS_WRITE_GRANT_SECRET, VITE_LANGSYS_PROJECT_ID and\n' +
            'VITE_LANGSYS_KEY_READ. Run with: node --env-file=.env _dev_/e2e/verify.mjs',
    );
    process.exit(2);
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** Mint HS256 locally so expiry is a variable we control, not a fixed sample. */
function mintGrant(claims) {
    const head = b64({ typ: 'JWT', alg: 'HS256' });
    const body = b64(claims);
    const sig = createHmac('sha256', SECRET).update(`${head}.${body}`).digest('base64url');
    return `${head}.${body}.${sig}`;
}

const now = () => Math.floor(Date.now() / 1000);
const GRANT_VALID = mintGrant({ sub: 'e2e-svelte', exp: now() + 3600 });
const GRANT_EXPIRED = mintGrant({ sub: 'e2e-svelte', exp: now() - 300 }); // beyond 60s leeway
const GRANT_NO_EXP = mintGrant({ sub: 'e2e-svelte' });
const results = [];
const pass = (n, d) => results.push({ ok: true, n, d });
const fail = (n, d) => results.push({ ok: false, n, d });

const browser = await chromium.launch();

/**
 * Every API response the page received, so assertions can check what the server
 * ACCEPTED rather than only what the SDK sent.
 *
 * Asserting on a captured request body is the same class of bug as a fetch that
 * returns 200 without executing: a perfectly-formed POST the server rejects
 * outright reads as success, and the suite certifies a broken path as working.
 * A suite that cannot fail is worse than no suite.
 */
const apiCalls = [];

async function newPage() {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    const msgs = [];
    p.on('console', (m) => msgs.push({ type: m.type(), text: m.text() }));
    p.on('pageerror', (e) => msgs.push({ type: 'pageerror', text: String(e) }));
    p.on('response', async (r) => {
        const url = r.url();
        if (!url.includes('/api/')) return;
        apiCalls.push({ url, status: r.status(), method: r.request().method() });
    });
    return { p, ctx, msgs };
}

const callsTo = (fragment) => apiCalls.filter((c) => c.url.includes(fragment));

const cellFor = (p, label) =>
    p.evaluate((l) => {
        const td = [...document.querySelectorAll('td')].find((x) => x.textContent.trim().startsWith(l));
        return td?.nextElementSibling?.textContent.trim() ?? null;
    }, label);

// ---------- TEST 1: hydration ----------
{
    const { p, msgs } = await newPage();
    await p.goto(`${BASE}/e2e/hydration`, { waitUntil: 'networkidle' });

    const raw = await cellFor(p, 'raw');
    const safe = await cellFor(p, 'safe');

    // The premise: auth really did resolve before first client render.
    if (raw === 'true') pass('premise: raw signal concrete at hydration', `raw=${raw}`);
    else fail('premise: raw signal concrete at hydration', `raw=${raw} — hazard not reproduced, rest is vacuous`);

    if (safe === 'undefined') pass('safe store reads undefined during hydration', `safe=${safe}`);
    else fail('safe store reads undefined during hydration', `safe=${safe}`);

    const live = (await p.locator('h2:has-text("Live value") + p').textContent()).trim();
    if (live.startsWith('true')) pass('safe store adopts real value post-hydration', live);
    else fail('safe store adopts real value post-hydration', live);

    // Only real errors/warnings — the test phrases contain the word "hydration",
    // so matching on text alone flags the SDK's own debug logs.
    const mismatches = msgs.filter(
        (m) =>
            m.type === 'pageerror' ||
            m.type === 'error' ||
            (m.type === 'warning' && /hydrat|mismatch/i.test(m.text)),
    );
    if (!mismatches.length) pass('no hydration mismatch / console errors', 'clean');
    else fail('no hydration mismatch / console errors', JSON.stringify(mismatches.slice(0, 3)));
}

// ---------- TEST 2: gate matrix in the browser ----------
for (const [key, expected] of [
    ['read', 'false'],
    ['ip_write', 'true'],
    ['write', 'true'],
]) {
    const { p } = await newPage();
    await p.goto(`${BASE}/e2e/lanes?key=${key}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(600);
    const txt = (await p.locator('.expect').first().textContent()).trim();
    const m = txt.match(/writeEnabled:\s*(\S+)/);
    const got = m ? m[1] : '?';
    if (got === expected) pass(`writeEnabled for ${key}`, got);
    else fail(`writeEnabled for ${key}`, `got ${got}, expected ${expected}`);
}

// ---------- TEST 3: grant re-authorizes ----------
// Asserts the MECHANISM (does setWriteGrant re-authorize, carrying the header),
// not the outcome: we have no valid grant JWT, and the server correctly refuses
// an API key used as one — verified by curl against authorize-project.
{
    const { p } = await newPage();
    const auths = [];
    p.on('request', (r) => {
        if (r.url().includes('authorize-project'))
            auths.push({ at: Date.now(), grant: r.headers()['x-write-grant'] ?? null });
    });
    await p.goto(`${BASE}/e2e/lanes?key=read`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(500);
    const beforeCount = auths.length;

    await p.locator('button:has-text("Apply write grant")').click();
    await p.waitForTimeout(2500);
    const added = auths.slice(beforeCount);

    if (added.length >= 1) pass('setWriteGrant triggers re-authorization', `${added.length} new authorize-project request(s)`);
    else fail('setWriteGrant triggers re-authorization', 'no new request — setter is inert');

    if (added.some((a) => a.grant)) pass('re-auth carries X-Write-Grant header', String(added.find((a) => a.grant)?.grant).slice(0, 12) + '…');
    else fail('re-auth carries X-Write-Grant header', 'header absent');

    const postGrantVisible = await p.locator('h3:has-text("Post-grant misses")').isVisible();
    if (postGrantVisible) pass('post-grant phrases rendered', 'visible');
    else fail('post-grant phrases rendered', 'not visible');
}

// ---------- TEST 4: visibility shapes ----------
{
    const { p } = await newPage();
    await p.goto(`${BASE}/e2e/visibility`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(500);
    const html = await p.content();
    const has = (s) => html.includes(s);
    if (has('visibility-css-hidden')) pass('CSS-hidden phrase is in the DOM', 'present (discoverable)');
    else fail('CSS-hidden phrase is in the DOM', 'absent');
    if (!has('visibility-if-block')) pass('{#if} phrase absent from DOM', 'absent (blind spot)');
    else fail('{#if} phrase absent from DOM', 'unexpectedly present');
    if (!has('visibility-await-block')) pass('{#await} pending phrase absent from DOM', 'absent (blind spot)');
    else fail('{#await} pending phrase absent from DOM', 'unexpectedly present');
}

// ---------- TEST 5: shallow routing does not remount ----------
{
    const { p } = await newPage();
    await p.goto(`${BASE}/e2e/nav`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(500);
    const mountedBefore = await p.locator('.mono.muted').first().textContent();
    await p.locator('button:has-text("pushState")').click();
    await p.waitForTimeout(400);
    const url = p.url();
    const mountedAfter = await p.locator('.mono.muted').first().textContent();
    const capturedBefore = mountedBefore.match(/captured at mount:\s*(\S+)/)?.[1];
    const capturedAfter = mountedAfter.match(/captured at mount:\s*(\S+)/)?.[1];
    if (url.includes('shallow=pushed')) pass('pushState mutated location.href', url);
    else fail('pushState mutated location.href', url);
    if (capturedBefore === capturedAfter)
        pass('shallow routing did not remount (captured URL stable)', capturedAfter);
    else fail('shallow routing did not remount', `${capturedBefore} -> ${capturedAfter}`);
}

// ---------- TEST 6: client-side nav does not remount ----------
{
    const { p } = await newPage();
    await p.goto(`${BASE}/e2e/nav`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(500);
    await p.evaluate(() => (window.__probe = 'survives'));
    await p.locator('a[href*="/e2e/nav/elsewhere"]').click();
    await p.waitForTimeout(800);
    const survived = await p.evaluate(() => window.__probe);
    if (survived === 'survives') pass('client-side nav kept module state (no remount)', 'window probe survived');
    else fail('client-side nav kept module state', `probe=${survived}`);
}

// ---------- TEST 7: cross-origin, unproxied ----------
{
    const { p } = await newPage();
    const seen = [];
    p.on('request', (r) => {
        if (r.url().includes('authorize-project')) seen.push(r.url());
    });
    const failed = [];
    p.on('requestfailed', (r) => failed.push(`${r.url()} :: ${r.failure()?.errorText}`));
    await p.goto(`${BASE}/e2e/lanes?key=ip_write`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(800);

    if (seen.some((u) => u.startsWith('http://langsys2.test/')))
        pass('requests are genuinely cross-origin (no proxy)', seen[0]);
    else fail('requests are genuinely cross-origin (no proxy)', seen[0] ?? 'no authorize-project request');

    if (!failed.length) pass('no blocked requests cross-origin', 'none');
    else fail('no blocked requests cross-origin', failed.slice(0, 2).join(' | '));
}

// ---------- TEST 8: grant via Svelte store (read key) ----------
{
    const { p } = await newPage();
    const grantHeaders = [];
    p.on('request', (r) => {
        const g = r.headers()['x-write-grant'];
        if (g) grantHeaders.push(g.slice(0, 20));
    });

    // Seed the store with a VALID grant at init; a read key must go write-enabled.
    await p.goto(
        `${BASE}/e2e/grant?initial=${encodeURIComponent(GRANT_VALID)}&next=${encodeURIComponent(GRANT_EXPIRED)}&run=grant1`,
        { waitUntil: 'networkidle' },
    );
    await p.waitForTimeout(1200);
    const atInit = (await p.locator('[data-testid="we"]').textContent()).trim();
    if (atInit === 'true') pass('store-form grant flips READ key to write-enabled', atInit);
    else fail('store-form grant flips READ key to write-enabled', atInit);

    if (grantHeaders.length) pass('X-Write-Grant survives cross-origin preflight', `${grantHeaders.length} request(s) carried it`);
    else fail('X-Write-Grant survives cross-origin preflight', 'header never sent');

    // Write an EXPIRED token into the store, refresh — value must be re-read.
    await p.locator('button:has-text("Set next token")').click();
    await p.waitForTimeout(2500);
    const afterSwap = (await p.locator('[data-testid="we"]').textContent()).trim();
    if (afterSwap === 'false')
        pass('store re-read at request time (valid -> expired degrades)', `${atInit} -> ${afterSwap}`);
    else fail('store re-read at request time (valid -> expired degrades)', `${atInit} -> ${afterSwap}`);
}

// ---------- TEST 9: expired / no-exp refused, valid accepted (server contract) ----------
{
    const probe = async (grant) => {
        const r = await fetch(`${API}/authorize-project/${PROJECT}`, {
            headers: { 'x-Authorization': KEY_READ, ...(grant ? { 'X-Write-Grant': grant } : {}) },
        });
        return (await r.json())?.data?.write_enabled;
    };
    const cases = [
        ['no grant', undefined, false],
        ['valid grant', GRANT_VALID, true],
        ['expired grant', GRANT_EXPIRED, false],
        ['no-exp grant', GRANT_NO_EXP, false],
    ];
    for (const [label, tok, want] of cases) {
        const got = await probe(tok);
        if (got === want) pass(`self-minted ${label} -> write_enabled ${want}`, String(got));
        else fail(`self-minted ${label} -> write_enabled ${want}`, `got ${got}`);
    }
}

// ---------- TEST 10: hint URL attribution across a client-side navigation ----------
// The regression this guards: URL read at FIRE time instead of MISS time. Uses the
// ip_write key with a forged client IP so the session is genuinely read-only (a pure
// read key can be suppressed server-side before a hint is ever recorded).
{
    const ctx = await browser.newContext({ extraHTTPHeaders: { 'X-Forwarded-For': '203.0.113.99' } });
    const p = await ctx.newPage();
    const hints = [];
    p.on('request', (r) => {
        if (r.url().includes('discovery/hint')) {
            try {
                hints.push(JSON.parse(r.postData()).page_url);
            } catch {
                /* ignore */
            }
        }
    });

    // Unique per run so the 60s server-side dedup window can't swallow it.
    const RUN = 'hint' + Math.floor((Date.now() / 1000) % 100000);
    await p.goto(`${BASE}/e2e/nav?run=${RUN}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(1500);
    await p.locator('a[href*="/e2e/nav/elsewhere"]').click(); // leave during the jitter window

    // Outlast BOTH jitter windows, not just the origin's. The destination's
    // misses happen after the navigation, so its own 5–30s timer starts later —
    // a window sized for the first hint alone drops the second intermittently.
    await p.waitForTimeout(50000);

    const origin = `${BASE}/e2e/nav?run=${RUN}`;
    const elsewhere = `${BASE}/e2e/nav/elsewhere?run=${RUN}`;

    if (hints.includes(origin))
        pass('hint names the MISS-time URL, not the fire-time one', origin);
    else fail('hint names the MISS-time URL, not the fire-time one', `origin hint missing; got ${JSON.stringify(hints)}`);

    if (hints.includes(elsewhere))
        pass('destination page gets its own separate hint', elsewhere);
    else fail('destination page gets its own separate hint', JSON.stringify(hints));

    if (new Set(hints).size === hints.length && hints.length === 2)
        pass('one hint per URL — no cross-route batching', `${hints.length} distinct`);
    else fail('one hint per URL — no cross-route batching', JSON.stringify(hints));

    await ctx.close();
}

// ---------- TEST 11: the server ACCEPTED the work, not just that we sent it ----------
// Without this block the entire suite stays green while the server rejects every
// registration — which is exactly how React's suite certified a 100%-failing
// registration path as 35/36 passing.
{
    const RUN = 'accept' + Math.floor((Date.now() / 1000) % 100000);
    const { p } = await newPage();
    await p.goto(`${BASE}/e2e/lanes?key=ip_write&run=${RUN}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(4000); // let the registration flush

    const regs = callsTo('translatable-items');
    const bad = regs.filter((c) => c.status < 200 || c.status >= 300);

    if (!regs.length) fail('registration POSTs were actually issued', 'none seen — nothing to accept');
    else if (!bad.length) pass('registration POSTs ACCEPTED by server', `${regs.length} call(s), all 2xx`);
    else fail('registration POSTs ACCEPTED by server', `${bad.length}/${regs.length} rejected: ${JSON.stringify(bad.slice(0, 2))}`);

    // Strongest form: server STATE, not a status code.
    const cat = await (
        await fetch(`${API}/translations?project_id=${PROJECT}&locale=en-US`, {
            headers: { 'x-Authorization': KEY_READ },
        })
    ).json();
    const landed = Object.keys(cat?.data?.E2E838 ?? {}).filter((k) => k.includes(RUN));
    landed.length >= 2
        ? pass('registered phrases present in catalog', `${landed.length} for run ${RUN}`)
        : fail('registered phrases present in catalog', `${landed.length} for run ${RUN} — server did not persist`);

    // Hints answer 204; anything else means the discovery lane is failing silently.
    const hintCalls = callsTo('discovery/hint');
    const badHints = hintCalls.filter((c) => c.status !== 204);
    if (!hintCalls.length) pass('hint lane: none issued this run', 'n/a (write-enabled session)');
    else if (!badHints.length) pass('hint POSTs answered 204', `${hintCalls.length} call(s)`);
    else fail('hint POSTs answered 204', JSON.stringify(badHints.slice(0, 2)));

    // Catch-all: no API call anywhere in the suite came back 4xx/5xx.
    const errs = apiCalls.filter((c) => c.status >= 400);
    errs.length === 0
        ? pass('no 4xx/5xx from the API across the whole suite', `${apiCalls.length} calls checked`)
        : fail('no 4xx/5xx from the API across the whole suite', JSON.stringify(errs.slice(0, 3)));
}

// ---------- TEST 12: params / interpolation / <Phrase> ----------
// Covers what v0.4.2–0.4.3 touched (interpolate.ts, phrase.ts, translate.ts and
// findUnusedParamKeys). Selects by text, not data-testid: <Translate> rewrites its
// subtree during tokenization and drops data-* attributes from descendants, so a
// testid hook inside it does not survive to the rendered DOM.
{
    const { p, msgs } = await newPage();
    await p.goto(`${BASE}/e2e/params`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(1500);
    const text = () => p.evaluate(() => document.body.innerText);

    const t1 = await text();
    /Welcome back, Sarah\. You have 3 new messages\./.test(t1)
        ? pass('<Translate params> substitutes %name% and %count%', 'Sarah / 3')
        : fail('<Translate params> substitutes %name% and %count%', t1.split('\n').find((l) => l.includes('Welcome')) ?? '?');

    await p.fill('#pname', 'Umberto');
    await p.locator('button:has-text("add message")').click();
    await p.waitForTimeout(700);
    const t2 = await text();
    /Welcome back, Umberto\. You have 4 new messages\./.test(t2)
        ? pass('setParams re-renders on param change', 'Umberto / 4')
        : fail('setParams re-renders on param change', t2.split('\n').find((l) => l.includes('Welcome')) ?? '?');

    /Based on 4 <?reviews/.test(t2.replace(/\s+/g, ' '))
        ? pass('<Phrase params> substitutes %n%', 'n=4')
        : fail('<Phrase params> substitutes %n%', t2.split('\n').find((l) => l.includes('Based on')) ?? '?');

    (await p.locator('p[data-ls-phrase] strong, [data-ls-phrase] strong').count()) >= 1 ||
    (await p.locator('strong:has-text("reviews")').count()) >= 1
        ? pass('<Phrase> inline markup reconstituted', '<strong> present in DOM')
        : fail('<Phrase> inline markup reconstituted', 'no <strong>');

    t2.includes('{missing}')
        ? pass('unknown placeholder stays canonical', '{missing}')
        : fail('unknown placeholder stays canonical', t2.split('\n').find((l) => l.includes('your code')) ?? '?');

    /Save 50% today — width: 100% supported/.test(t2)
        ? pass('literal % in prose untouched', '50% / 100%')
        : fail('literal % in prose untouched', t2.split('\n').find((l) => l.includes('Save 50')) ?? '?');

    msgs.some((m) => /unusedKey/.test(m.text))
        ? pass('unused param key warned (findUnusedParamKeys)', 'names unusedKey')
        : fail('unused param key warned (findUnusedParamKeys)', 'no console message named unusedKey');
}

await browser.close();

console.log('');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}  —  ${r.d}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
