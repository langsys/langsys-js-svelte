/**
 * Measures README.md's "Blocks the transform cannot read" table on the linked core: a block on the
 * core's DOM class, translated, then changed by Svelte. Hydrated (`/fixture/freeze`) and
 * client-only (`/fixture/freeze-csr`). Prints a table; asserts nothing.
 *
 *     npm run dev                                   # 127.0.0.1:5173, freshly started
 *     node _dev_/e2e/freeze.mjs                     # starts the double on :8787 itself
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
const FX = 'http://127.0.0.1:8787/__fixture';
const it = {
    'Branch one': 'Ramo uno',
    'Branch two': 'Ramo due',
    'First message': 'Primo messaggio',
    'Second message': 'Secondo messaggio',
    Waiting: 'In attesa',
    'Loaded text': 'Testo caricato',
    'Fixed text': 'Testo fisso',
};
const double = spawn(process.execPath, [join(ROOT, 'contract-fixture/server.mjs'), '--port', '8787'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
    for (let i = 0; i < 40; i++) {
        if (
            await fetch(`${FX}/state`).then(
                (r) => r.ok,
                () => false
            )
        )
            break;
        await sleep(250);
    }
    await fetch(`${FX}/seed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            projects: [
                {
                    id: 'p1',
                    base_locale: 'en-us',
                    target_locales: ['it-it'],
                    phrases: Object.entries(it).map(([phrase, t]) => ({ category: 'FRZ', phrase, translations: { 'it-it': t } })),
                },
            ],
            keys: [{ key: 'k-public', project: 'p1', type: 'read' }],
        }),
    });
    const browser = await chromium.launch();
    const ids = ['if', 'expr', 'store-expr', 'store-if', 'await', 'two-expr'];
    for (const route of ['freeze', 'freeze-csr']) {
        const page = await browser.newPage();
        await page.goto(`${BASE}/fixture/${route}?key=k-public&locale=it-it`, { timeout: 90_000 });
        await page.waitForFunction(() => document.querySelector('[data-testid=fx-status]')?.textContent === 'ready', null, { timeout: 60_000 });
        await sleep(2500);
        const before = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, (await page.textContent(`#${id}`))?.trim()])));
        await page.evaluate(() => window.__freeze());
        await sleep(2500);
        const after = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, (await page.textContent(`#${id}`))?.trim()])));
        console.log(`\n${route}`);
        for (const id of ids) console.log(`  ${id.padEnd(11)} ${String(before[id]).padEnd(18)} → ${after[id]}`);
        await page.close();
    }
    await browser.close();
} finally {
    double.kill();
}
