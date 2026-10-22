/**
 * The binding's "never attempt" clauses, at the browser's transport seam (CONF-2): in real Chromium,
 * every request the page makes to the API is answered inside the browser and recorded, so what a
 * check reads is what left the page. The session is write-enabled and every registration is
 * accepted, so a block that sends nothing does so by the binding's choice; on every page a control
 * beside it sends through the same session.
 *
 *     npm run dev                                   # 127.0.0.1:5173, freshly started
 *     node _dev_/e2e/seam.mjs                       # no API, no double, no .env
 *
 * GATE-10 (`/fixture/gate10`): a block or `<Phrase>` under a resolved ancestor sends nothing, since
 * the core walks up from the host this binding hands it; `="false"` on a nearer ancestor opts back
 * out. VAR-7 (`/fixture/var-plain`, compiled without the transform, and `/fixture/var`'s fallback
 * blocks): the core's DOM class, constructed with `register: false`, sends nothing, while a block
 * whose only dynamic part is `{@html}` sends its HTML as content.
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
const results = [];
const check = (c, n, d) => results.push({ ok: !!c, n, d });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The API's answers for a write key on project p1, in its shapes. Nothing here refuses anything.
const PROJECT = {
    id: 'p1',
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
function answer(method, path) {
    if (method === 'GET' && /^\/authorize-project\/[^/]+$/.test(path)) return [200, { status: true, data: PROJECT }];
    if (method === 'GET' && (path === '/translations' || path === '/translations/data'))
        return [200, { status: true, words: 0, untranslated_words: 0, untranslatedWords: 0, write_enabled: true, discovery_base_locale_only: false, data: [] }];
    if (method === 'POST' && path === '/translatable-items')
        return [200, { status: true, data: { human_translations_saved: 0, human_translations_skipped: 0 } }];
    if (method === 'POST' && path === '/discovery/hint') return [204, null];
    return [200, { status: true, data: [] }];
}

const browser = await chromium.launch();

/** A page in a context of its own, with every API request it makes answered and recorded. */
async function visit(path) {
    const ctx = await browser.newContext();
    const sent = [];
    await ctx.route(
        (url) => url.pathname.startsWith('/__fx/api/'),
        (route) => {
            const req = route.request();
            const path = new URL(req.url()).pathname.slice('/__fx/api'.length);
            if (req.method() === 'POST') sent.push({ path, body: req.postData() ?? '' });
            const [status, body] = answer(req.method(), path);
            return route.fulfill({ status, contentType: 'application/json', body: body === null ? '' : JSON.stringify(body) });
        }
    );
    const page = await ctx.newPage();
    const notices = [];
    page.on('console', (m) => notices.push(m.text()));
    page.setDefaultNavigationTimeout(90_000);
    await page.goto(`${BASE}${path}`);
    await page.waitForFunction(() => document.querySelector('[data-testid=fx-status]')?.textContent !== 'idle', null, { timeout: 60_000 });
    const status = await page.textContent('[data-testid=fx-status]');
    /** Every registration body the page sent, as one string. */
    const registered = () =>
        sent
            .filter((s) => s.path === '/translatable-items')
            .map((s) => s.body)
            .join('\n');
    /** Wait until each control has been sent, then past another debounce for anything after it. */
    const settle = async (controls) => {
        for (let i = 0; i < 30 && !controls.every((c) => registered().includes(c)); i++) await sleep(500);
        await sleep(3000);
    };
    return { ctx, page, status, notices, registered, settle };
}

// Warm-up: a cold dev server compiles on first request and may re-optimise its dependencies with a
// full reload. One throwaway load of each route absorbs that.
for (const path of ['/fixture/gate10?key=k-writer&case=warmup', '/fixture/var-plain?key=k-writer&case=warmup', '/fixture/var?key=k-writer&case=warmup']) {
    const { ctx } = await visit(path);
    await ctx.close();
}

