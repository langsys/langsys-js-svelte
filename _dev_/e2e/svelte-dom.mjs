/**
 * What Svelte does to DOM text it holds, in real Chromium. Two groups, both about Svelte rather
 * than the core, and both prerequisites for rendering translated blocks.
 *
 * REACTIVITY (`/e2e/reactivity`, client-only). After the core translates a block, a later state
 * change must still reach the page: the core writes into the nodes Svelte holds. Covers a
 * `<Phrase>` wrapping an expression and an `<option>` in a two-token block (the path that runs the
 * select branch), each beside an in-place control under `<Translate>`.
 *
 * HYDRATION (`/e2e/hydration-facts`). The server rewrites the page's text as a translated block
 * would arrive; the client hydrates a plain render. Pins: static text is claimed as served; an
 * expression's text is rewritten to the client's value; a later state change reaches a node whose
 * value was rewritten in place, and does not reach a node that was replaced.
 *
 *     npm run dev                          # 127.0.0.1:5173, freshly started
 *     node _dev_/e2e/svelte-dom.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
const results = [];
const check = (c, n, d) => results.push({ ok: !!c, n, d });

const browser = await chromium.launch();
const page = async (path) => {
    const p = await (await browser.newContext()).newPage();
    p.setDefaultNavigationTimeout(90_000);
    const errors = [];
    p.on('pageerror', (e) => errors.push(String(e)));
    await p.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(500);
    return { p, errors };
};

// ---------- REACTIVITY ----------
{
    const { p, errors } = await page('/e2e/reactivity');
    const text = () =>
        p.evaluate(() =>
            Object.fromEntries(['phrase', 'phrase-control', 'option', 'option-control'].map((id) => [id, document.getElementById(id).textContent.trim()]))
        );

    const blocks = await p.evaluate(() => window.__reactivity.blocks());
    const RX = { __category__: 'RX', 'Hello Sarah': 'IT Hello Sarah', 'Pick Alpha': 'IT Pick Alpha', 'Choose one': 'IT Choose one' };
    for (const { id, tokens } of blocks) RX[id] = Object.fromEntries(tokens.map((t) => [t, `IT ${t}`]));
    check(
        blocks.some((b) => b.tokens.length === 2 && b.tokens.includes('Pick Alpha')),
        'premise: the option sits in a two-token block',
        JSON.stringify(blocks.map((b) => b.tokens))
    );
    await p.evaluate((catalog) => window.__reactivity.seed(catalog), { RX });
    await p.waitForTimeout(500);

    const translated = await text();
    check(
        Object.values(translated).every((t) => t.includes('IT ')),
        'premise: every case is translated before the change',
        JSON.stringify(translated)
    );

    await p.evaluate(() => window.__reactivity.change());
    await p.waitForTimeout(500);
    const after = await text();
    check(after['phrase-control'].includes('Bob'), 'control: an expression under <Translate> updates after translation', after['phrase-control']);
    check(after.phrase.includes('Bob'), '<Phrase>: an expression inside it updates after translation', after.phrase);
    check(after['option-control'].includes('Beta'), 'control: an expression in a two-token block updates after translation', after['option-control']);
    check(after.option.includes('Beta'), '<option> in a two-token block: its expression updates after translation', after.option);
    check(!errors.length, 'no page errors (reactivity)', JSON.stringify(errors.slice(0, 2)));
}

// ---------- HYDRATION ----------
const T = (p, id) =>
    p
        .locator(`[data-testid="${id}"]`)
        .textContent()
        .then((s) => s.trim());
{
    const served = await (await fetch(`${BASE}/e2e/hydration-facts`)).text();
    check(served.includes('>Ciao amico<') && served.includes('>Benvenuto<'), 'premise: the served HTML carries the rewritten text', 'Ciao amico, Benvenuto');

    const { p, errors } = await page('/e2e/hydration-facts');
    check((await T(p, 'static')) === 'Ciao amico', 'hydration: static text is claimed as served', await T(p, 'static'));
    check((await T(p, 'nested')) === 'Testo annidato', 'hydration: a nested component’s static text is claimed as served', await T(p, 'nested'));
    check((await T(p, 'expr')) === 'Welcome', 'hydration: an expression’s text is rewritten to the client value', await T(p, 'expr'));
    check((await T(p, 'where')) === 'client', 'control: an expression that differs by environment reads the client value', await T(p, 'where'));

    await p.locator('[data-testid="btn"]').click();
    await p.waitForTimeout(200);
    check((await T(p, 'clicks')) === '1', 'hydration: an event handler inside rewritten markup works', await T(p, 'clicks'));

    // In place: write the expression's text node value, then change state — the change must land.
    await p.evaluate(() => {
        const node = [...document.querySelector('[data-testid="expr"]').childNodes].find((n) => n.nodeType === 3);
        node.nodeValue = 'Willkommen';
    });
    await p.evaluate(() => window.__hydration.setGreeting('Welcome back'));
    await p.waitForTimeout(150);
    check((await T(p, 'expr')) === 'Welcome back', 'a state change reaches a node whose value was rewritten in place', await T(p, 'expr'));

    // Replaced: swap the node for a new one, then change state — the change is lost.
    await p.evaluate(() => {
        const node = [...document.querySelector('[data-testid="expr"]').childNodes].find((n) => n.nodeType === 3);
        node.replaceWith(document.createTextNode('Willkommen'));
    });
    await p.evaluate(() => window.__hydration.setGreeting('Welcome again'));
    await p.waitForTimeout(150);
    check((await T(p, 'expr')) === 'Willkommen', 'a state change does NOT reach a node that was replaced', await T(p, 'expr'));
    check(!errors.length, 'no page errors (hydration)', JSON.stringify(errors.slice(0, 2)));

    const { p: plain } = await page('/e2e/hydration-facts?plain=1');
    check((await T(plain, 'static')) === 'Hello friend', 'control: unrewritten, the same page hydrates to source', await T(plain, 'static'));
}

await browser.close();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}  —  ${r.d}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
