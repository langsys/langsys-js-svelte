/**
 * HINT-13 against the contract fixture (CONF-2): in a real browser, through SvelteKit's own router,
 * against an SDK test clone through `contract-fixture/forwarder.mjs`, vendored byte-exact from
 * langsys-js-typescript. Assertions read the hints the clone ACCEPTED, never requests.
 *
 *     LANGSYS_FX_PORT=8787 npm run dev              # terminal 1, freshly started
 *     node _dev_/contract/verify-contract.mjs       # terminal 2 — starts the forwarder on 8787 itself
 *
 * Each case is seeded with a project of its own (`cases.mjs`, suite 1): a read-only key permitted to
 * report, whose misses become hints, from an address its allow-list does not hold. The testbed
 * reaches the forwarder through the dev server's same-origin `/__fx` proxy.
 *
 * HINT-13 waits out the SDK's 5–30s report jitter once, with both cases in flight together.
 */
import { chromium } from 'playwright';
import { caseOf } from './cases.mjs';
import { startClone } from './clone.mjs';

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
const JITTER_WAIT_MS = 40_000;

const results = [];
const check = (c, n, d) => results.push({ ok: !!c, n, d });

const fx = await startClone();
const CASES = { 1: caseOf(1, 1), 2: caseOf(1, 2) };
const query = (n) => `case=${n}&project=${CASES[n].projects.app.id}&key=${CASES[n].keys.reporter.key}`;

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
//          the navigation unmounts it. Nothing may be stored for B.
async function navigateAtoB(n) {
    const p = await open(`/fixture/a?${query(n)}`);
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

// Warm-up: a cold dev server compiles on first request and may re-optimise its dependencies
// with a full reload. One throwaway load absorbs that, so no case starts against a page
// that is about to reload itself. It names no case, so the forwarder refuses its requests.
{
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(`${BASE}/fixture/b?key=warmup&case=warmup`, { waitUntil: 'networkidle' });
    await p.waitForFunction(() => document.querySelector('[data-testid="fx-status"]')?.textContent !== 'idle', null, { timeout: 60_000 });
    await ctx.close();
}

const runs = await Promise.all([navigateAtoB(1), navigateAtoB(2)]);

await new Promise((r) => setTimeout(r, JITTER_WAIT_MS));

/** Whether a stored hint names this page for this case: its path, and the case in its query. */
const hintFor = (hints, path, n) =>
    hints.some(({ url }) => {
        const u = new URL(url);
        return u.pathname === path && u.searchParams.get('case') === String(n);
    });

for (const [i, r] of runs.entries()) {
    const n = i + 1;
    const hints = await fx.hints(CASES[n]);
    const urls = JSON.stringify(hints.map((h) => h.url));
    check(r.initStatus === 'ready', `HINT-13 case ${n} premise: the read-only session initialised against the clone`, r.initStatus);
    check(r.moved === '/fixture/b', `HINT-13 case ${n} control: the page's own location moved to B`, r.moved);
    check(r.pageRendered, `HINT-13 case ${n} control: page B rendered in the layout's slot`, String(r.pageRendered));
    check(r.layoutPersisted, `HINT-13 case ${n} premise: the layout stayed mounted (client-side navigation)`, String(r.layoutPersisted));
    check(hintFor(hints, '/fixture/a', n), `HINT-13 case ${n} premise: the clone stored a hint for page A`, urls);
    if (n === 1) check(hintFor(hints, '/fixture/b', n), 'HINT-13: the persistent layout’s miss is stored for page B', urls);
    else check(!hintFor(hints, '/fixture/b', n), 'HINT-13 control: page-A-only content, unmounted by the navigation, records nothing at B', urls);
}

await browser.close();
await fx.stop();

console.log('');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}  —  ${r.d}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
