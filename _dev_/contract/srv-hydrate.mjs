/**
 * SRV-7, SRV-1 — a block the server rendered and did not send lands under the id the server
 * rendered into the seed, once the hydrated client registers it. Through `createLangsysHandle`, in
 * Chromium, against an SDK test clone through the contract fixture's forwarder.
 *
 *     SRV_API=http://127.0.0.1:8787/api SRV_PROJECT=… SRV_KEY=… LANGSYS_FX_PORT=8787 npm run dev   # fresh
 *     node _dev_/contract/srv-hydrate.mjs           # starts the forwarder on 8787 itself
 *
 * One case (`cases.mjs`, suite 5), one project with two keys. The server renders `/fixture/var`
 * under the read key (`server_key`), so its scope sends nothing after the response and its seed
 * marks nothing collected; the browser hydrates those same served bytes under the write key and
 * registers what the page rendered. The catalog is then read back: every block the server's seed
 * names is held under the server's id, with the phrases the seed gives it, and no other block holds
 * them, so none landed under an id the client computed. A block of one sentence has the seed's
 * `phrase` shape and registers as a phrase of its category (TOK-6), so it is read there. The
 * content each block stored is read as the project's owner reads it: its own markup, with each of
 * its phrases, and none of Svelte's hydration comments.
 */
import { chromium } from 'playwright';
import { caseOf } from './cases.mjs';
import { startClone } from './clone.mjs';

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';

const results = [];
const check = (c, n, d) => results.push({ ok: !!c, n, d });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sorted = (list) => [...list].sort();

const fx = await startClone();
const c = caseOf(5, 1);
const project = c.projects.app;
const held = () => fx.held(c.keys.browser.key, project.id, 'it-it');

const url = `${BASE}/fixture/var?user=Ana&project=${project.id}&key=${c.keys.browser.key}&server_key=${c.keys.server.key}`;
const served = await (await fetch(url)).text();
const seed = JSON.parse(served.match(/window\.__LANGSYS_SEED__=(\{[^]*?\})<\/script>/)?.[1] ?? '{}');
// What the server rendered for the client to register: every block its seed names but a read.
const rendered = Object.entries(seed.blocks ?? {}).filter(([, b]) => b.register !== false);
const blocks = rendered.filter(([, b]) => b.shape === 'block');
const ids = blocks.map(([id]) => id);
const phrases = rendered.filter(([, b]) => b.shape === 'phrase').map(([, b]) => ({ category: b.category, phrase: b.tokens[0] }));
/** Whether a catalog read holds a phrase-shaped block's phrase in its category. */
const holdsPhrase = (held, { category, phrase }) => (held.categories[category] ?? []).includes(phrase);

check(
    phrases.some((p) => p.phrase === 'Hello {name}, welcome back') && blocks.some(([, b]) => b.tokens.includes('Add one')),
    'premise: the seed names what the server rendered, of both shapes',
    JSON.stringify(rendered.map(([, b]) => [b.shape, b.tokens]))
);
check(
    rendered.every(([, b]) => !b.collected) && (seed.phrases ?? []).every((p) => !p.collected),
    'premise: the server’s read key sends nothing, so the seed marks nothing collected',
    JSON.stringify(rendered.filter(([, b]) => b.collected).map(([id]) => id))
);
// Past the scope's close and the API's write: the server sent nothing.
await sleep(4000);
const before = await held();
check(
    ids.every((id) => !(id in before.blocks)) && !phrases.some((p) => holdsPhrase(before, p)),
    'premise: before the browser, the catalog holds none of what the server rendered',
    JSON.stringify({ blocks: Object.keys(before.blocks), phrases: before.phrases })
);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.route(url, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: served }));
await page.goto(url);
await page.waitForFunction(() => document.querySelector('[data-testid=fx-status]')?.textContent === 'ready', null, { timeout: 60_000 });
check((await page.textContent('#greet')) === 'Hello Ana, welcome back', 'premise: the page hydrated the served bytes', await page.textContent('#greet'));

const landed = (h) => ids.every((id) => id in h.blocks) && phrases.every((p) => holdsPhrase(h, p));
let after = before;
for (let i = 0; i < 30 && !landed(after); i++) {
    await sleep(2000);
    after = await held();
}
const missing = ids.filter((id) => !(id in after.blocks));
check(
    missing.length === 0,
    'SRV-1, SRV-7: once the client registers it, each block the server rendered is served under the id the server rendered into the seed',
    JSON.stringify(missing)
);
const differing = blocks.filter(([id, b]) => id in after.blocks && JSON.stringify(after.blocks[id]) !== JSON.stringify(sorted(b.tokens)));
check(
    differing.length === 0,
    'SRV-7: each is held with the phrases the seed gives it',
    JSON.stringify(differing.map(([id, b]) => ({ id, seed: b.tokens, held: after.blocks[id] })))
);
const unheld = phrases.filter((p) => !holdsPhrase(after, p));
check(unheld.length === 0, 'SRV-7: each block of one sentence the server rendered is held as a phrase of its category', JSON.stringify(unheld));
const tokens = new Set(rendered.flatMap(([, b]) => b.tokens));
const elsewhere = Object.entries(after.blocks).filter(([id, held]) => !ids.includes(id) && held.some((p) => tokens.has(p)));
check(elsewhere.length === 0, 'SRV-7: nothing the server rendered lands in a block under an id the client computed', JSON.stringify(elsewhere));

const stored = (await fx.storedBlocks(project, c.keys.browser.key, 'it-it')).filter((b) => ids.includes(b.custom_id));
check(stored.length === ids.length, 'premise: the owner reads each block’s stored content', `${stored.length} of ${ids.length}`);
// A phrase's text, its inline markup's numbered tags aside, as its block's markup holds it.
const fragments = (phrase) =>
    phrase
        .split(/<\/?\d+\/?>/)
        .map((f) => f.trim())
        .filter(Boolean);
const withoutMarkup = stored.filter((b) => !(seed.blocks[b.custom_id]?.tokens ?? []).every((t) => fragments(t).every((f) => (b.content ?? '').includes(f))));
check(
    withoutMarkup.length === 0,
    'SRV-7: the content each block registered is its markup, holding each of its phrases',
    JSON.stringify(withoutMarkup.map((b) => ({ id: b.custom_id, content: b.content, tokens: seed.blocks[b.custom_id]?.tokens })))
);
// Svelte's hydration anchors (`<!--[-->`, `<!--[!-->`, an indexed `<!--[0-->`, `<!--]-->`, `<!---->`)
// and the value markers (`<!--ls:NAME-->`, `<!--/ls-->`).
const HYDRATION_OR_MARKER = /<!--(?:\[[!0-9-]*|\]|)-->|<!--ls:|<!--\/ls-->/;
const hydrationMarks = stored.filter((b) => HYDRATION_OR_MARKER.test(b.content ?? ''));
check(hydrationMarks.length === 0, 'SRV-7: the content each registered holds no hydration comment or value marker', JSON.stringify(hydrationMarks));

await browser.close();
await fx.stop();
console.log('');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}${r.ok || r.d === undefined ? '' : `\n      ${r.d}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
