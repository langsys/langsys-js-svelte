// Audit rows 2, 7, 8, 9 and 15 (_dev_/upgrade/AUDIT.md): what a 3.6.17 app gets back from the
// surface it already uses, on core 0.6.5 and on the pinned core.
//
//   OLD_CORE=<built 0.6.5 checkout> NEW_CORE=<built checkout of the pinned core> node _dev_/upgrade/core-surface.mjs
//
// - rows 8, 9: `canonicalizeLocale` and `detectPreferredLocale`, which the binding re-exports by
//   reference, so the core's answer is the binding's;
// - row 15: what `init({})` prints with debug off;
// - row 2: every value export, type and `LangsysApp` member 3.6.17 published (read from the v3.6.17
//   tag) is still exported by src/lib/index.ts, and every member is on the pinned core's LangsysApp,
//   which the binding's Proxy forwards;
// - row 7: the id the pinned core's tree path gives a `%name%` block, beside its `{name}` form.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
if (!process.env.OLD_CORE || !process.env.NEW_CORE) {
    console.error('Set OLD_CORE and NEW_CORE to built core checkouts (see _dev_/upgrade/README.md).');
    process.exit(2);
}
const load = (dir, file = 'dist/index.mjs') => import(pathToFileURL(resolve(dir, file)).href);

const printed = [];
const real = { ...console };
for (const k of ['log', 'info', 'warn', 'error', 'debug']) console[k] = (...a) => printed.push(`${k}: ${a.map(String).join(' ').slice(0, 160)}`);

const out = {};
for (const [tag, dir] of [
    ['0.6.5', process.env.OLD_CORE],
    ['pinned', process.env.NEW_CORE],
]) {
    printed.length = 0;
    const m = await load(dir);
    const detect = (header, supported) => JSON.stringify(m.LangsysApp.detectPreferredLocale(header, supported));
    out[tag] = {
        canonicalizeLocale: Object.fromEntries(['en-US', 'zh-Hant-TW', 'pt_BR', 'EN-us', 'es'].map((l) => [l, m.canonicalizeLocale(l)])),
        detectPreferredLocale: {
            'fr-FR against [en-US, es-ES]': detect('fr-FR,fr;q=0.9', ['en-US', 'es-ES']),
            'es-ES against [en-US, es-ES]': detect('es-ES,es;q=0.9', ['en-US', 'es-ES']),
            'es-ES, no list': detect('es-ES,es;q=0.9'),
        },
        'init({}) result': JSON.stringify(await m.LangsysApp.init({})),
        'printed with debug off': [...printed],
    };
}

// Row 2: the 3.6.17 surface, read from the tag.
const published = execFileSync('git', ['-C', REPO, 'show', 'v3.6.17:src/lib/index.ts']).toString();
const tip = readFileSync(resolve(REPO, 'src/lib/index.ts'), 'utf8');
/** The names a module's export statements publish: `export { a, b as c }` blocks and declarations. */
const exported = (source) => {
    const fromBlocks = [...source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)].flatMap((b) =>
        b[1]
            .split(',')
            .map((s) =>
                s
                    .trim()
                    .split(/\s+as\s+/)
                    .pop()
            )
            .filter(Boolean)
    );
    const declared = [...source.matchAll(/export\s+(?:const|interface|type|class|function)\s+(\w+)/g)].map((m) => m[1]);
    return new Set([...fromBlocks, ...declared]);
};
const names = [...exported(published)];
const tipNames = exported(tip);
const members = [...published.matchAll(/public\s+(?:get\s+)?(\w+)\s*\(/g)].map((m) => m[1]);
const core = await load(process.env.NEW_CORE);
const missingNames = (list) => list.filter((n) => !tipNames.has(n));
const missingMembers = (list) => list.filter((k) => !(k in core.LangsysApp));
out['3.6.17 surface at the tip'] = {
    names: names.length,
    'names missing from src/lib/index.ts': missingNames(names),
    members: members.length,
    "members missing from the pinned core's LangsysApp": missingMembers(members),
    // Control: the same checks report a name and a member that do not exist.
    control: [...missingNames(['notExportedByLangsys']), ...missingMembers(['notALangsysMember'])],
};

// Row 7: the tree path's id for `%name%`, beside the `{name}` marker form.
const pure = await load(process.env.NEW_CORE, 'dist/pure.mjs');
const treeId = (children) => {
    const { tokens } = core.tokenizeTree([{ tag: 'p', attrs: {}, children }]);
    return `${JSON.stringify(tokens)} ${pure.generateCustomId('UI', tokens)}`;
};
out['tree path, pinned core'] = {
    'Hello %name%': treeId([{ text: 'Hello %name%' }]),
    'Hello {name} (marker pair)': treeId([{ text: 'Hello ' }, { comment: 'ls:name' }, { text: 'Ana' }, { comment: '/ls' }]),
};

real.log(JSON.stringify(out, null, 2));
process.exit(0);
