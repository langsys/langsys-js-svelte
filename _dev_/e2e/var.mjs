/**
 * VAR — variables in registered text, through SvelteKit end to end.
 *
 * `/fixture/var` is compiled with the transform (VAR-6), `/fixture/var-plain` without it (VAR-7).
 * Both render under the package's `createLangsysHandle`, with the catalog the core fetches from an
 * SDK test clone through the contract fixture's forwarder, and hydrate in Chromium against the
 * same clone. Each request names its case's project and key in its query, and the server renders
 * under them (`credentials`, SRV-2).
 *
 *     SRV_API=http://127.0.0.1:8787/api SRV_PROJECT=… SRV_KEY=… LANGSYS_FX_PORT=8787 npm run dev   # fresh
 *     node _dev_/e2e/var.mjs                        # starts the forwarder on 8787 itself
 *
 * Any case's key serves for `SRV_KEY`; `node _dev_/e2e/srv-flush.mjs --env write` prints one. Each
 * case is a project of its own on the clone (`_dev_/contract/cases.mjs`, suite 2), and what
 * registered is what the clone's catalog serves afterwards. The parts that read share their read
 * cases; the browser parts that register share case 2.2 — the two users, the `{#await}` blocks and
 * the route without the transform, whose zero is the difference its own visits make to that
 * catalog. Zeros are only meaningful beside the positive control: the transformed block DOES
 * register, in the same run, in the same project.
 */
import { chromium } from 'playwright';
import { generateCustomId } from 'langsys-js-typescript';
import { caseOf } from '../contract/cases.mjs';
import { startClone } from '../contract/clone.mjs';

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';

const GREET = 'Hello {name}, welcome back';
const CART = 'You have {items_count} items';
const CLIENT_ONLY = 'Rendered in the browser for {name}';
const CLIENT_BLOCK = 'Shown in the browser to {name}';
const cartBlock = generateCustomId('VAR', [CART, 'Add one']);

const results = [];
const check = (c, n, d) => results.push({ ok: !!c, n, d });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (html, id) => (html.match(new RegExp(`id="${id}"[^>]*>([^]*?)</`)) ?? [])[1]?.replace(/<!--[^]*?-->/g, '').replace(/<[^>]+>/g, '');

const fx = await startClone();
const C = Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((n) => [n, caseOf(2, n)]));
/** The query naming a case's project and one of its keys. */
const as = (c, key) => `project=${c.projects.app.id}&key=${c.keys[key].key}`;
/** Every registered text in a case's project: its phrases, and each block's phrases. */
const registered = async (c, key) => {
    const held = await fx.held(c.keys[key].key, c.projects.app.id, 'it-it');
    return [...held.phrases, ...Object.values(held.blocks).flat()];
};

// --- Served bytes (SRV-1, MARK-1 on the tree path) ---------------------------------------
{
    const res = await fetch(`${BASE}/fixture/var?locale=it-it&user=Ana&n=1&${as(C[1], 'read')}`);
    const html = await res.text();
    check(res.headers.get('x-srv-init')?.startsWith('ok:'), 'premise: the server initialised against the clone', res.headers.get('x-srv-init'));
    check(text(html, 'greet') === 'Ciao Ana, bentornato', 'served: the block is translated, with the value in place', text(html, 'greet'));
    const greetId = generateCustomId('VAR', [GREET]);
    check(
        new RegExp(`data-ls-contentblock="[0-9a-f]{32}"[^>]*data-ls-resolved="it-it"|data-ls-resolved="it-it"[^>]*data-ls-contentblock`).test(html),
        'served: the host is stamped with its id and the resolved marker',
        greetId
    );
    check(text(html, 'cart') === 'Hai 1 articolo', 'served: the ICU plural the catalog holds, for 1', text(html, 'cart'));
    const photoAlt = (html.match(/id="photo"[^>]*alt="([^"]*)"|alt="([^"]*)"[^>]*id="photo"/) ?? []).slice(1).find(Boolean);
    check(photoAlt === 'Foto di Ana', 'premise: a readable block inside a fallback block is served translated', photoAlt);
    const five = await (await fetch(`${BASE}/fixture/var?locale=it-it&user=Ana&n=5&${as(C[1], 'read')}`)).text();
    check(text(five, 'cart') === 'Hai 5 articoli', 'served: … and for 5', text(five, 'cart'));
    check(text(html, 'built') === 'Costruito con Kangen', "TOK-1: served, a unit's one token keeps its space beside an excluded element", text(html, 'built'));
    // The page, not the hydration seed: the seed carries the catalog's source keys by design.
    const page = html.replace(/<script[^]*?<\/script>/g, '');
    check(!/Hello Ana/.test(page) && !/You have/.test(page), 'served: no source text left in the transformed blocks');
}

