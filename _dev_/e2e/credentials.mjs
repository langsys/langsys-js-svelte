/**
 * WIRE-4 under `requireCredentials`, in a browser, in SvelteKit's own order: the page's blocks
 * mount first, and the root layout calls `init()` in `onMount`, after its children. With no key the
 * client is unconfigured, and the page's blocks must fail loudly — each failure a
 * `LangsysConfigurationError` — while the page still shows the text as written.
 *
 *     npm run dev                                   # 127.0.0.1:5173, freshly started
 *     node _dev_/e2e/credentials.mjs                # no double needed: nothing is sent
 *
 * `/fixture/var` (with the transform) holds tree-path <Translate> and <Phrase> blocks, an
 * {@html}-only block on the core's DOM class, and fallback blocks. `/fixture/var-plain` (without
 * it) holds only `register: false` blocks — one phrase, several, a <Phrase>, one mounted after
 * `init()` — which read the catalog and never fail.
 */
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
const results = [];
const check = (c, n, d) => results.push({ ok: !!c, n, d });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
async function visit(path) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`${e.name}: ${e.message}`));
    await page.goto(`${BASE}${path}`, { timeout: 90_000 });
    await page.waitForFunction(() => document.querySelector('[data-testid=fx-status]')?.textContent !== 'idle', null, { timeout: 60_000 });
    await sleep(3000); // past the {#await} block's 1.5 s
    return { page, errors };
}

{
    const { page, errors } = await visit('/fixture/var?key=&require=1&user=Ana');
    check(
        (await page.textContent('[data-testid=fx-status]')) === 'error',
        'premise: init() without a key leaves the client unconfigured',
        await page.textContent('[data-testid=fx-status]')
    );
    check((await page.textContent('#greet')) === 'Hello Ana, welcome back', 'the page shows the text as written', await page.textContent('#greet'));
    check(
        errors.every((e) => /LangsysConfigurationError/.test(e)),
        'every surfaced error is a LangsysConfigurationError',
        JSON.stringify(errors)
    );
    check(errors.length >= 5, "the page's blocks, mounted before init(), surface the failure", `${errors.length} surfaced`);
    await page.close();
}
{
    // Control: the same page with no key, without `requireCredentials`: the errors above are that
    // option's, and nothing fails without it.
    const { page, errors } = await visit('/fixture/var?key=&user=Ana');
    check(errors.length === 0, 'control: without requireCredentials the same page surfaces nothing', JSON.stringify(errors));
    await page.close();
}
{
    const { page, errors } = await visit('/fixture/var-plain?key=&require=1&user=Ana');
    check(errors.length === 0, 'a register: false block never fails: one phrase, several, a <Phrase>, before and after init()', JSON.stringify(errors));
    await page.close();
}

await browser.close();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}${r.ok || r.d === undefined ? '' : `\n      ${r.d}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
