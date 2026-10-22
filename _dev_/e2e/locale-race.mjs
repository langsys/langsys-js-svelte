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
const PHRASE = 'Layout phrase race';
const CATALOG = { method: 'GET', path: '/translations' };

const fx = await startClone();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (c, n, d) => results.push({ ok: !!c, n, d });

try {
    const browser = await chromium.launch();

    async function race(c, first, second, secondFault) {
        const page = await browser.newPage();
        // a cold dev server compiles on first request
        await page.goto(`${BASE}/fixture/a?case=race&project=${c.projects.app.id}&key=${c.keys.read.key}`, { timeout: 90_000 });
        await page.waitForFunction(() => document.querySelector('[data-testid=fx-status]')?.textContent === 'ready', null, { timeout: 60_000 });
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
        return { shown, stored };
    }

    const a = await race(caseOf(6, 1), 'fr-fr', 'de-de', { status: 500 });
    check(a.shown === PHRASE, 'fr overtaken by a failing de: the page shows source text, not the late French', a.shown);
    check(!a.stored.some(([, v]) => /Bonjour|Hallo/.test(v ?? '')), 'fr overtaken by a failing de: nothing is stored under de-de', JSON.stringify(a.stored));

    const b = await race(caseOf(6, 2), 'it-it', 'pt-pt', null);
    check(b.shown === 'Olá', 'it overtaken by a succeeding pt: the page shows Portuguese, not the late Italian', b.shown);
    check(
        b.stored.some(([, v]) => /Olá/.test(v ?? '')) && !b.stored.some(([, v]) => /Ciao/.test(v ?? '')),
        'it overtaken by pt: pt-pt stores its own catalog',
        JSON.stringify(b.stored).slice(0, 300)
    );

    await browser.close();
} finally {
    await fx.stop();
}

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}${r.ok || r.d === undefined ? '' : `\n      ${r.d}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