const RUN = `r${Date.now() % 1_000_000}`;

// --- SRV-3 on the tree path: a server render alone, no browser, registers the placeholder phrase
// after the response, through the request scope. Its page is kept for the hydration check below.
const serverOnlyUrl = `${BASE}/fixture/var?user=Zoe&${as(C[3], 'write')}&run=${RUN}`;
const servedByScope = await (await fetch(serverOnlyUrl)).text();
{
    let serverOnly = [];
    for (let i = 0; i < 10 && !serverOnly.includes(GREET); i++) {
        await sleep(1000);
        serverOnly = await registered(C[3], 'write');
    }
    check(
        serverOnly.includes(GREET) && !serverOnly.some((p) => /Zoe/.test(p)),
        'SRV-3: a server render registers the placeholder phrase after the response',
        JSON.stringify(serverOnly)
    );
}

const browser = await chromium.launch();
const notices = [];
// ICU-5: the capability header on every catalog request the browser makes through the binding.
const catalogHeaders = [];
const visit = async (path) => {
    const page = await browser.newPage();
    page.on('console', (m) => notices.push(m.text()));
    page.on('request', (r) => {
        if (r.method() === 'GET' && /\/api\/translations(\/data)?(\?|$)/.test(r.url()))
            catalogHeaders.push(r.allHeaders().then((h) => h['x-langsys-capabilities'] ?? ''));
    });
    await page.goto(`${BASE}${path}`);
    await page.waitForFunction(() => document.querySelector('[data-testid=fx-status]')?.textContent === 'ready', null, { timeout: 60_000 });
    return page;
};

