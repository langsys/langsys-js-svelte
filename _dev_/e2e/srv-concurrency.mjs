/**
 * SRV-1 / SRV-2 — do concurrent server renders in different locales observe each other's
 * catalog through README-SSR's process-global seed?
 *
 * Two shapes, same harness, same concurrency:
 *   body — the documented pattern: `load` returns the catalog, the component body seeds it
 *   load — POSITIVE CONTROL: `load` seeds, then awaits before rendering (README-SSR's
 *          measured-unsafe placement). If this shows no leak, the harness cannot see
 *          interleaving and the `body` result means nothing.
 *
 * Served bytes only — the HTML each request receives, never a hydrated DOM. Synthetic
 * catalogs, no API.
 *
 * Run against a FRESHLY STARTED dev server, on its own: both shapes write process-global
 * signals, which would contaminate `verify.mjs` if they shared a process.
 *
 *     npm run dev                                  # terminal 1, 127.0.0.1:5173, fresh
 *     node _dev_/e2e/srv-concurrency.mjs           # terminal 2
 *
 * SRVC_ROUNDS (default 100) × 8 concurrent requests per round, half `it-it`, half `de-de`.
 */
const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
const ROUNDS = Number(process.env.SRVC_ROUNDS ?? 100);
const CONCURRENCY = 8;

// Restated from src/routes/e2e/srv-concurrency/fixture.ts. It cannot be imported: that
// module is TypeScript compiled by Vite, and this harness runs under plain node.
const SERVED = { 'it-it': 'Prezzi', 'de-de': 'Preise' };
const BASE_LANGUAGE = 'Pricing';

const results = [];
const pass = (n, d) => results.push({ ok: true, n, d });
const fail = (n, d) => results.push({ ok: false, n, d });

async function render(shape, locale, n) {
    const res = await fetch(`${BASE}/e2e/srv-concurrency/${shape}?locale=${locale}&n=${n}`);
    const html = await res.text();
    const m = html.match(/<p data-testid="srvc" data-locale="([^"]+)">([^<]*)<\/p>/);
    const served = m?.[2]?.trim();
    const kind =
        res.status !== 200 || !m
            ? 'missing'
            : m[1] !== locale
              ? 'wrong-data'
              : served === SERVED[locale]
                ? 'right'
                : Object.values(SERVED).includes(served)
                  ? 'wrong-locale'
                  : served === BASE_LANGUAGE
                    ? 'base'
                    : 'missing';
    return { locale, served, kind, status: res.status };
}

const measured = {};

for (const shape of ['body', 'load']) {
    // Premise: each locale serves its own translation when nothing runs beside it. Without
    // this, "wrong locale under concurrency" could be a catalog that never worked at all.
    const alone = [await render(shape, 'it-it', -1), await render(shape, 'de-de', -2)];
    if (alone.every((r) => r.kind === 'right'))
        pass(`${shape}: each locale serves its own translation when rendered alone`, alone.map((r) => r.served).join(' / '));
    else fail(`${shape}: each locale serves its own translation when rendered alone`, JSON.stringify(alone));

    const tally = { right: 0, 'wrong-locale': 0, base: 0, 'wrong-data': 0, missing: 0 };
    for (let r = 0; r < ROUNDS; r++) {
        const batch = await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => render(shape, i % 2 ? 'de-de' : 'it-it', r * CONCURRENCY + i)));
        for (const b of batch) tally[b.kind] += 1;
    }
    const total = ROUNDS * CONCURRENCY;
    measured[shape] = { ...tally, total };

    // Premise: every concurrent response rendered the probe for the locale it asked for.
    if (tally.missing === 0 && tally['wrong-data'] === 0) pass(`${shape}: every concurrent response carried the probe`, `${total}/${total}`);
    else fail(`${shape}: every concurrent response carried the probe`, JSON.stringify(tally));
}

// The control. The measurement below is only readable if the same harness sees a leak here.
if (measured.load['wrong-locale'] > 0)
    pass('control: seed-then-await in load DOES leak under this concurrency', `${measured.load['wrong-locale']}/${measured.load.total} wrong-locale`);
else
    fail(
        'control: seed-then-await in load DOES leak under this concurrency',
        `0/${measured.load.total} — the harness cannot see interleaving; the body result means nothing`
    );

// The measurement. Recorded either way; it is the grade's evidence, not a pass condition.
pass(
    measured.body['wrong-locale'] === 0
        ? 'MEASURED: the component-body seed served every concurrent request its own locale'
        : 'MEASURED: the component-body seed LEAKED between concurrent requests',
    `${measured.body['wrong-locale']}/${measured.body.total} wrong-locale, ${measured.body.base} base-language`
);

console.log('');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}  —  ${r.d}`);
console.log(`\nbody ${JSON.stringify(measured.body)}\nload ${JSON.stringify(measured.load)}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
