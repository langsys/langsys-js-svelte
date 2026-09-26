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

console.log(`seam: ${first.seam}\n`);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}  —  ${r.d}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