// --- Two users register one phrase (VAR-1, VAR-6) -----------------------------------------
{
    const ana = await visit(`/fixture/var?user=Ana&${as(C[2], 'write')}&run=${RUN}`);
    await visit(`/fixture/var?user=Luis&${as(C[2], 'write')}&run=${RUN}`);
    check((await ana.textContent('#greet')) === 'Hello Ana, welcome back', 'browser: the value renders in the base locale', await ana.textContent('#greet'));
    check(
        (await ana.textContent('#built')) === 'Built with Kangen',
        '… and a one-token unit keeps its space beside an excluded element',
        await ana.textContent('#built')
    );

    // Handlers survive: the button is rendered from the tree, and still does its job.
    await ana.click('#add');
    await sleep(200);
    check(
        (await ana.textContent('#cart')) === 'You have 4 items',
        'browser: a handler on a tree-rendered element runs, and the text follows',
        await ana.textContent('#cart')
    );

    let got = [];
    for (let i = 0; i < 20 && !got.includes(GREET); i++) {
        await sleep(3000);
        got = await registered(C[2], 'write');
    }
    check(got.filter((p) => p === GREET).length === 1, 'VAR-6: two users register the one placeholder phrase', JSON.stringify(got));
    check(got.includes(CART), 'VAR-2: the count registers under its derived name', JSON.stringify(got));
    check(!got.some((p) => /Ana|Luis/.test(p)), 'VAR-1: no per-user phrase is registered', JSON.stringify(got));
    // The content a block registers with: the count's block from the server's flush, and a block
    // only the browser renders, mounted before init() has answered. Each marked value is its {NAME}
    // as text, the marker removed (VAR-3). Read as the project's owner reads a block.
    let stored = [];
    let held = { blocks: {} };
    const contentOf = (phrase) => stored.find((b) => held.blocks[b.custom_id]?.includes(phrase))?.content ?? '';
    const holds = (phrase) => contentOf(phrase) !== '';
    for (let i = 0; i < 10 && !(holds(CART) && holds(CLIENT_BLOCK)); i++) {
        if (i) await sleep(1000);
        held = await fx.held(C[2].keys.write.key, C[2].projects.app.id, 'it-it');
        stored = await fx.storedBlocks(C[2].projects.app, C[2].keys.write.key, 'it-it');
    }
    const contents = stored.map((b) => b.content ?? '');
    check(holds(CART) && holds(CLIENT_BLOCK), 'premise: both blocks registered content, from the server and from the browser', JSON.stringify(contents));
    check(
        contentOf(CART).includes('You have {items_count} items') &&
            contentOf(CLIENT_BLOCK).includes('Shown in the browser to {name}') &&
            !contents.some((c) => /Ana|Luis|<!--ls:/.test(c)),
        "VAR-1, VAR-3: a block's registered content holds each value as its placeholder, the marker removed",
        JSON.stringify(contents)
    );
    check(
        stored.some((b) => b.custom_id === cartBlock),
        "premise: the count's block is stored under the id derived from its phrases",
        JSON.stringify(stored.map((b) => b.custom_id))
    );
    check(!got.some((p) => /^Item\b/.test(p)), 'VAR-7: the {#each} block (a fallback) registers nothing', JSON.stringify(got));
    // VAR-7's carve-out: raw HTML is content. The {@html}-only block registers its text; the block
    // that also interpolates a variable registers nothing.
    for (let i = 0; i < 10 && !got.includes('From the CMS, section one'); i++) {
        await sleep(3000);
        got = await registered(C[2], 'write');
    }
    check(got.includes('From the CMS, section one'), 'VAR-7: a block whose only dynamic part is {@html} registers its HTML as content', JSON.stringify(got));
    check(!got.some((p) => /Mixed CMS text|^Hi\b/.test(p)), 'VAR-7: a block mixing {@html} with a variable registers nothing', JSON.stringify(got));
}

// --- The client does not resend what the server collected (SRV-3, SRV-4) ---------------
// A clause that something is never sent, read at the browser's transport seam. The page is the one
// the server rendered above, under a write key: its scope sent the phrases it missed after the
// response and its seed marks them collected. The browser hydrates those same served bytes (no
// second server render) with every API request answered inside the browser and recorded, for a
// write-enabled session whose registrations are all accepted: a phrase the server collected must
// not be sent again. Control: a block rendered only in the browser is sent through the same client.
{
    const ctx = await browser.newContext();
    const sent = [];
    await ctx.route(
        (url) => url.pathname.startsWith('/__fx/api/'),
        (route) => {
            const req = route.request();
            const path = new URL(req.url()).pathname.slice('/__fx/api'.length);
            if (req.method() === 'POST') sent.push(req.postData() ?? '');
            // The API's answers for a write key, in its shapes, as `_dev_/e2e/seam.mjs` gives them.
            const project = {
                id: C[3].projects.app.id,
                title: 'Seam',
                base_locale: 'en-us',
                target_locales: ['it-it'],
                default_locales: { it: 'it-it' },
                key_type: 'write',
                write_enabled: true,
                auto_discovery: false,
                discovery_base_locale_only: false,
                langsys_settings: { translatable_items: { batch_limit: 200 } },
            };
            const body =
                req.method() === 'GET' && /^\/authorize-project\/[^/]+$/.test(path)
                    ? { status: true, data: project }
                    : req.method() === 'POST' && path === '/translatable-items'
                      ? { status: true, data: { human_translations_saved: 0, human_translations_skipped: 0 } }
                      : {
                            status: true,
                            words: 0,
                            untranslated_words: 0,
                            untranslatedWords: 0,
                            write_enabled: true,
                            discovery_base_locale_only: false,
                            data: [],
                        };
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        }
    );
    const page = await ctx.newPage();
    await page.route(serverOnlyUrl, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: servedByScope }));
    await page.goto(serverOnlyUrl);
    await page.waitForFunction(() => document.querySelector('[data-testid=fx-status]')?.textContent === 'ready', null, { timeout: 60_000 });
    for (let i = 0; i < 30 && !sent.join('\n').includes(CLIENT_ONLY); i++) await sleep(500);
    await sleep(3000); // past another debounce, for anything after it
    const all = sent.join('\n');
    const seed = JSON.parse(servedByScope.match(/window\.__LANGSYS_SEED__=(\{[^]*?\})<\/script>/)?.[1] ?? '{}');
    // What the server's scope sends itself: the blocks it rendered and the `t()` misses, each
    // marked `collected` in the seed.
    const collected = [
        ...Object.values(seed.blocks ?? {})
            .filter((b) => b.collected)
            .flatMap((b) => b.tokens),
        ...(seed.phrases ?? []).filter((p) => p.collected).map((p) => p.phrase),
    ];
    check(
        collected.includes(GREET) && collected.includes('Layout phrase 0'),
        'premise: the served seed marks collected the placeholder phrase and the layout’s t() miss',
        JSON.stringify(collected)
    );
    check(all.includes(CLIENT_ONLY), 'control: the hydrated client sends a block only it rendered', CLIENT_ONLY);
    const resent = [...new Set(collected)].filter((t) => all.includes(JSON.stringify(t)));
    check(resent.length === 0, 'SRV-4: the hydrated client resends nothing the server collected', JSON.stringify(resent));
    await ctx.close();
}

