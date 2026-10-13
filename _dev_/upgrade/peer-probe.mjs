// Audit row 1 (_dev_/upgrade/AUDIT.md): whether npm installs this package into an app on an older
// SvelteKit. Two stand-in packages carry only the peer fields — this tree's package.json and the
// v3.6.17 tag's — and each is packed and installed into an app on @sveltejs/kit 2.9.0 and 2.10.0,
// resolving the tree only (`--package-lock-only`). Needs the npm registry.
//
//   node _dev_/upgrade/peer-probe.mjs
//
// A tarball, not a directory: npm links a directory dependency and does not check its peers.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const WORK = mkdtempSync(resolve(tmpdir(), 'langsys-peer-probe-'));
const peers = (pkg) => ({ peerDependencies: pkg.peerDependencies, peerDependenciesMeta: pkg.peerDependenciesMeta });
const shapes = {
    tip: peers(JSON.parse(readFileSync(resolve(REPO, 'package.json'), 'utf8'))),
    '3.6.17': peers(JSON.parse(execFileSync('git', ['-C', REPO, 'show', 'v3.6.17:package.json']).toString())),
};

const tarballs = {};
for (const [name, fields] of Object.entries(shapes)) {
    const dir = resolve(WORK, `pkg-${name}`);
    mkdirSync(dir);
    writeFileSync(resolve(dir, 'package.json'), JSON.stringify({ name: `peer-probe-${name.replace(/\./g, '-')}`, version: '1.0.0', ...fields }));
    tarballs[name] = resolve(WORK, execFileSync('npm', ['pack', '--silent', '--pack-destination', WORK], { cwd: dir }).toString().trim());
}

console.log(`peer fields — tip: ${JSON.stringify(shapes.tip)}\n             3.6.17: ${JSON.stringify(shapes['3.6.17'])}\n`);
for (const kit of ['2.9.0', '2.10.0']) {
    for (const name of Object.keys(shapes)) {
        const app = resolve(WORK, `app-${kit}-${name}`);
        mkdirSync(app);
        const deps = { '@sveltejs/kit': kit, svelte: '5.0.0', '@sveltejs/vite-plugin-svelte': '^4.0.0', vite: '^5.0.0' };
        writeFileSync(resolve(app, 'package.json'), JSON.stringify({ name: 'app', version: '1.0.0', dependencies: deps }));
        const r = spawnSync('npm', ['install', '--package-lock-only', '--no-audit', '--no-fund', tarballs[name]], { cwd: app, encoding: 'utf8' });
        const eresolve = /ERESOLVE/.test(r.stderr + r.stdout);
        console.log(`Kit ${kit.padEnd(6)} · ${name.padEnd(6)} peer fields → npm exit ${r.status}${eresolve ? ' (ERESOLVE)' : ''}`);
    }
}
console.log(`\nwork directory: ${WORK}`);