// ---------- GATE-10: a resolved ancestor stops a block before it is sent ----------
{
    const { ctx, page, status, registered, settle } = await visit('/fixture/gate10?key=k-writer&case=g');
    await settle(['epsilon', 'Unmarked phrase', 'zeta']);
    const sent = registered();
    check(status === 'ready', 'GATE-10 premise: the write session initialised', status);
    check(sent.includes('epsilon'), 'GATE-10 control: an unmarked <Translate> block is sent', 'epsilon');
    check(sent.includes('Unmarked phrase'), 'GATE-10 control: an unmarked <Phrase> is sent', 'Unmarked phrase');
    check(sent.includes('zeta'), 'GATE-10 negative control: a bare $t() under a resolved ancestor is sent (not a DOM reader)', 'zeta');
    check(sent.includes('delta'), 'GATE-10: data-ls-resolved="false" opts back out, and the block is sent', 'delta');
    check(!sent.includes('alpha'), 'GATE-10: data-ls-resolved on the parent: the <Translate> block is never sent', 'alpha absent');
    check(!sent.includes('beta'), 'GATE-10: the data-langsys-resolved spelling: never sent', 'beta absent');
    check(!sent.includes('gamma'), 'GATE-10: a resolved ancestor three levels up: never sent (inheritance)', 'gamma absent');
    check(!sent.includes('Resolved phrase'), 'GATE-10: a resolved ancestor: the <Phrase> is never sent', 'Resolved phrase absent');
    const identity = await page.evaluate(() => {
        const id = window.__lsIdentity;
        const host = document.querySelector('[data-testid="g10-resolved"]')?.parentElement;
        if (!id || !host) return null;
        return { stamped: host.getAttribute(id.CONTENT_BLOCK_MARKER_ATTR), derived: id.generateCustomId('FX', id.tokenizeElement(host).tokens) };
    });
    check(
        identity?.stamped && identity.stamped === identity.derived,
        'GATE-10: a block inside a resolved subtree keeps its id (stamp equals the re-derived id)',
        JSON.stringify(identity)
    );
    await ctx.close();
}

// ---------- VAR-7: the core's DOM class, constructed with register: false, sends nothing ----------
// Without the transform: two users, every block shape, one mounted a second after init().
// The control on the same page: the layout's own $t() miss is sent through the same session. The
// first visit runs with debug on, where the binding's notice names the transform.
for (const [n, user] of ['Ana', 'Luis'].entries()) {
    const { ctx, page, status, notices, registered, settle } = await visit(`/fixture/var-plain?user=${user}&key=k-writer&case=plain-${n}${n ? '' : '&debug'}`);
    await page.waitForSelector('#plain-late', { timeout: 10_000 }).catch(() => {});
    await settle([`Layout phrase plain-${n}`]);
    const sent = registered();
    check(status === 'ready', `VAR-7 premise (${user}): the write session initialised`, status);
    check((await page.textContent('#greet')) === `Hello ${user}, welcome back`, `VAR-7 premise (${user}): the value renders`, await page.textContent('#greet'));
    check((await page.locator('#plain-late').count()) === 1, `VAR-7 premise (${user}): the block mounted after init() rendered`, '#plain-late');
    check(sent.includes(`Layout phrase plain-${n}`), `VAR-7 control (${user}): the page's session sends (the layout's $t() miss)`, `Layout phrase plain-${n}`);
    const leaked = [
        'welcome back',
        user,
        'Built with',
        'Plain CMS text',
        'First line',
        'Second line',
        'Signed in as',
        'Mounted after init',
        'And another line',
    ].filter((t) => sent.includes(t));
    check(leaked.length === 0, `VAR-7 (${user}): no block on the route without the transform is sent, of any shape`, JSON.stringify(leaked));
    if (!n)
        check(
            notices.some((m) => /svelte-transform-missing/.test(m)),
            'VAR-7: with debug on, the notice names the transform',
            notices.filter((m) => /transform/.test(m)).join(' | ')
        );
    await ctx.close();
}

// With the transform: the blocks it declines (an {#each}, raw HTML beside a variable, an {#await})
// take the same class and send nothing; the {@html}-only block is the carve-out and sends its HTML.
for (const ms of [100, 2000]) {
    const { ctx, page, status, registered, settle } = await visit(`/fixture/var?user=Ana&key=k-writer&await=${ms}&case=var-${ms}`);
    await page.waitForFunction(() => document.querySelector('#awaiting')?.textContent === 'Loaded after a moment', null, { timeout: 15_000 }).catch(() => {});
    await settle(['Hello {name}, welcome back', 'From the CMS, section one']);
    const sent = registered();
    check(status === 'ready', `VAR-7 premise ({#await} at ${ms} ms): the write session initialised`, status);
    check(
        (await page.textContent('#awaiting')) === 'Loaded after a moment',
        `VAR-7 premise ({#await} at ${ms} ms): the awaited content rendered`,
        await page.textContent('#awaiting')
    );
    check(
        sent.includes('Hello {name}, welcome back'),
        `VAR-7 control ({#await} at ${ms} ms): a transformed block is sent, as its placeholder phrase`,
        'Hello {name}, welcome back'
    );
    check(
        sent.includes('From the CMS, section one'),
        `VAR-7 ({#await} at ${ms} ms): a block whose only dynamic part is {@html} sends its HTML as content`,
        'From the CMS'
    );
    const declined = ['"Item 0"', '"Item 1"', 'Mixed CMS text', 'Hi Ana', '"Hi {', 'Loading', 'Loaded after a moment'].filter((t) => sent.includes(t));
    check(declined.length === 0, `VAR-7 ({#await} at ${ms} ms): the {#each}, mixed {@html} and {#await} fallbacks are never sent`, JSON.stringify(declined));
    await ctx.close();
}

await browser.close();

console.log('');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}  —  ${r.d}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