// --- Without the transform (VAR-7) --------------------------------------------------------
// The {#await} block is a fallback: a placeholder never keys or registers anything, whether it
// resolves inside the core's settle window or after it.
for (const ms of [100, 2000]) {
    const page = await visit(`/fixture/var?user=Await${ms}&${as(C[2], 'write')}&await=${ms}&run=${RUN}`);
    await page.waitForFunction(() => document.querySelector('#awaiting')?.textContent === 'Loaded after a moment', null, { timeout: 15_000 }).catch(() => {});
    check(
        (await page.textContent('#awaiting')) === 'Loaded after a moment',
        `{#await} resolving after ${ms} ms renders the content`,
        await page.textContent('#awaiting')
    );
}
{
    const before = await registered(C[2], 'write');
    const plain = await visit(`/fixture/var-plain?user=Ana&${as(C[2], 'write')}&debug=1&run=${RUN}`);
    await visit(`/fixture/var-plain?user=Luis&${as(C[2], 'write')}&debug=1&run=${RUN}`);
    await sleep(35_000); // past the client's 5–30 s flush jitter
    const after = await registered(C[2], 'write');
    const added = after.filter((p) => !before.includes(p));
    check(
        !after.some((p) => /Loading|Loaded after/.test(p)),
        'SRV-5/VAR-7: the {#await} block registers neither its placeholder nor its content, fast or slow',
        JSON.stringify(after)
    );
    check(!added.some((p) => /Hello (Ana|Luis)/.test(p)), 'VAR-7: without the transform, the interpolating block registers nothing', JSON.stringify(added));
    // Measured, not asserted: without the transform the runtime cannot tell a {@html}-only block from
    // one that interpolates, so it registers nothing either (VAR-7's carve-out needs the transform).
    console.log(`INFO  without the transform, the {@html}-only block registers: ${added.includes('Plain CMS text') ? 'yes' : 'no'}  ${JSON.stringify(added)}`);
    check(
        notices.filter((n) => /svelte-transform-missing/.test(n)).length >= 1,
        'VAR-7: the notice names the transform',
        notices.filter((n) => /transform/.test(n)).join(' | ')
    );
    await plain.close();
}

