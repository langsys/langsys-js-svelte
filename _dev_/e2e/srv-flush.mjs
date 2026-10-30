/**
 * SRV-3 — a server render's misses are sent AFTER the response, and never from a key that
 * cannot write. Through the package's `createLangsysHandle`, against an SDK test clone through the
 * contract fixture's forwarder.
 *
 * The case's POST /translatable-items is answered 3 s late (a forwarder fault), so the order of
 * events is visible in two numbers: the page must arrive well inside 3 s (the flush did not hold
 * it), the phrase must be absent from the clone's catalog when the page arrives, and present after
 * the flush lands. The read-only run is the other half, with the write run as its control.
 *
 *     node _dev_/e2e/srv-flush.mjs --env write     # prints SRV_PROJECT and SRV_KEY for the dev server
 *     SRV_API=http://127.0.0.1:8787/api SRV_PROJECT=… SRV_KEY=… npm run dev    # fresh
 *     node _dev_/e2e/srv-flush.mjs --expect write  # starts the forwarder on 8787 itself
 *     # then restart the dev server with `--env read`'s values and run --expect read
 *
 * Each run is a case of its own on the clone (`_dev_/contract/cases.mjs`, suite 3).
 */
import { caseOf } from '../contract/cases.mjs';
import { startClone } from '../contract/clone.mjs';

const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
const FLUSH_DELAY_MS = 3000;
const CASES = { write: caseOf(3, 1), read: caseOf(3, 2) };
const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined);

const which = arg('--env') ?? arg('--expect');
if (which !== 'write' && which !== 'read') {
    console.error('usage: node _dev_/e2e/srv-flush.mjs --env write|read   (or --expect write|read)');
    process.exit(2);
}
const c = CASES[which];
const project = c.projects.app.id;
const key = c.keys[which].key;

if (arg('--env')) {
    console.log(`SRV_PROJECT=${project} SRV_KEY=${key}`);
    process.exit(0);
}

const results = [];
const check = (ok, n, d) => results.push({ ok: !!ok, n, d });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RUN = `r${Date.now() % 1_000_000}`;

const fx = await startClone();
await fx.update(c, { faults: [{ method: 'POST', path: '/translatable-items', delay_ms: FLUSH_DELAY_MS, times: 50 }] });
const registered = async (text) => (await fx.held(key, project, 'it-it')).phrases.includes(text);

// Warm the route (first request initialises the SDK on the server) and let its flush land.
const warm = await fetch(`${BASE}/e2e/srv-scope?locale=it-it&miss=${encodeURIComponent(`Flush warm ${RUN}`)}`);
check(
    warm.status === 200 && warm.headers.get('x-srv-seam') === 'core',
    'premise: the route answers through createLangsysHandle',
    `${warm.status} ${warm.headers.get('x-srv-seam')}`
);
// Without this, a read-only run passes for an SDK that never initialised — it sends nothing either.
check(
    warm.headers.get('x-srv-init') === `ok:${key}`,
    `premise: the SDK initialised on the server with the case's ${which} key`,
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
if (which === 'write') {
    check(later, 'SRV-3: after the response, a write key’s miss reaches the catalog', String(later));
} else {
    check(!later, 'SRV-3: a read-only key sends nothing, although a write key would (control: the --expect write run)', String(later));
}
await fx.stop();

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}  —  ${r.d}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed (${which})`);
process.exit(failed ? 1 : 0);
