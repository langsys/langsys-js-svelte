/**
 * Measures README.md's "Blocks the transform cannot read" table on the linked core: a block on the
 * core's DOM class, translated, then changed by Svelte. Hydrated (`/fixture/freeze`) and
 * client-only (`/fixture/freeze-csr`). Prints a table; asserts nothing.
 *
 *     npm run dev                                   # 127.0.0.1:5173, freshly started
 *     node _dev_/e2e/freeze.mjs                     # no API: the browser answers the page's requests
 *
 * What is measured is rendering, not what an API accepts, so the page's API requests are answered
 * inside the browser: a read-only session whose catalog holds the table's phrases in Italian.
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
const it = {
    'Branch one': 'Ramo uno',
    'Branch two': 'Ramo due',
    'First message': 'Primo messaggio',
    'Second message': 'Secondo messaggio',
    Waiting: 'In attesa',
    'Loaded text': 'Testo caricato',
    'Fixed text': 'Testo fisso',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// The API's answers for a read key on project p1, in its shapes.
const PROJECT = {
    id: 'p1',
    title: 'Freeze',
    base_locale: 'en-us',
    target_locales: ['it-it'],
    default_locales: { it: 'it-it' },
    key_type: 'read',
    write_enabled: false,
};
const answer = (path, locale) =>
    /^\/authorize-project\/[^/]+$/.test(path)
        ? { status: true, data: PROJECT }
        : path === '/translations'
          ? { status: true, write_enabled: false, discovery_base_locale_only: false, data: locale === 'it-it' ? { FRZ: it } : {} }
          : { status: true, data: [] };

const browser = await chromium.launch();
const ids = ['if', 'expr', 'store-expr', 'store-if', 'await', 'two-expr'];
for (const route of ['freeze', 'freeze-csr']) {
    const page = await browser.newPage();
    await page.route(
        (url) => url.pathname.startsWith('/__fx/api/'),
        (r) => {
            const url = new URL(r.request().url());
            const body = answer(url.pathname.slice('/__fx/api'.length), url.searchParams.get('locale'));
            return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        }
    );
    await page.goto(`${BASE}/fixture/${route}?key=k-public&locale=it-it`, { timeout: 90_000 });
    await page.waitForFunction(() => document.querySelector('[data-testid=fx-status]')?.textContent === 'ready', null, { timeout: 60_000 });
    await sleep(2500);
    const before = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, (await page.textContent(`#${id}`))?.trim()])));
    await page.evaluate(() => window.__freeze());
    await sleep(2500);
    const after = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, (await page.textContent(`#${id}`))?.trim()])));
    console.log(`\n${route}`);
    for (const id of ids) console.log(`  ${id.padEnd(11)} ${String(before[id]).padEnd(18)} → ${after[id]}`);
    await page.close();
}
await browser.close();
