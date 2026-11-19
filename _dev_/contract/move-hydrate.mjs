/**
 * MOVE-4, MOVE-5 — content moved to another category is served from its previous category's
 * entries, its hosts stamped with where it was filled from, and a client hydrating it against a
 * catalog with nothing under the new category keeps the translated text: from the first paint to
 * after `init()` has fetched the catalog. Through `createLangsysHandle`, in Chromium, against an SDK
 * test clone through the contract fixture's forwarder.
 *
 *     SRV_API=http://127.0.0.1:8787/api SRV_PROJECT=… SRV_KEY=… LANGSYS_FX_PORT=8787 npm run dev   # fresh
 *     node _dev_/contract/move-hydrate.mjs          # starts the forwarder on 8787 itself
 *
 * One case (`cases.mjs`, suite 8, case 2): `Buy now`, `Sign in`, `Not moved` and a two-paragraph
 * block under `Header` and `Plain buy` with no category, each in es-es, and nothing under
 * `Checkout`. `/fixture/var/move` writes them under `Checkout`, moved from `Header` (or from no
 * category), and `Not moved` with no move, the control. Both the server and the browser use the
 * case's read key, so nothing registers and the catalog stays as seeded: it never holds the
 * current category.
 */
import { chromium } from 'playwright';
import { generateCustomId } from 'langsys-js-typescript';
import { caseOf } from './cases.mjs';
import { startClone } from './clone.mjs';

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';

const results = [];
const check = (c, n, d) => results.push({ ok: !!c, n, d });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (html) => html.replace(/<!--[^]*?-->/g, '');

const fx = await startClone();
const c = caseOf(8, 2);
const project = c.projects.app;
const HEADER_BLOCK = generateCustomId('Header', ['Moved block', 'Second paragraph']);
const CHECKOUT_BLOCK = generateCustomId('Checkout', ['Moved block', 'Second paragraph']);
/** The source text the moved content must never show. */
const SOURCE = ['Buy now', 'Sign in', 'Moved block', 'Second paragraph', 'Plain buy'];

const held = await fx.held(c.keys.read.key, project.id, 'es-es');
check(
    !held.categories.Checkout && !(CHECKOUT_BLOCK in held.blocks) && (held.categories.Header ?? []).includes('Buy now') && HEADER_BLOCK in held.blocks,
    'premise: the catalog holds the content under Header and nothing under Checkout',
    JSON.stringify(held)
);

const url = `${BASE}/fixture/var/move?project=${project.id}&key=${c.keys.read.key}&locale=es-es`;
// The raw bytes go to the browser, Svelte's hydration comments and all; the checks read them without.
const raw = await (await fetch(url)).text();
const served = strip(raw);
check(
    new RegExp(`<div[^>]*data-ls-contentblock="${CHECKOUT_BLOCK}"[^>]*>`).test(served) &&
        new RegExp(`<div[^>]*data-ls-previous-contentblock="${HEADER_BLOCK}"[^>]*><p>Bloque movido</p>\\s*<p>Segundo párrafo</p></div>`).test(served),
    'MOVE-5: the moved block is served with its current id and the previous id it was filled from',
    served.match(/<div[^>]*data-ls-contentblock[^>]*>.*?<\/div>/s)?.[0]
);
check(
    /<p[^>]*data-ls-previous-category="Header"[^>]*>Comprá ya<\/p>/.test(served) && /<p[^>]*data-ls-previous-category=""[^>]*>Compra simple<\/p>/.test(served),
    'MOVE-5: a moved phrase\'s host names the category it was filled from, "" for none',
    served.match(/<p[^>]*data-ls-phrase[^>]*>[^<]*<\/p>/g)?.join(' ')
);
check(
    served.includes('<p id="call">Ingresá</p>'),
    "MOVE-4: a $t() call moved with inCategory() is served from Header's entry",
    served.match(/<p id="call">[^<]*<\/p>/)?.[0]
);
check(
    /<p(?![^>]*data-ls-previous)[^>]*>Not moved<\/p>/.test(served),
    'control: content Header holds, written under Checkout with no move, is served as its source'
);

const browser = await chromium.launch();
const page = await browser.newPage();
const warnings = [];
page.on('console', (m) => {
    if (m.type() === 'warning' || m.type() === 'error') warnings.push(m.text());
});
// Every text the page shows from its first parse, so a source flash between paint and init() is seen.
await page.addInitScript((source) => {
    const seen = new Set();
    const look = () => {
        for (const s of source) if (document.body?.textContent?.includes(s)) seen.add(s);
    };
    new MutationObserver(look).observe(document, { subtree: true, childList: true, characterData: true });
    document.addEventListener('DOMContentLoaded', look);
    window.__sourceSeen = seen;
}, SOURCE);
await page.route(url, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: raw }));
await page.goto(url);
await page.waitForFunction(() => document.querySelector('[data-testid=fx-status]')?.textContent === 'ready', null, { timeout: 60_000 });
// Past init(): its catalog fetch has published, and whatever it re-renders has rendered.
await sleep(3000);

const text = await page.evaluate(() => document.body.textContent ?? '');
check(
    ['Comprá ya', 'Ingresá', 'Bloque movido', 'Segundo párrafo', 'Compra simple'].every((s) => text.includes(s)),
    "MOVE-5: after hydration and init()'s catalog, the moved content still shows Header's translations",
    text.replace(/\s+/g, ' ').slice(0, 400)
);
const seen = await page.evaluate(() => [...window.__sourceSeen]);
check(seen.length === 0, 'MOVE-4: the moved content never showed its source, from the first paint on', JSON.stringify(seen));
check(text.includes('Not moved'), 'control: the content with no move shows its source in the browser too');
const block = await page.evaluate(() => {
    const el = document.querySelector('[data-ls-previous-contentblock]');
    return el ? { current: el.getAttribute('data-ls-contentblock'), previous: el.getAttribute('data-ls-previous-contentblock') } : null;
});
check(
    block?.current === CHECKOUT_BLOCK && block?.previous === HEADER_BLOCK,
    'MOVE-5: the hydrated host keeps both ids, as the catalog still lacks the current one',
    JSON.stringify(block)
);
const mismatches = warnings.filter((w) => /hydration/i.test(w));
check(mismatches.length === 0, 'the page hydrates the served bytes with no hydration warning', JSON.stringify(mismatches));

await browser.close();
await fx.stop();
console.log('');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}${r.ok || r.d === undefined ? '' : `\n      ${r.d}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
