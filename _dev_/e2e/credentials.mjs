/**
 * WIRE-4 under `requireCredentials`, in a browser, in SvelteKit's own order: the page's blocks
 * mount first, and the root layout calls `init()` in `onMount`, after its children. With no key the
 * client is unconfigured, and every block's registration must fail loudly — each surfacing a
 * `LangsysConfigurationError` — while the page still shows the text as written.
 *
 *     npm run dev                                   # 127.0.0.1:5173, freshly started
 *     node _dev_/e2e/credentials.mjs                # no double needed: nothing is sent
 *
 * `/fixture/var` (with the transform) holds blocks that register: tree-path <Translate> and <Phrase>
 * blocks and an {@html}-only block on the core's DOM class. Its fallback blocks run with
 * `register: false`, a read that never reaches `t()`, and so never fail. `/fixture/var-plain`
 * (without the transform) is all such reads: nothing registers there, so nothing fails.
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
    check(errors.length >= 5, 'each registering block, mounted before init(), surfaces its failure', `${errors.length} surfaced`);
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
    check(errors.length === 0, 'without the transform nothing registers, so nothing fails: its blocks only read the catalog', `${errors.length} surfaced`);
    await page.close();
}

await browser.close();
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}${r.ok || r.d === undefined ? '' : `\n      ${r.d}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
