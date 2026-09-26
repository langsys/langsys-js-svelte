/**
 * SRV-7 — the request scope, through SvelteKit's request lifecycle (`src/hooks.server.ts`).
 *
 * Runs against whichever seam the dev server was started with (`SRV_SEAM`, see
 * `src/srv-scope/seam.ts`), reported back in each response's `x-srv-seam` header:
 *
 *     SRV_SEAM=core   npm run dev    # the core's scope — the evidence SRV-1..5 and SRV-7 need
 *     SRV_SEAM=global npm run dev    # no scope (the default until the core ships one)
 *     SRV_SEAM=shared npm run dev    # SRV-7's mutation: one scope for every request
 *     node _dev_/e2e/srv-scope.mjs
 *
 * The rule's own Test, on served bytes:
 *   1. one process: render `de-de`, then `it-it` through a new scope — the second response is
 *      Italian, with no German in its bytes;
 *   2. concurrent `it-it` and `de-de` renders, each awaiting before it reads — every response
 *      carries only its own locale (SRV-2).
 * Case 1 alone passes whenever each request seeds its own globals, which is why case 2 is there;
 * case 2 is what a scope has to fix. Give every run a freshly started server.
 */
const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
const ROUNDS = Number(process.env.SRVC_ROUNDS ?? 100);
const CONCURRENCY = 8;

// Restated from src/routes/e2e/srv-concurrency/fixture.ts (TypeScript, compiled by Vite).
const SERVED = { 'it-it': 'Prezzi', 'de-de': 'Preise' };

const results = [];
const pass = (n, d) => results.push({ ok: true, n, d });
const fail = (n, d) => results.push({ ok: false, n, d });
const check = (c, n, d) => (c ? pass(n, d) : fail(n, d));

async function render(locale, n) {
    const res = await fetch(`${BASE}/e2e/srv-scope?locale=${locale}&n=${n}`);
    const html = await res.text();
    const served = html.match(/<p data-testid="srvc" data-locale="[^"]+">([^<]*)<\/p>/)?.[1]?.trim();
    return { locale, served, seam: res.headers.get('x-srv-seam'), status: res.status, html };
}

const first = await render('de-de', 0);
check(first.status === 200 && first.seam, 'premise: the route answers through a seam', `${first.status} seam=${first.seam}`);
check(first.served === SERVED['de-de'], 'premise: a German render serves German', String(first.served));

// The scope's hydration seed is in the page, for its own locale (SRV-4's hand-off).
const seedOf = (html) => {
    const m = html.match(/window\.__LANGSYS_SEED__=(\{.*?\})<\/script>/);
    return m ? JSON.parse(m[1]) : null;
};
check(
    seedOf(first.html)?.locale === 'de-de',
    'the page carries its scope\u2019s hydration seed, for its own locale',
    JSON.stringify(seedOf(first.html)?.locale)
);

// Case 1 — de then it, one process, a new scope for the second.
const second = await render('it-it', 1);
check(second.served === SERVED['it-it'], 'SRV-7 case 1: after a German render, the next scope serves Italian', String(second.served));
check(
    !second.html.includes(SERVED['de-de']),
    'SRV-7 case 1: no German in the Italian response’s bytes',
    second.html.includes(SERVED['de-de']) ? 'Preise present' : 'clean'
);

// Case 2 — concurrent it/de, each awaiting before it reads.
let wrong = 0;
let total = 0;
for (let r = 0; r < ROUNDS; r++) {
    const batch = await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => render(i % 2 ? 'de-de' : 'it-it', 10 + r * CONCURRENCY + i)));
    for (const b of batch) {
        total += 1;
        if (b.served !== SERVED[b.locale]) wrong += 1;
    }
}
check(wrong === 0, 'SRV-7 case 2 / SRV-2: concurrent renders awaiting before the read each serve their own locale', `${wrong}/${total} wrong`);

// SRV-4's binding half: `hooks.client.ts` hands the scope's seed to `seedCatalog` before
// hydration, so the first client render agrees with the served bytes. Control: the same page with
// the seed left out (`?noseed=1`) — the client then renders from an empty catalog and the text
// changes after hydration, which is the failure the hand-off prevents.
{
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    const hydrated = async (query) => {
        const page = await (await browser.newContext()).newPage();
        page.setDefaultNavigationTimeout(90_000);
        const warnings = [];
        page.on('console', (m) => (m.type() === 'warning' || m.type() === 'error') && warnings.push(m.text()));
        await page.goto(`${BASE}/e2e/srv-scope?locale=it-it&${query}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);
        return { text: (await page.locator('[data-testid="srvc"]').textContent()).trim(), warnings };
    };
    const seeded = await hydrated('n=hydrate');
    const unseeded = await hydrated('n=hydrate&noseed=1');
    await browser.close();
    check(seeded.text === SERVED['it-it'], 'SRV-4: with the scope\u2019s seed, the hydrated page keeps the served Italian', seeded.text);
    check(!seeded.warnings.some((w) => /hydrat|mismatch/i.test(w)), 'SRV-4: no hydration warning with the seed', JSON.stringify(seeded.warnings.slice(0, 2)));
    check(unseeded.text !== SERVED['it-it'], 'SRV-4 control: without the seed the client re-renders away from the served text', unseeded.text);
}

console.log(`seam: ${first.seam}\n`);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}  —  ${r.d}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
