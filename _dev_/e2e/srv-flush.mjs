/**
 * SRV-3 — a server render's misses are sent AFTER the response, and never from a key that
 * cannot write. Through the package's `createLangsysHandle`, against the contract double.
 *
 * The double's POST /translatable-items is seeded to answer 3 s late, so the order of events is
 * visible in two numbers: the page must arrive well inside 3 s (the flush did not hold it), the
 * phrase must be absent from the double's state when the page arrives, and present after the
 * flush lands. The read-only run is the other half, with the write run as its control.
 *
 *     node _dev_/e2e/srv-flush.mjs --serve       # terminal 1: starts the double on :8787 and seeds it
 *     SRV_API=http://127.0.0.1:8787/api SRV_KEY=k-write npm run dev    # terminal 2, fresh
 *     node _dev_/e2e/srv-flush.mjs --expect write                      # terminal 3
 *     # then restart the dev server with SRV_KEY=k-read and run --expect read
 *
 * `--serve` keeps the double running; each `--expect` run re-seeds it.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
const FX = 'http://127.0.0.1:8787/__fixture';
const FLUSH_DELAY_MS = 3000;

const SEED = {
    projects: [{ id: 'p1', base_locale: 'en-us', target_locales: ['it-it', 'de-de'] }],
    keys: [
        { key: 'k-write', project: 'p1', type: 'write' },
        { key: 'k-read', project: 'p1', type: 'read' },
    ],
    faults: [{ method: 'POST', path: '/translatable-items', delay_ms: FLUSH_DELAY_MS, times: 50 }],
};

if (process.argv.includes('--serve')) {
    spawn(process.execPath, [join(ROOT, 'contract-fixture/server.mjs'), '--port', '8787'], { stdio: 'inherit' });
} else {
    const expect = process.argv[process.argv.indexOf('--expect') + 1];
    if (expect !== 'write' && expect !== 'read') {
        console.error('usage: node _dev_/e2e/srv-flush.mjs --expect write|read   (or --serve)');
        process.exit(2);
    }
    const results = [];
    const check = (c, n, d) => results.push({ ok: !!c, n, d });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const seed = (doc) => fetch(`${FX}/seed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(doc) });
    const registered = async (text) => JSON.stringify((await (await fetch(`${FX}/state`)).json()).projects.p1.phrases).includes(text);
    const RUN = `r${Date.now() % 1_000_000}`;

    await seed(SEED);

    // Warm the route (first request initialises the SDK on the server) and let its flush land.
    const warm = await fetch(`${BASE}/e2e/srv-scope?locale=it-it&miss=${encodeURIComponent(`Flush warm ${RUN}`)}`);
    check(
        warm.status === 200 && warm.headers.get('x-srv-seam') === 'core',
        'premise: the route answers through createLangsysHandle',
        `${warm.status} ${warm.headers.get('x-srv-seam')}`
    );
    // Without this, a read-only run passes for an SDK that never initialised — it sends nothing either.
    check(
        warm.headers.get('x-srv-init') === `ok:k-${expect}`,
        `premise: the SDK initialised on the server with the ${expect} key`,
        String(warm.headers.get('x-srv-init'))
    );
    await sleep(FLUSH_DELAY_MS + 2000);

    const phrase = `Flush probe ${RUN}`;
    const t0 = Date.now();
    const res = await fetch(`${BASE}/e2e/srv-scope?locale=it-it&miss=${encodeURIComponent(phrase)}`);
    const html = await res.text();
    const elapsed = Date.now() - t0;
    const atResponse = await registered(phrase);

    check(html.includes(phrase), 'premise: the page rendered the missing phrase (a miss the scope recorded)', `${elapsed} ms`);
    check(elapsed < FLUSH_DELAY_MS - 1000, 'SRV-3: the response did not wait for the flush', `${elapsed} ms, flush answers after ${FLUSH_DELAY_MS} ms`);
    check(!atResponse, 'SRV-3: nothing was registered by the time the response arrived', String(atResponse));

    await sleep(FLUSH_DELAY_MS + 3000);
    const later = await registered(phrase);
    if (expect === 'write') {
        check(later, 'SRV-3: after the response, a write key’s miss reaches the catalog', String(later));
    } else {
        check(!later, 'SRV-3: a read-only key sends nothing, although a write key would (control: the --expect write run)', String(later));
    }

    for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}  —  ${r.d}`);
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - failed}/${results.length} passed (${expect})`);
    process.exit(failed ? 1 : 0);
}
