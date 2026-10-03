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
    const PLAIN_ANA = 'Hello Ana, welcome back'; // what the plain route's DOM reads
    const cartBlock = generateCustomId('VAR', [CART, 'Add one']);
    const SEED = {
        projects: [
            {
                id: 'p1',
                base_locale: 'en-us',
                target_locales: ['it-it'],
                phrases: [
                    { category: 'VAR', phrase: GREET, translations: { 'it-it': 'Ciao {name}, bentornato' } },
                    { category: 'VAR', phrase: PLAIN_ANA, translations: { 'it-it': 'Ciao Ana, bentornato' } },
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
                ],
            },
        ],
        keys: [{ key: 'k-write', project: 'p1', type: 'write' }],
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
    const visit = async (path) => {
        const page = await browser.newPage();
        page.on('console', (m) => notices.push(m.text()));
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
    check(!got.some((p) => /^Item\b/.test(p)), 'VAR-7: the {#each} block (a fallback) registers nothing', JSON.stringify(got));
    // VAR-7's carve-out: raw HTML is content. The {@html}-only block registers its text; the block
    // that also interpolates a variable registers nothing.
    for (let i = 0; i < 10 && !got.includes('From the CMS, section one'); i++) {
        await sleep(3000);
        got = await registered();
    }
    check(got.includes('From the CMS, section one'), 'VAR-7: a block whose only dynamic part is {@html} registers its HTML as content', JSON.stringify(got));
    check(!got.some((p) => /Mixed CMS text|^Hi\b/.test(p)), 'VAR-7: a block mixing {@html} with a variable registers nothing', JSON.stringify(got));

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

    await browser.close();
    for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}${r.ok || r.d === undefined ? '' : `\n      ${r.d}`}`);
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
}
