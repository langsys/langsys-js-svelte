/**
 * Binding rows graded `contract` — run in a real browser, through SvelteKit's own router,
 * against the shared contract double (`contract-fixture/`, vendored byte-exact from
 * langsys-js-typescript). Assertions read the double's ACCEPTED state, never requests.
 *
 *     npm run dev                                   # terminal 1, 127.0.0.1:5173, fresh
 *     node _dev_/contract/verify-contract.mjs       # terminal 2 — starts the double itself
 *
 * The double listens on 127.0.0.1:8787, and the testbed reaches it through the dev server's
 * same-origin `/__fx` proxy, because the double sends no CORS headers. No `.env`, no API.
 *
 * HINT-13 waits out the SDK's 5–30s report jitter once, with both cases in flight together.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
const FIXTURE_PORT = 8787;
const JITTER_WAIT_MS = 40_000;

const results = [];
const pass = (n, d) => results.push({ ok: true, n, d });
const fail = (n, d) => results.push({ ok: false, n, d });
const check = (cond, n, d) => (cond ? pass(n, d) : fail(n, d));

// ---------- the double ----------
const fx = spawn(process.execPath, [join(ROOT, 'contract-fixture/server.mjs'), '--port', String(FIXTURE_PORT)], { stdio: ['ignore', 'pipe', 'inherit'] });
const ready = await new Promise((resolve, reject) => {
    fx.stdout.on('data', (b) => {
        const line = b
            .toString()
            .split('\n')
            .find((l) => l.includes('"ready"'));
        if (line) resolve(JSON.parse(line));
    });
    fx.on('exit', (code) => reject(new Error(`contract double exited (${code}) — is port ${FIXTURE_PORT} free?`)));
});
const FX = ready.fixture_url;
const seed = (doc) => fetch(`${FX}/seed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(doc) });
const state = async () => (await fetch(`${FX}/state`)).json();

await seed({
    // An ip_write key needs a renderer egress address configured for its hints to be stored.
    config: { renderer_egress_ips: ['10.9.9.9'] },
    projects: [
        {
            id: 'p1',
            base_locale: 'en-us',
            target_locales: ['es-es'],
            website_url: 'http://127.0.0.1',
            // Registered, so NOT misses: case 1's page-A phrase, case 2's layout phrase.
            phrases: [
                { category: 'FX', phrase: 'Page A only 1' },
                { category: 'FX', phrase: 'Layout phrase 2' },
            ],
        },
    ],
    keys: [
        // Read-only from 127.0.0.1 and permitted to report: misses become hints.
        { key: 'k-public', project: 'p1', type: 'ip_write', report_discovered_content: true },
        // May write: misses register.
        { key: 'k-writer', project: 'p1', type: 'write' },
    ],
});

const browser = await chromium.launch();

async function open(path) {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await p.waitForFunction(() => document.querySelector('[data-testid="fx-status"]')?.textContent !== 'idle', null, { timeout: 10_000 });
    return p;
}

// ---------- HINT-13: a persistent layout is reported for page B ----------
// case 1 — the layout phrase misses; page A's own phrase is registered.
// case 2 — CONTROL: the layout phrase is registered; only page A's own phrase misses, and
//          the navigation unmounts it. Nothing may be recorded for B.
async function navigateAtoB(testCase) {
    const p = await open(`/fixture/a?key=k-public&case=${testCase}`);
    const initStatus = await p.locator('[data-testid="fx-status"]').textContent();
    await p.evaluate(() => (window.__fxLayoutProbe = 'mounted'));
    await p.locator('[data-testid="fx-to-b"]').click();
    await p.waitForURL('**/fixture/b**', { timeout: 5000 }).catch(() => {});
    await p
        .locator('[data-testid="fx-b"]')
        .waitFor({ timeout: 5000 })
        .catch(() => {});
    return {
        initStatus,
        moved: await p.evaluate(() => window.location.pathname),
        layoutPersisted: await p.evaluate(() => window.__fxLayoutProbe === 'mounted'),
        pageRendered: (await p.locator('[data-testid="fx-b"]').count()) === 1,
    };
}