// --- Rendered from the catalog (TOK-1, MARK-4, VAR-7) --------------------------------------
{
    const it = await visit(`/fixture/var-plain?user=Ana&${as(C[4], 'read')}&locale=it-it`);
    await it.waitForFunction(() => document.querySelector('#greet')?.textContent === 'Ciao Ana, bentornato', null, { timeout: 15_000 }).catch(() => {});
    check(
        (await it.textContent('#greet')) === 'Ciao Ana, bentornato',
        'VAR-7: a catalogued translation still renders without the transform',
        await it.textContent('#greet')
    );
    await it.waitForFunction(() => document.querySelector('#built')?.textContent?.startsWith('Costruito'), null, { timeout: 15_000 }).catch(() => {});
    check(
        (await it.textContent('#built')) === 'Costruito con Kangen',
        "TOK-1: on the core's DOM class, a unit's one token keeps its space beside an excluded element",
        await it.textContent('#built')
    );

    // The binding renders the nested block itself; the fallback around it must leave it alone.
    const nested = await visit(`/fixture/var?user=Ana&${as(C[4], 'read')}&locale=it-it&run=${RUN}-nested`);
    await sleep(1500);
    check(
        (await nested.getAttribute('#photo', 'alt')) === 'Foto di Ana',
        'MARK-4: after hydration, a readable block inside a fallback block keeps its value',
        await nested.getAttribute('#photo', 'alt')
    );
    check(
        (await nested.textContent('#built')) === 'Costruito con Kangen',
        "TOK-1: after hydration, a unit's one token keeps its space beside an excluded element",
        await nested.textContent('#built')
    );
    // The same unit rendered by the client alone, switched from the base locale.
    const built = await visit(`/fixture/var?user=Ana&${as(C[4], 'read')}&run=${RUN}-built`);
    await built.evaluate(() => window.__fxSetLocale('it-it'));
    await built.waitForFunction(() => document.querySelector('#built')?.textContent?.startsWith('Costruito'), null, { timeout: 15_000 }).catch(() => {});
    check(
        (await built.textContent('#built')) === 'Costruito con Kangen',
        "TOK-1: rendered by the client, a unit's one token keeps its space beside an excluded element",
        await built.textContent('#built')
    );
    await built.close();
}

// --- VAR-6 in the browser: a block read on its own inside a fallback block takes the category the
// block renders with. A client that read no category would render it as a miss, in English.
{
    const picture = async (path) => {
        const p = await visit(path);
        const alt = () => p.getAttribute('#picture', 'alt');
        const until = (value) =>
            p.waitForFunction((v) => document.querySelector('#picture')?.getAttribute('alt') === v, value, { timeout: 15_000 }).catch(() => {});
        return { p, alt, until };
    };
    const served = await picture(`/fixture/var/category?user=Ana&${as(C[5], 'read')}&locale=it-it`);
    await served.until('Immagine di Ana');
    await sleep(1500);
    check(
        (await served.alt()) === 'Immagine di Ana',
        "VAR-6: served in Italian and hydrated, a unit inside a fallback block keeps the block's category",
        await served.alt()
    );
    // The same page in the base locale, switched to Italian in the browser: rendered by the client
    // alone. A read-only session, and a write session, whose registration of what it showed in the
    // base locale answers around the switch and must not undo the catalog it switched to.
    for (const [c, key] of [
        [C[6], 'read'],
        [C[7], 'write'],
    ]) {
        const client = await picture(`/fixture/var/category?user=Ana&${as(c, key)}`);
        await client.p.evaluate(() => window.__fxSetLocale('it-it'));
        await client.until('Immagine di Ana');
        check(
            (await client.p.getAttribute('#alone', 'alt')) === 'Immagine di Ana',
            `control (${key}): rendered by the client, the same block in no fallback, naming the category, is translated`,
            await client.p.getAttribute('#alone', 'alt')
        );
        check((await client.alt()) === 'Immagine di Ana', `VAR-6 (${key}): rendered by the client, the unit takes the block's category`, await client.alt());
        await client.p.click('#switch');
        await client.until('Figura di Ana');
        check((await client.alt()) === 'Figura di Ana', `VAR-6 (${key}): … and follows the block's category when it changes`, await client.alt());
        await client.p.close();
    }
}
const capabilities = await Promise.all(catalogHeaders);
check(
    capabilities.length >= 1 && capabilities.every((h) => h === 'icu'),
    'ICU-5: every catalog request the browser makes carries X-Langsys-Capabilities: icu',
    JSON.stringify(capabilities)
);

await browser.close();
await fx.stop();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}${r.ok || r.d === undefined ? '' : `\n      ${r.d}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
