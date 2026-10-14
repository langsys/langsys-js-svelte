/**
 * VAR — variables in registered text, through SvelteKit end to end.
 *
 * `/fixture/var` is compiled with the transform (VAR-6), `/fixture/var-plain` without it (VAR-7).
 * Both render under the package's `createLangsysHandle`, with the catalog the core fetches from
 * the contract double, and hydrate in Chromium against the same double.
 *
 *     node _dev_/e2e/var.mjs --serve                                      # terminal 1: the double on :8787
 *     node _dev_/e2e/var.mjs --seed                                       # optional: seed it for a manual look, then exit
 *     SRV_API=http://127.0.0.1:8787/api SRV_KEY=k-write npm run dev       # terminal 2, fresh
 *     node _dev_/e2e/var.mjs
 *
 * The double's state is what registered. Zeros are only meaningful beside the positive control:
 * the transformed block DOES register, in the same run, through the same double.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { generateCustomId } from 'langsys-js-typescript';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
const FX = 'http://127.0.0.1:8787/__fixture';

if (process.argv.includes('--serve')) {
    spawn(process.execPath, [join(ROOT, 'contract-fixture/server.mjs'), '--port', '8787'], { stdio: 'inherit' });
} else {
    const GREET = 'Hello {name}, welcome back';
    const CART = 'You have {items_count} items';
    const CLIENT_BLOCK = 'Shown in the browser to {name}';
    const PLAIN_ANA = 'Hello Ana, welcome back'; // what the plain route's DOM reads
    const cartBlock = generateCustomId('VAR', [CART, 'Add one']);
    const PHOTO = 'Photo of {name}'; // a readable block inside a fallback block, its only text an attribute
    const PICTURE = 'Picture of {name}'; // the same, naming no category: it takes the fallback block's
    const SEED = {
        projects: [
            {
                id: 'p1',
                base_locale: 'en-us',
                target_locales: ['it-it'],
                phrases: [
                    { category: 'VAR', phrase: GREET, translations: { 'it-it': 'Ciao {name}, bentornato' } },
                    { category: 'VAR', phrase: PLAIN_ANA, translations: { 'it-it': 'Ciao Ana, bentornato' } },
                    { category: 'VAR', phrase: PHOTO, translations: { 'it-it': 'Foto di {name}' } },
                    { category: 'VAR', phrase: PICTURE, translations: { 'it-it': 'Immagine di {name}' } },
                    { category: 'VAR2', phrase: PICTURE, translations: { 'it-it': 'Figura di {name}' } },
                ],
                blocks: [
                    {
                        category: 'VAR',
                        custom_id: cartBlock,
                        content: '<p>You have {items_count} items</p><button>Add one</button>',
                        phrases: [
                            { phrase: CART, translations: { 'it-it': '{items_count, plural, one {Hai # articolo} other {Hai # articoli}}' } },
                            { phrase: 'Add one', translations: { 'it-it': 'Aggiungi' } },
                        ],
                    },
                    {
                        category: 'VAR',
                        custom_id: generateCustomId('VAR', [PHOTO]),
                        content: '<img alt="Photo of {name}">',
                        phrases: [{ phrase: PHOTO, translations: { 'it-it': 'Foto di {name}' } }],
                    },
                    ...[
                        ['VAR', 'Immagine di {name}'],
                        ['VAR2', 'Figura di {name}'],
                    ].map(([category, translation]) => ({
                        category,
                        custom_id: generateCustomId(category, [PICTURE]),
                        content: '<img alt="Picture of {name}">',
                        phrases: [{ phrase: PICTURE, translations: { 'it-it': translation } }],
                    })),
                ],
            },
        ],
        keys: [
            { key: 'k-write', project: 'p1', type: 'write' },
            { key: 'k-read', project: 'p1', type: 'read' },
        ],
    };

    const results = [];
    const check = (c, n, d) => results.push({ ok: !!c, n, d });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const seed = (doc) => fetch(`${FX}/seed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(doc) });
    const state = async () => (await (await fetch(`${FX}/state`)).json()).projects.p1;
    /** Every registered text: phrases, and each block's phrases. */
    const registered = async () => {
        const p = await state();
        return [...p.phrases.map((x) => x.phrase), ...p.blocks.flatMap((b) => b.phrases.map((x) => x.phrase))];
    };
    const text = (html, id) => (html.match(new RegExp(`id="${id}"[^>]*>([^]*?)</`)) ?? [])[1]?.replace(/<!--[^]*?-->/g, '').replace(/<[^>]+>/g, '');

    if (process.argv.includes('--seed')) {
        // For looking by hand (_dev_/LOCAL-TESTING.md): the catalog this harness runs against, nothing else.
        await seed(SEED);
        console.log('seeded: project p1 (en-us → it-it), key k-write, the VAR phrases and block');
        process.exit(0);
    }

    await seed(SEED);

    // --- Served bytes (SRV-1, MARK-1 on the tree path) ---------------------------------------
    const res = await fetch(`${BASE}/fixture/var?locale=it-it&user=Ana&n=1&key=k-write`);
    const html = await res.text();
    check(res.headers.get('x-srv-init') === 'ok:k-write', 'premise: the server initialised against the double', res.headers.get('x-srv-init'));
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
    const five = await (await fetch(`${BASE}/fixture/var?locale=it-it&user=Ana&n=5&key=k-write`)).text();
    check(text(five, 'cart') === 'Hai 5 articoli', 'served: … and for 5', text(five, 'cart'));
    // The page, not the hydration seed: the seed carries the catalog's source keys by design.
    const page = html.replace(/<script[^]*?<\/script>/g, '');
    check(!/Hello Ana/.test(page) && !/You have/.test(page), 'served: no source text left in the transformed blocks');

    // --- Two users register one phrase (VAR-1, VAR-6) -----------------------------------------
    const RUN = `r${Date.now() % 1_000_000}`;
    await seed({ ...SEED, projects: [{ ...SEED.projects[0], phrases: [], blocks: [] }] });
    // SRV-3 on the tree path: a server render alone, no browser, registers the placeholder phrase
    // after the response, through the request scope.
    await fetch(`${BASE}/fixture/var?user=Zoe&key=k-write&run=${RUN}`).then((r) => r.text());
    let serverOnly = [];
    for (let i = 0; i < 10 && !serverOnly.includes(GREET); i++) {
        await sleep(1000);
        serverOnly = await registered();
    }
    check(
        serverOnly.includes(GREET) && !serverOnly.some((p) => /Zoe/.test(p)),
        'SRV-3: a server render registers the placeholder phrase after the response',
        JSON.stringify(serverOnly)
    );

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
    const ana = await visit(`/fixture/var?user=Ana&key=k-write&run=${RUN}`);
    await visit(`/fixture/var?user=Luis&key=k-write&run=${RUN}`);
    check((await ana.textContent('#greet')) === 'Hello Ana, welcome back', 'browser: the value renders in the base locale', await ana.textContent('#greet'));

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
        got = await registered();
    }
    check(got.filter((p) => p === GREET).length === 1, 'VAR-6: two users register the one placeholder phrase', JSON.stringify(got));
    check(got.includes(CART), 'VAR-2: the count registers under its derived name', JSON.stringify(got));
    check(!got.some((p) => /Ana|Luis/.test(p)), 'VAR-1: no per-user phrase is registered', JSON.stringify(got));
    // The content a block registers with: the count's block from the server's flush, and a block
    // only the browser renders, mounted before init() has answered. Each marked value is its {NAME}.
    let stored = [];
    const holds = (phrase) => stored.some((b) => b.phrases.some((p) => p.phrase === phrase) && /<!--ls:/.test(b.content ?? ''));
    for (let i = 0; i < 10 && !(holds(CART) && holds(CLIENT_BLOCK)); i++) {
        if (i) await sleep(1000);
        stored = (await state()).blocks;
    }
    const contents = stored.map((b) => b.content ?? '');
    const pairs = contents.flatMap((c) => [...c.matchAll(/<!--ls:([^>]*?)-->([^]*?)<!--\/ls-->/g)]);
    check(holds(CART) && holds(CLIENT_BLOCK), 'premise: both blocks registered marked content, from the server and from the browser', JSON.stringify(contents));
    check(
        pairs.length >= 2 && pairs.every(([, name, value]) => value === `{${name}}`) && !contents.some((c) => /Ana|Luis|Zoe/.test(c)),
        "VAR-1: a block's registered content holds each value as its placeholder",
        JSON.stringify(contents)
    );
    check(!got.some((p) => /^Item\b/.test(p)), 'VAR-7: the {#each} block (a fallback) registers nothing', JSON.stringify(got));
    // VAR-7's carve-out: raw HTML is content. The {@html}-only block registers its text; the block
    // that also interpolates a variable registers nothing.
    for (let i = 0; i < 10 && !got.includes('From the CMS, section one'); i++) {
        await sleep(3000);
        got = await registered();
    }
    check(got.includes('From the CMS, section one'), 'VAR-7: a block whose only dynamic part is {@html} registers its HTML as content', JSON.stringify(got));
    check(!got.some((p) => /Mixed CMS text|^Hi\b/.test(p)), 'VAR-7: a block mixing {@html} with a variable registers nothing', JSON.stringify(got));

    // --- The client does not resend what the server collected (SRV-3, SRV-4) ---------------
    // The server renders, collects its misses and sends them after the response, and its seed marks
    // them collected. The double is then emptied, and the browser hydrates the SAME served HTML (no
    // second server render): a phrase the server collected must not come back from the client.
    // Control: a block rendered only in the browser registers through the same client.
    {
        const CLIENT_ONLY = 'Rendered in the browser for {name}';
        await seed({ ...SEED, projects: [{ ...SEED.projects[0], phrases: [], blocks: [] }] });
        const url = `${BASE}/fixture/var?user=Ana&key=k-write&run=${RUN}-seed`;
        const served = await (await fetch(url)).text();
        let collected = [];
        for (let i = 0; i < 10 && !collected.includes(GREET); i++) {
            await sleep(1000);
            collected = await registered();
        }
        check(collected.includes(GREET), 'premise: the server collected and sent the placeholder phrase', JSON.stringify(collected));
        await seed({ ...SEED, projects: [{ ...SEED.projects[0], phrases: [], blocks: [] }] });
        const page = await browser.newPage();
        await page.route(url, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: served }));
        await page.goto(url);
        await page.waitForFunction(() => document.querySelector('[data-testid=fx-status]')?.textContent === 'ready', null, { timeout: 60_000 });
        let after = [];
        for (let i = 0; i < 20 && !after.includes(CLIENT_ONLY); i++) {
            await sleep(3000);
            after = await registered();
        }
        check(after.includes(CLIENT_ONLY), 'control: the hydrated client registers a block only it rendered', JSON.stringify(after));
        const resent = collected.filter((p) => after.includes(p));
        check(
            collected.includes(GREET) && resent.length === 0,
            'the hydrated client resends nothing the server collected',
            `collected ${JSON.stringify(collected)}; resent ${JSON.stringify(resent)}`
        );
        await page.close();
    }

    // --- Without the transform (VAR-7) --------------------------------------------------------
    // The {#await} block is a fallback: a placeholder never keys or registers anything, whether it
    // resolves inside the core's settle window or after it.
    for (const ms of [100, 2000]) {
        const page = await visit(`/fixture/var?user=Await${ms}&key=k-write&await=${ms}&run=${RUN}`);
        await page
            .waitForFunction(() => document.querySelector('#awaiting')?.textContent === 'Loaded after a moment', null, { timeout: 15_000 })
            .catch(() => {});
        check(
            (await page.textContent('#awaiting')) === 'Loaded after a moment',
            `{#await} resolving after ${ms} ms renders the content`,
            await page.textContent('#awaiting')
        );
    }

    const before = await registered();
    const plain = await visit(`/fixture/var-plain?user=Ana&key=k-write&debug=1&run=${RUN}`);
    await visit(`/fixture/var-plain?user=Luis&key=k-write&debug=1&run=${RUN}`);
    await sleep(35_000); // past the client's 5–30 s flush jitter
    const after = await registered();
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

    await seed(SEED);
    const it = await visit(`/fixture/var-plain?user=Ana&key=k-write&locale=it-it`);
    await it.waitForFunction(() => document.querySelector('#greet')?.textContent === 'Ciao Ana, bentornato', null, { timeout: 15_000 }).catch(() => {});
    check(
        (await it.textContent('#greet')) === 'Ciao Ana, bentornato',
        'VAR-7: a catalogued translation still renders without the transform',
        await it.textContent('#greet')
    );

    // The binding renders the nested block itself; the fallback around it must leave it alone.
    const nested = await visit(`/fixture/var?user=Ana&key=k-write&locale=it-it&run=${RUN}-nested`);
    await sleep(1500);
    check(
        (await nested.getAttribute('#photo', 'alt')) === 'Foto di Ana',
        'MARK-4: after hydration, a readable block inside a fallback block keeps its value',
        await nested.getAttribute('#photo', 'alt')
    );

    // VAR-6 in the browser: a block read on its own inside a fallback block takes the category the
    // block renders with. A client that read no category would render it as a miss, in English.
    const picture = async (path) => {
        const p = await visit(path);
        const alt = () => p.getAttribute('#picture', 'alt');
        const until = (value) =>
            p.waitForFunction((v) => document.querySelector('#picture')?.getAttribute('alt') === v, value, { timeout: 15_000 }).catch(() => {});
        return { p, alt, until };
    };
    const served = await picture(`/fixture/var/category?user=Ana&key=k-write&locale=it-it`);
    await served.until('Immagine di Ana');
    await sleep(1500);
    check(
        (await served.alt()) === 'Immagine di Ana',
        "VAR-6: served in Italian and hydrated, a unit inside a fallback block keeps the block's category",
        await served.alt()
    );
    // The same page in the base locale, switched to Italian in the browser: rendered by the client
    // alone, after a catalog request of its own.
    // A read-only session. A write session that showed these blocks in the base locale keeps
    // rendering them as source after the switch, although the catalog it fetches holds them: the
    // core's to answer (CONFORMANCE.md, Gaps), and not what this check measures.
    const client = await picture(`/fixture/var/category?user=Ana&key=k-read`);
    await client.p.evaluate(() => window.__fxSetLocale('it-it'));
    await client.until('Immagine di Ana');
    check(
        (await client.p.getAttribute('#alone', 'alt')) === 'Immagine di Ana',
        'control: rendered by the client, the same block in no fallback, naming the category, is translated',
        await client.p.getAttribute('#alone', 'alt')
    );
    check((await client.alt()) === 'Immagine di Ana', "VAR-6: rendered by the client, the unit takes the block's category", await client.alt());
    await client.p.click('#switch');
    await client.until('Figura di Ana');
    check((await client.alt()) === 'Figura di Ana', "VAR-6: … and follows the block's category when it changes", await client.alt());
    const capabilities = await Promise.all(catalogHeaders);
    check(
        capabilities.length >= 1 && capabilities.every((h) => h === 'icu'),
        'ICU-5: every catalog request the browser makes carries X-Langsys-Capabilities: icu',
        JSON.stringify(capabilities)
    );

    await browser.close();
    for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}${r.ok || r.d === undefined ? '' : `\n      ${r.d}`}`);
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
}