// ---------- GATE-10: the wrappers hand the core a host it can walk up from ----------
async function gate10() {
    const p = await open('/fixture/gate10?key=k-writer&case=g');
    const initStatus = await p.locator('[data-testid="fx-status"]').textContent();
    await p.waitForTimeout(4000); // past the registration debounce
    const identity = await p.evaluate(() => {
        const id = window.__lsIdentity;
        const host = document.querySelector('[data-testid="g10-resolved"]')?.parentElement;
        if (!id || !host) return null;
        return {
            stamped: host.getAttribute(id.CONTENT_BLOCK_MARKER_ATTR),
            derived: id.generateCustomId('FX', id.tokenizeElement(host).tokens),
        };
    });
    return { initStatus, identity };
}

// Warm-up: a cold dev server compiles on first request and may re-optimise its dependencies
// with a full reload. One throwaway load absorbs that, so no case starts against a page
// that is about to reload itself.
{
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(`${BASE}/fixture/b?key=k-public&case=warmup`, { waitUntil: 'networkidle' });
    await p.waitForFunction(() => document.querySelector('[data-testid="fx-status"]')?.textContent !== 'idle', null, { timeout: 60_000 });
    await ctx.close();
}

const [c1, c2, g10] = await Promise.all([navigateAtoB(1), navigateAtoB(2), gate10()]);

// GATE-10 reads now: registration has flushed and the hint jitter has not been waited out.
{
    const s = await state();
    const items = [...s.projects.p1.phrases, ...s.projects.p1.blocks].map((x) => JSON.stringify(x));
    const registered = (word) => items.some((x) => x.includes(word));

    check(g10.initStatus === 'ready', 'GATE-10 premise: the writer session initialised against the double', g10.initStatus);
    check(registered('epsilon'), 'GATE-10 control: an unmarked <Translate> block registers', 'epsilon');
    check(registered('Unmarked phrase'), 'GATE-10 control: an unmarked <Phrase> registers', 'Unmarked phrase');
    check(!registered('alpha'), 'GATE-10: data-ls-resolved on the parent suppresses a <Translate> block', 'alpha absent');
    check(!registered('beta'), 'GATE-10: the data-langsys-resolved spelling suppresses too', 'beta absent');
    check(!registered('gamma'), 'GATE-10: a resolved ancestor three levels up suppresses (inheritance)', 'gamma absent');
    check(registered('delta'), 'GATE-10: data-ls-resolved="false" opts back out, and registers', 'delta');
    check(registered('zeta'), 'GATE-10 negative control: a bare $t() under a resolved ancestor still registers (not a DOM reader)', 'zeta');
    check(!registered('Resolved phrase'), 'GATE-10: a resolved ancestor suppresses a <Phrase>', 'Resolved phrase absent');
    check(
        g10.identity?.stamped && g10.identity.stamped === g10.identity.derived,
        'GATE-10: a block inside a resolved subtree keeps its id (stamp equals the re-derived id)',
        JSON.stringify(g10.identity)
    );
}

await new Promise((r) => setTimeout(r, JITTER_WAIT_MS));

{
    const hints = (await state()).hints.map((h) => h.url);
    const has = (path) => hints.some((u) => u.includes(path));

    for (const [c, r] of [
        [1, c1],
        [2, c2],
    ]) {
        check(r.initStatus === 'ready', `HINT-13 case ${c} premise: the read-only session initialised against the double`, r.initStatus);
        check(r.moved === '/fixture/b', `HINT-13 case ${c} control: the page's own location moved to B`, r.moved);
        check(r.pageRendered, `HINT-13 case ${c} control: page B rendered in the layout's slot`, String(r.pageRendered));
        check(r.layoutPersisted, `HINT-13 case ${c} premise: the layout stayed mounted (client-side navigation)`, String(r.layoutPersisted));
        check(has(`/fixture/a?case=${c}`), `HINT-13 case ${c} premise: a hint is stored for page A`, JSON.stringify(hints));
    }
    check(has('/fixture/b?case=1'), 'HINT-13: the persistent layout’s miss is stored for page B', JSON.stringify(hints));
    check(!has('/fixture/b?case=2'), 'HINT-13 control: page-A-only content, unmounted by the navigation, records nothing at B', JSON.stringify(hints));
}

await browser.close();
fx.kill();

console.log('');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}  —  ${r.d}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
