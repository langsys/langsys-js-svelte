/**
 * A locale switch overtaken by another, through this binding in a real browser (CACHE-1, CACHE-2).
 *
 * The user picks one locale and, before its catalog arrives, picks another. The page must end on
 * the second choice, never on the first one's late answer, and nothing may be stored under the
 * second locale but its own catalog. Against an SDK test clone through the contract fixture's
 * forwarder, whose faults answer the first catalog request late and the second one as the case
 * needs:
 *
 *   - a slow `fr-fr` overtaken by a `de-de` that FAILS: the page shows source text and nothing is
 *     stored under `de-de`;
 *   - a slow `it-it` overtaken by a `pt-pt` that SUCCEEDS: the page shows Portuguese.
 *
 *     LANGSYS_FX_PORT=8787 npm run dev              # 127.0.0.1:5173, freshly started
 *     node _dev_/e2e/locale-race.mjs                # starts the forwarder on 8787 itself
 *
 * The faults go to the case's next catalog requests in order, whichever they are, so the faults go
 * in only once the page's own requests have settled, and each race asserts its premise from what
 * the browser saw: the first catalog request after that was the first locale's, answered late, and
 * the next the second locale's, answered as the case says and before it. A race whose premise is
 * not met fails on the premise, and its other checks are not evaluated.
 *
 * Each race is a case of its own on the clone (`_dev_/contract/cases.mjs`, suite 6), whose catalog
 * holds the layout's phrase in all four locales.
 * The locale store is switched through the fixture layout's `__fxSetLocale`, the way an app's
 * locale picker sets its `Writable`.
 */
import { chromium } from 'playwright';
import { caseOf } from '../contract/cases.mjs';
import { startClone } from '../contract/clone.mjs';

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
const SLOW_MS = 2500;
const SETTLE_MS = 1000;
const PHRASE = 'Layout phrase race';
const CATALOG = { method: 'GET', path: '/translations' };

const fx = await startClone();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (c, n, d) => results.push({ ok: !!c, n, d });
const skip = (n) => results.push({ ok: false, skipped: true, n });

/**
 * Every request the page sends to the API, in the order sent, with when it was answered and how.
 * `catalog` marks the ones the case's faults match: GET on the catalog route itself.
 */
function recordApi(page) {
    const api = [];
    page.on('request', (r) => {
        const url = new URL(r.url());
        if (!url.pathname.startsWith('/__fx/api/')) return;
        const catalog = r.method() === CATALOG.method && url.pathname === `/__fx/api${CATALOG.path}`;
        api.push({ r, catalog, locale: url.searchParams.get('locale'), sent: Date.now(), done: null, status: null });
    });
    const answered = (r, status) => {
        const e = api.find((x) => x.r === r);
        if (e && e.done === null) Object.assign(e, { done: Date.now(), status });
    };
    page.on('response', (res) => answered(res.request(), res.status()));
    page.on('requestfailed', (r) => answered(r, 'failed'));
    return api;
}

/** Whether the page's requests settle: none in flight, and none sent for SETTLE_MS. */
async function settle(api, timeout = 20_000) {
    for (const start = Date.now(); Date.now() - start < timeout; await sleep(100)) {
        const last = Math.max(0, ...api.map((e) => e.done ?? e.sent));
        if (api.every((e) => e.done !== null) && Date.now() - last >= SETTLE_MS) return true;
    }
    return false;
}

try {
    const browser = await chromium.launch();

    async function race(c, first, second, secondFault) {
        const page = await browser.newPage();
        const api = recordApi(page);
        // a cold dev server compiles on first request
        await page.goto(`${BASE}/fixture/a?case=race&project=${c.projects.app.id}&key=${c.keys.read.key}`, { timeout: 90_000 });
        await page.waitForFunction(() => document.querySelector('[data-testid=fx-status]')?.textContent === 'ready', null, { timeout: 60_000 });
        const settled = await settle(api);
        const from = api.length;
        // From here on: the first catalog request is answered late, the second as the case says.
        await fx.update(c, { faults: [{ ...CATALOG, delay_ms: SLOW_MS, times: 1 }, ...(secondFault ? [{ ...CATALOG, ...secondFault, times: 1 }] : [])] });
        await page.evaluate((l) => window.__fxSetLocale(l), first);
        await sleep(300);
        await page.evaluate((l) => window.__fxSetLocale(l), second);
        await sleep(SLOW_MS + 1500); // past the first locale's late answer
        const shown = await page.textContent('[data-testid=fx-layout]');
        const stored = await page.evaluate(
            (l) =>
                Object.keys(localStorage)
                    .filter((k) => k.endsWith(`:${l}`))
                    .map((k) => [k, localStorage.getItem(k)]),
            second
        );
        await page.close();
        const catalog = api.slice(from).filter((e) => e.catalog);
        return { shown, stored, settled, catalog };
    }

    /**
     * One race's checks, behind its premise: the page's own requests settled before the faults
     * went in, the first catalog request after that was `first`'s and was answered late, and the
     * next was `second`'s, answered with `status` before it.
     */
    function raced(r, name, first, second, status, checks) {
        const [a, b] = r.catalog;
        const met =
            r.settled &&
            a?.locale === first &&
            a.done !== null &&
            a.done - a.sent >= SLOW_MS - 250 &&
            b?.locale === second &&
            b.status === status &&
            b.done !== null &&
            b.done < a.done;
        const seen = {
            settled: r.settled,
            catalog: r.catalog.map((e) => ({ locale: e.locale, status: e.status, ms: e.done === null ? null : e.done - e.sent })),
        };
        check(
            met,
            `${name}: premise: ${first} answered late, then ${second} with ${status} before it, the page's own requests settled first`,
            JSON.stringify(seen)
        );
        for (const [c, n, d] of checks) {
            if (met) check(c, `${name}: ${n}`, d);
            else skip(`${name}: ${n}`);
        }
    }

    const a = await race(caseOf(6, 1), 'fr-fr', 'de-de', { status: 500 });
    raced(a, 'fr overtaken by a failing de', 'fr-fr', 'de-de', 500, [
        [a.shown === PHRASE, 'the page shows source text, not the late French', a.shown],
        [!a.stored.some(([, v]) => /Bonjour|Hallo/.test(v ?? '')), 'nothing is stored under de-de', JSON.stringify(a.stored)],
    ]);

    const b = await race(caseOf(6, 2), 'it-it', 'pt-pt', null);
    raced(b, 'it overtaken by a succeeding pt', 'it-it', 'pt-pt', 200, [
        [b.shown === 'Olá', 'the page shows Portuguese, not the late Italian', b.shown],
        [
            b.stored.some(([, v]) => /Olá/.test(v ?? '')) && !b.stored.some(([, v]) => /Ciao/.test(v ?? '')),
            'pt-pt stores its own catalog',
            JSON.stringify(b.stored).slice(0, 300),
        ],
    ]);

    await browser.close();
} finally {
    await fx.stop();
}

const label = (r) => (r.skipped ? 'SKIP' : r.ok ? 'PASS' : 'FAIL');
for (const r of results)
    console.log(`${label(r)}  ${r.n}${r.skipped ? '  (not evaluated: the premise was not met)' : r.ok || r.d === undefined ? '' : `\n      ${r.d}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
