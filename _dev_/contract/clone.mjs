/**
 * The contract fixture for this binding's harnesses (CONF-2): `contract-fixture/forwarder.mjs` in
 * front of an SDK test clone, a real Langsys API seeded from `seeds/` before the run. Every case in
 * `cases.mjs` is named to the forwarder at start, so a request any process sends under a case's key
 * reaches the clone whichever harness runs (the dev server's own `init()` among them); a harness
 * gives a case its faults or reference lists with `update`. It reads what the API accepted back
 * through the API's own routes: the catalog (`held`), and a block's stored content as the
 * project's seeded user reads it (`storedBlocks`). The hints the clone stored are the one result
 * no route returns (`hints`).
 *
 *     node _dev_/contract/clone.mjs --serve         # by hand: the forwarder, every case named, until ^C
 *
 * `LANGSYS_CONTRACT_TARGET` names the clone's origin and `LANGSYS_CONTRACT_CLONE_ROOT` its langsys
 * checkout, and without them this throws, so a harness never passes by skipping;
 * `NODE_EXTRA_CA_CERTS` names the CA the clone serves with, and `LANGSYS_CONTRACT_LOG` the
 * forwarder's log. The forwarder listens on `LANGSYS_FX_PORT` (default 8787), where
 * `vite.config.ts` proxies the testbed's same-origin `/__fx`.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allCases, setupOf } from './cases.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const FX_PORT = Number(process.env.LANGSYS_FX_PORT ?? 8787);

const keysOf = (c) => Object.values(c.keys).map((k) => k.key);

export async function startClone() {
    const target = process.env.LANGSYS_CONTRACT_TARGET;
    const cloneRoot = process.env.LANGSYS_CONTRACT_CLONE_ROOT;
    const log = process.env.LANGSYS_CONTRACT_LOG;
    if (!target || !cloneRoot) {
        throw new Error(
            'The contract harnesses run against an SDK test clone (spec CONF-2), and none is named: set LANGSYS_CONTRACT_TARGET to its origin, ' +
                'LANGSYS_CONTRACT_CLONE_ROOT to its langsys checkout, and NODE_EXTRA_CA_CERTS to the CA it serves with (_dev_/contract/README.md).'
        );
    }
    const args = ['--target', target, '--clone-root', cloneRoot, '--port', String(FX_PORT), ...(log ? ['--log', log] : [])];
    const child = spawn(process.execPath, [join(ROOT, 'contract-fixture/forwarder.mjs'), ...args], { stdio: ['ignore', 'pipe', 'inherit'] });
    const ready = await new Promise((resolve, reject) => {
        let out = '';
        child.stdout.on('data', (chunk) => {
            out += chunk.toString();
            if (out.includes('\n')) resolve(JSON.parse(out.slice(0, out.indexOf('\n'))));
        });
        child.once('exit', (code) => reject(new Error(`the forwarder exited (${code}): is port ${FX_PORT} free, and the clone up?`)));
    });

    const post = async (path, body) => {
        const res = await fetch(`${ready.fixture_url}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`the forwarder refused ${path}: ${res.status} ${await res.text()}`);
    };
    for (const c of allCases()) await post('/setup', setupOf(c));

    const get = async (path, headers) => {
        const res = await fetch(`${ready.base_url}${path}`, { headers: { accept: 'application/json', ...headers } });
        const body = await res.json().catch(() => null);
        if (!res.ok || !body) throw new Error(`${path} answered ${res.status}: ${JSON.stringify(body)}`);
        return body.data;
    };

    return {
        base: ready.base_url,
        fixture: ready.fixture_url,
        /** Changes a case's setup, named by its keys: the fields given replace the case's, and the rest stay. */
        update: (c, fields) => post('/setup', { keys: keysOf(c), ...fields }),
        /** What the catalog serves for a project at a locale, read with `key`: phrases by text (and by category), and blocks by id with their phrases. */
        async held(key, project, locale) {
            const data = await get(`/translations?project_id=${encodeURIComponent(project)}&locale=${encodeURIComponent(locale)}`, { 'x-authorization': key });
            const held = { phrases: [], categories: {}, blocks: {} };
            for (const [category, entries] of Object.entries(data && typeof data === 'object' && !Array.isArray(data) ? data : {})) {
                for (const [name, value] of Object.entries(entries && typeof entries === 'object' ? entries : {})) {
                    if (value && typeof value === 'object') held.blocks[name] = Object.keys(value).sort();
                    else (held.categories[category] ??= []).push(name);
                }
            }
            for (const phrases of Object.values(held.categories)) phrases.sort();
            held.phrases = Object.values(held.categories).flat().sort();
            return held;
        },
        /** The blocks a project holds, each with its category and the content it stored, as the project's seeded user reads them. */
        async storedBlocks(project, key, locale) {
            const rows = await get(`/translations/data?project_id=${encodeURIComponent(project.id)}&locale=${encodeURIComponent(locale)}`, {
                'x-authorization': key,
            });
            const blocks = [];
            for (const row of Object.values(rows && !Array.isArray(rows) ? rows : {}).flat()) {
                if (row.type !== 'content_block') continue;
                const item = await get(`/translatable-items/${encodeURIComponent(row.id)}`, {
                    authorization: `Bearer ${project.user.token}`,
                    'x-device-id': project.user.device_id,
                });
                blocks.push({ custom_id: row.custom_id ?? '', category: row.category, content: item.content ?? null });
            }
            return blocks.sort((a, b) => a.custom_id.localeCompare(b.custom_id));
        },
        /** The hints the clone stored for a case's projects, in the order it accepted them. */
        async hints(c) {
            const query = Object.values(c.projects)
                .map((p) => `project=${encodeURIComponent(p.id)}`)
                .join('&');
            const res = await fetch(`${ready.fixture_url}/state?${query}`);
            if (!res.ok) throw new Error(`the forwarder's state answered ${res.status}: ${await res.text()}`);
            return (await res.json()).hints;
        },
        stop: () =>
            new Promise((resolve) => {
                if (child.exitCode !== null) return resolve();
                child.once('exit', () => resolve());
                child.kill('SIGTERM');
            }),
    };
}

// By hand: start the forwarder with every case named, and list each case's project and keys.
if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes('--serve')) {
    const fx = await startClone();
    console.log(`forwarder: ${fx.base}, proxied by the dev server as /__fx/api`);
    for (const c of allCases()) {
        console.log(`\n${c.name}  (from ${c.caller})`);
        for (const [label, p] of Object.entries(c.projects)) console.log(`  project ${label.padEnd(8)} ${p.id}`);
        for (const [label, k] of Object.entries(c.keys)) console.log(`  key     ${label.padEnd(8)} ${k.key}  (${k.type})`);
    }
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => fx.stop().then(() => process.exit(0)));
}
