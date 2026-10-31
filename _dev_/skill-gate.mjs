#!/usr/bin/env node
/**
 * skill-gate — the agent skill in `skill/` names only what the built package has.
 *
 * The skill ships in the package, and an agent trusts every name in it. So it is checked against
 * the build an agent's project installs, `dist/`, and against the core this package depends on:
 *
 * - every name a code example imports from `langsys-js-svelte`, one of its entries, or
 *   `langsys-js-typescript`, is an export of that entry, a value or a type;
 * - every `LangsysApp.x` is a member of the Svelte `LangsysApp`, and every `LangsysAppAPI.x` of the
 *   core's API client;
 * - every SDK-shaped name in inline code (a call, or an identifier with a capital in it) is an
 *   export, or a member some declaration in either build has, and every `$name` is a store this
 *   package exports. A name only `LangsysApp` has reads as an export when bare, so its file names
 *   it as `LangsysApp.x` at least once;
 * - the option keys an example passes to `LangsysApp.init`, `createLangsysHandle` and
 *   `langsysPreprocess`, and the attributes it writes on `<Translate>`, `<Phrase>` and
 *   `<DontTranslate>`, are ones their declarations have;
 * - each table of props or options lists exactly what its component or function declares;
 * - every Svelte example compiles with no error or warning, and passes the build transform with no
 *   warning, so an example never shows a block the transform can't read; every example that opens
 *   with the file it is (`// src/hooks.server.ts`, `<!-- src/routes/+layout.svelte -->`) type-checks
 *   with the others of its skill file, as one SvelteKit app over this package's build; and every
 *   fence names its language, one of svelte, ts, js and bash;
 * - transform.md's list of what makes a block a fallback names every element and construct the
 *   built transform declines by name, and the transform declines every construct the list names;
 * - every entry it names is in package.json `exports` and built, every file it names in
 *   `node_modules/langsys-js-svelte/` ships, and every core skill file it names in
 *   `node_modules/langsys-js-typescript/skill/` exists in the installed core;
 * - the installed core ships its skill, and package.json's range for the core admits no version
 *   without one (the first is 0.7.1).
 *
 * It also carries the shared Langsys skill preamble word for word (`skill/preamble.md`, this
 * package's copy of langsys-skill's template), states the name and the version package.json holds
 * (the release script stamps the version as it bumps), links only files that exist, links every
 * topic file from SKILL.md, and ships: package.json `files` lists `skill`, and `npm pack` packs it.
 *
 * Each check carries a planted defect it must report, run before the real check, so a checker that
 * stopped seeing names fails its control rather than reporting a clean skill.
 *
 * Not checked: types and defaults in the tables, what the prose claims a name does, which entry an
 * inline name comes from, option keys of objects not passed straight to the three calls, types in
 * an example that does not name its file, and whether an outside URL resolves.
 *
 * Reads dist/, so `npm run package` comes first; a dist/ older than src/lib is refused.
 *
 *     node _dev_/skill-gate.mjs [rootDir]
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? '.');
const SKILL = join(ROOT, 'skill');
const DIST = join(ROOT, 'dist');
const CORE = join(ROOT, 'node_modules', 'langsys-js-typescript');

/** The first core release that ships its skill, which this skill's preamble sends the agent to. */
const CORE_WITH_SKILL = '0.7.1';

/** Names in inline code that are not the package's, by kind: Svelte and SvelteKit, the platform, and the app's own example code. */
const NOT_THE_PACKAGES = new Set([
    // Svelte and SvelteKit
    'onMount',
    'untrack',
    'writable',
    'get',
    'afterNavigate',
    'vitePreprocess',
    'ServerInit',
    'LayoutServerLoad',
    'RequestEvent',
    'Writable',
    'Readable',
    // platform and runtime
    'AsyncLocalStorage',
    'innerHTML',
    // the app's own code and environment in the examples
    'reviewCount',
    'fetchGrant',
    'PUBLIC_LANGSYS_PROJECT_ID',
    'PUBLIC_LANGSYS_API_KEY',
    'VITE_LANGSYS_PROJECT_ID',
    'VITE_LANGSYS_API_KEY',
]);

/** Svelte runes, and the generic `$store` the prose names, which a `$name` may be besides a store this package exports. */
const NOT_STORES = new Set(['state', 'props', 'derived', 'effect', 'store']);

/** The components the examples write, and their props' declaration files. */
const COMPONENTS = ['Translate', 'Phrase', 'DontTranslate'];

/** The calls whose option keys an example passes are checked, by the option set they take. */
const OPTION_CALLS = { 'LangsysApp.init': 'init', createLangsysHandle: 'handle', langsysPreprocess: 'preprocess' };

/** The languages a fence may name. A component example in any other fence would escape the compile, transform and prop checks. */
const FENCE_LANGUAGES = new Set(['svelte', 'ts', 'js', 'bash']);

/**
 * What transform.md's fallback list names, each with a block body the built transform must decline.
 * The build's own lists (its opaque elements, and the constructs it names by their syntax) are read
 * from dist/ and need no entry here, except a probe for a construct a block can't hold bare.
 */
const FALLBACK_PROBES = [
    ['`{#each}`', '{#each xs as x}<p>{x}</p>{/each}'],
    ['`{#await}`', '{#await p}<p>Hi</p>{/await}'],
    ['`{#snippet}`', '{#snippet s()}<p>Hi</p>{/snippet}'],
    ['`{@render}`', '{@render s()}'],
    ['`{@const}`', '{#if v}{@const w = v}<p>{w}</p>{/if}'],
    ['`{@html}` beside a variable', '<p>{@html h} {t}</p>'],
    ['`<svelte:element>`', '<svelte:element this={t}>Hi</svelte:element>'],
    ['`<svelte:boundary>`', '<svelte:boundary><p>Hi</p></svelte:boundary>'],
    ['another component', '<Other />'],
    ['`bind:`', '<input bind:value={v} placeholder="Name">'],
    ['`use:`', '<p use:f>Hi</p>'],
    ['`class:`', '<p class:on={v}>Hi</p>'],
    ['`style:`', '<p style:color={v}>Hi</p>'],
    ['a transition', '<p transition:f>Hi</p>'],
    ['`{@attach}`', '<p {@attach f}>Hi</p>'],
    ['a spread', '<p {...attrs}>Hi</p>'],
    ['a `translate` or `data-notrans` attribute whose value is an expression', '<p translate={v}>Hi</p>'],
    ['an `<input>` whose `type` is an expression', '<input type={v} value="Go">'],
    ['A `label`', '<Translate label="x"><p>Hi</p></Translate>'],
    ['a `category` of its own', '<Phrase category="Other">Hi</Phrase>'],
];
/** Bodies for the build's opaque elements that a block can't hold bare. */
const OPAQUE_PROBES = { script: '<p><script></script></p>', style: '<p><style></style></p>' };

/** Which declaration each table of props or options lists, by its file and the heading above it. */
const TABLES = {
    'components.md#`<Translate>`': ['props', 'Translate'],
    'components.md#`<Phrase>`': ['props', 'Phrase'],
    'components.md#`<DontTranslate>`': ['props', 'DontTranslate'],
    'sveltekit.md#Options': ['options', 'handle'],
    'transform.md#Options': ['options', 'preprocess'],
};

/** Whether a bare name is shaped like an SDK name: a call, camelCase with a hump, PascalCase with two humps, or UPPER_SNAKE. */
function sdkShaped(name, isCall) {
    return isCall || /^[a-z][a-z0-9]*[A-Z]/.test(name) || /^[A-Z][a-z0-9]*[A-Z][a-z]/.test(name) || /^[A-Z][A-Z0-9]*_[A-Z0-9_]+$/.test(name);
}

// ── reading the builds ───────────────────────────────────────────────────────

/** The names an `export { … }` or `export type { … }` list makes public, `X as Y` read as `Y`, plus `export declare …` names. */
function exportedNames(dts) {
    const names = new Set();
    for (const m of dts.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
        for (const spec of m[1].split(',')) {
            const name = spec
                .trim()
                .replace(/^type\s+/, '')
                .split(/\s+as\s+/)
                .pop()
                ?.trim();
            if (name) names.add(name);
        }
    }
    for (const m of dts.matchAll(/export\s+(?:declare\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) names.add(m[1]);
    return names;
}

/** A member line at a declaration's own depth (four spaces in the built .d.ts), and whether it's private. */
const MEMBER_LINE = /^ {4}((?:(?:private|protected|public|readonly|static|abstract|get|set)\s+)*)([A-Za-z_$][\w$]*)\??\s*[:(<;]/gm;

/** Each top-level class and interface in a declaration file, by name, with its public members, and the text outside them. */
function declarations(dts) {
    const bodies = new Map();
    let rest = '';
    let at = 0;
    for (const m of dts.matchAll(/^(?:export )?(?:declare )?(?:abstract )?(?:class|interface) ([A-Za-z_$][\w$]*)[^{\n]*\{$/gm)) {
        const open = m.index + m[0].length - 1;
        if (open < at) continue;
        let depth = 0;
        let close = open;
        for (; close < dts.length; close++) {
            if (dts[close] === '{') depth++;
            else if (dts[close] === '}' && --depth === 0) break;
        }
        const names = bodies.get(m[1]) ?? new Set();
        for (const line of dts.slice(open + 1, close).matchAll(MEMBER_LINE)) if (!/\b(private|protected)\b/.test(line[1])) names.add(line[2]);
        bodies.set(m[1], names);
        rest += dts.slice(at, m.index);
        at = close + 1;
    }
    return { bodies, rest: rest + dts.slice(at) };
}

/** The Svelte `LangsysApp`: the core class's public members, minus what the binding omits, plus what it declares itself. */
function svelteAppSurface(dts, core) {
    const m = dts.match(/type LangsysAppSvelte = Omit<typeof \w+, ([^>]*)> & \{([\s\S]*?)\n\};/);
    if (!m) return null;
    const drop = new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
    const names = new Set([...core].filter((n) => !drop.has(n)));
    for (const a of m[2].matchAll(/^\s*([A-Za-z_$][\w$]*)\s*[(?:]/gm)) names.add(a[1]);
    return names;
}

const dtsFiles = (dir) =>
    readdirSync(dir, { recursive: true })
        .map(String)
        .filter((f) => f.endsWith('.d.ts') && !/\.(test|spec)\.d\.ts$/.test(f))
        .map((f) => join(dir, f));

function typesTarget(entry) {
    if (typeof entry === 'string') return entry;
    return entry && typeof entry === 'object' ? (entry.types ?? undefined) : undefined;
}

function floorOf(range) {
    const m = String(range).match(/^(?:\^|~|>=)?\s*(\d+)\.(\d+)\.(\d+)$/);
    return m ? m.slice(1).map(Number) : null;
}
const below = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * Type-check example files together as one SvelteKit app over this package's build, as an app that
 * installed it would: its node_modules is this repo's, with `langsys-js-svelte` this package. Returns
 * the type errors in the example files. Cached by content, since every control re-reads the skill.
 */
const typechecked = new Map();
function typecheck(files) {
    const key = createHash('sha256')
        .update(JSON.stringify(Object.entries(files).sort()))
        .digest('hex');
    if (typechecked.has(key)) return typechecked.get(key);
    const app = mkdtempSync(join(tmpdir(), 'skill-gate-'));
    try {
        const write = (path, text) => {
            mkdirSync(dirname(join(app, path)), { recursive: true });
            writeFileSync(join(app, path), text);
        };
        write('package.json', '{ "name": "skill-example", "private": true, "type": "module" }\n');
        write('svelte.config.js', 'export default { kit: {} };\n');
        write('tsconfig.json', '{ "extends": "./.svelte-kit/tsconfig.json", "compilerOptions": { "strict": true, "skipLibCheck": true, "types": [] } }\n');
        write('.env', 'PUBLIC_LANGSYS_PROJECT_ID=p\nPUBLIC_LANGSYS_API_KEY=k\nLANGSYS_PROJECT_ID=p\nLANGSYS_API_KEY=k\n');
        write('src/app.html', '<!doctype html><html><head>%sveltekit.head%</head><body>%sveltekit.body%</body></html>\n');
        write('src/routes/+page.svelte', '<p>Page</p>\n');
        for (const [path, code] of Object.entries(files)) write(path, code);
        mkdirSync(join(app, 'node_modules'));
        for (const entry of readdirSync(join(ROOT, 'node_modules'))) symlinkSync(join(ROOT, 'node_modules', entry), join(app, 'node_modules', entry));
        symlinkSync(ROOT, join(app, 'node_modules', 'langsys-js-svelte'));

        const run = (script, args) => {
            try {
                return execFileSync(process.execPath, [join(ROOT, 'node_modules', script), ...args], {
                    cwd: app,
                    encoding: 'utf8',
                    stdio: ['ignore', 'pipe', 'pipe'],
                });
            } catch (e) {
                return `${e.stdout ?? ''}${e.stderr ?? ''}`;
            }
        };
        run('@sveltejs/kit/svelte-kit.js', ['sync']);
        const out = run('svelte-check/bin/svelte-check', ['--tsconfig', './tsconfig.json', '--output', 'machine']);
        const errors = [...out.matchAll(/ ERROR "([^"]+)" (\d+:\d+) "((?:[^"\\]|\\.)*)"/g)].map((m) => `${m[1]}:${m[2]} ${m[3].split('\\n')[0]}`);
        if (!/ COMPLETED /.test(out)) errors.push(`svelte-check did not complete: ${out.trim().split('\n').pop()}`);
        typechecked.set(key, errors);
        return errors;
    } finally {
        rmSync(app, { recursive: true, force: true });
    }
}

/** The paths `npm pack --dry-run --json` lists. npm 10 and 11 print an array of results, npm 12 an object keyed by package name. */
function packedPaths(out) {
    const parsed = JSON.parse(out);
    const [result] = Array.isArray(parsed) ? parsed : Object.values(parsed);
    return new Set(result.files.map((f) => f.path));
}

async function buildFacts() {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const corePkg = existsSync(join(CORE, 'package.json')) ? JSON.parse(readFileSync(join(CORE, 'package.json'), 'utf8')) : { exports: {} };

    const exportsByEntry = new Map();
    const svelteSubpaths = new Map();
    for (const [key, entry] of Object.entries(pkg.exports)) {
        const types = typesTarget(entry);
        const built = !!types && existsSync(join(ROOT, types));
        svelteSubpaths.set(key, built);
        exportsByEntry.set(key === '.' ? pkg.name : `${pkg.name}/${key.slice(2)}`, built ? exportedNames(readFileSync(join(ROOT, types), 'utf8')) : new Set());
    }
    const coreSubpaths = new Map(Object.keys(corePkg.exports ?? {}).map((k) => [k, true]));
    const coreIndex = existsSync(join(CORE, 'dist', 'index.d.ts')) ? readFileSync(join(CORE, 'dist', 'index.d.ts'), 'utf8') : '';
    const corePure = existsSync(join(CORE, 'dist', 'pure.d.ts')) ? readFileSync(join(CORE, 'dist', 'pure.d.ts'), 'utf8') : '';
    exportsByEntry.set('langsys-js-typescript', exportedNames(coreIndex));
    exportsByEntry.set('langsys-js-typescript/pure', exportedNames(corePure));

    // Members of every class and interface in both builds; the singletons' classes kept apart.
    const declared = new Map();
    const members = new Set();
    const singletons = new Set(['LangsysAppClass', 'LangsysAppAPIClass']);
    for (const file of [...dtsFiles(DIST), ...(existsSync(join(CORE, 'dist')) ? dtsFiles(join(CORE, 'dist')) : [])]) {
        const { bodies, rest } = declarations(readFileSync(file, 'utf8'));
        for (const [name, names] of bodies) {
            declared.set(name, new Set([...(declared.get(name) ?? []), ...names]));
            if (!singletons.has(name)) for (const n of names) members.add(n);
        }
        for (const line of rest.matchAll(MEMBER_LINE)) if (!/\b(private|protected)\b/.test(line[1])) members.add(line[2]);
    }
    const indexDts = readFileSync(join(DIST, 'index.d.ts'), 'utf8');

    const props = {};
    for (const c of COMPONENTS) {
        const file = join(DIST, 'components', `${c}.svelte.d.ts`);
        const body = existsSync(file) ? ((readFileSync(file, 'utf8').match(/interface Props \{([\s\S]*?)\n\}/) ?? [])[1] ?? '') : '';
        props[c] = new Set([...body.matchAll(/^ {4}([A-Za-z_$][\w$]*)\??:/gm)].map((m) => m[1]).filter((n) => !n.startsWith('__')));
    }

    const require = createRequire(join(ROOT, 'package.json'));
    const { compile } = require('svelte/compiler');
    const { langsysPreprocess } = await import(pathToFileURL(join(DIST, 'preprocess', 'index.js')).href);

    // What the built transform declines by name: its opaque elements, and the constructs `describe` names.
    const transformJs = readFileSync(join(DIST, 'preprocess', 'index.js'), 'utf8');
    const opaque = [...((transformJs.match(/OPAQUE_ELEMENTS = new Set\(\[([^\]]*)\]\)/) ?? [])[1] ?? '').matchAll(/'([\w-]+)'/g)].map((m) => m[1]);
    const describe = (transformJs.match(/\nfunction describe\([\s\S]*?\n\}/) ?? [''])[0];
    const constructs = [...describe.matchAll(/return '(\{[#@][a-z]+\})'/g)].map((m) => m[1]);

    let packed = new Set();
    let packError = '';
    try {
        const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
            cwd: ROOT,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        packed = packedPaths(out);
    } catch (e) {
        // npm's first error line, or why its output did not parse: the read check below reports it.
        packError =
            String(e.stderr || e.message)
                .split('\n')
                .find((l) => l.trim() && !/^npm warn/i.test(l))
                ?.trim() ?? '';
    }

    return {
        exportsByEntry,
        svelteSubpaths,
        coreSubpaths,
        svelteApp: svelteAppSurface(indexDts, declared.get('LangsysAppClass') ?? new Set()) ?? new Set(),
        appApi: declared.get('LangsysAppAPIClass') ?? new Set(),
        members,
        options: {
            init: declared.get('iLangsysInitConfig') ?? new Set(),
            handle: declared.get('LangsysHandleOptions') ?? new Set(),
            preprocess: declared.get('LangsysPreprocessOptions') ?? new Set(),
        },
        props,
        pkg: { name: pkg.name, version: pkg.version, files: pkg.files ?? [], coreRange: pkg.dependencies?.['langsys-js-typescript'] },
        packed,
        packError,
        core: {
            version: corePkg.version,
            skill: existsSync(join(CORE, 'skill')) ? new Set(readdirSync(join(CORE, 'skill'))) : new Set(),
        },
        compileSvelte(code, filename) {
            try {
                return compile(code, { generate: 'client', filename }).warnings.map((w) => `warning ${w.code}`);
            } catch (e) {
                return [`error ${e.code ?? e.message}`];
            }
        },
        transformSvelte(code, filename) {
            const warnings = [];
            langsysPreprocess({ warn: (w) => warnings.push(w) }).markup({ content: code, filename });
            return warnings;
        },
        fallbacks: { opaque, constructs },
        typecheck,
    };
}

// ── reading the skill ────────────────────────────────────────────────────────

function readDocs() {
    const docs = {};
    for (const f of readdirSync(SKILL).filter((n) => n.endsWith('.md'))) docs[f] = readFileSync(join(SKILL, f), 'utf8');
    return docs;
}

const FENCE = /```([a-z]*)[^\n]*\n([\s\S]*?)```/g;
/** The file an example is, from its first line: `// src/…` or `<!-- src/… -->`. */
const EXAMPLE_FILE = /^\s*(?:\/\/|<!--)\s*(src\/[\w./+-]+?)(?:\s+[^\n]*)?(?:\s*-->)?\s*\n/;
const PREAMBLE = /<!-- langsys-skill-preamble:start -->\n([\s\S]*?)\n<!-- langsys-skill-preamble:end -->/;

/** The keys of the object literal that opens at `text[open]` (a `{`), at its own depth: `key:` and shorthand `key`. */
function objectKeys(text, open) {
    const keys = [];
    let depth = 0;
    let expectKey = true;
    for (let i = open; i < text.length; i++) {
        const ch = text[i];
        if (ch === '"' || ch === "'" || ch === '`') {
            const end = text.indexOf(ch, i + 1);
            i = end === -1 ? text.length : end;
            continue;
        }
        if ('{[('.includes(ch)) {
            depth++;
            if (depth === 1) expectKey = true;
            continue;
        }
        if ('}])'.includes(ch)) {
            if (--depth === 0) break;
            continue;
        }
        if (depth !== 1) continue;
        if (ch === ',') {
            expectKey = true;
            continue;
        }
        if (expectKey && /[A-Za-z_$]/.test(ch)) {
            const m = text.slice(i).match(/^([A-Za-z_$][\w$]*)\s*([:,}]?)/);
            if (m[2] !== '' || /^\s*$/.test(text.slice(i + m[1].length).split('\n')[0])) keys.push(m[1]);
            i += m[1].length - 1;
            expectKey = false;
        } else if (!/\s/.test(ch)) expectKey = false;
    }
    return keys;
}

/** The attribute names written on each `<Component …>` opening tag in a Svelte example. */
function componentAttributes(code) {
    const found = [];
    for (const m of code.matchAll(/<([A-Z][A-Za-z]*)(?=[\s>/])/g)) {
        const names = [];
        let i = m.index + m[0].length;
        let afterEquals = false;
        while (i < code.length && code[i] !== '>' && !(code[i] === '/' && code[i + 1] === '>')) {
            const ch = code[i];
            if (ch === '"' || ch === "'") {
                i = code.indexOf(ch, i + 1) + 1;
                afterEquals = false;
            } else if (ch === '{') {
                let depth = 0;
                const start = i;
                for (; i < code.length; i++) {
                    if (code[i] === '{') depth++;
                    else if (code[i] === '}' && --depth === 0) break;
                }
                const inner = code.slice(start + 1, i).trim();
                if (!afterEquals && /^[A-Za-z_$][\w$]*$/.test(inner)) names.push(inner);
                i++;
                afterEquals = false;
            } else if (ch === '=') {
                afterEquals = true;
                i++;
            } else if (/[A-Za-z_:]/.test(ch)) {
                const name = code.slice(i).match(/^[A-Za-z_:][\w:.-]*/)[0];
                names.push(name);
                i += name.length;
                afterEquals = false;
            } else i++;
        }
        found.push({ component: m[1], names });
    }
    return found;
}

/** Every problem the skill has against the builds and package.json; empty when it names only what exists. */
function problems(docs, facts) {
    const found = [];
    const allExports = new Set([...facts.exportsByEntry.values()].flatMap((s) => [...s]));
    const svelteExports = facts.exportsByEntry.get(facts.pkg.name) ?? new Set();
    const optionNames = new Set(Object.values(facts.options).flatMap((s) => [...s]));
    const propNames = new Set(Object.values(facts.props).flatMap((s) => [...s]));
    const known = (name) => allExports.has(name) || facts.members.has(name) || optionNames.has(name) || propNames.has(name) || NOT_THE_PACKAGES.has(name);
    // A pack the gate read nothing from is reported once, with its reason, not as every file missing from it.
    const packRead = facts.packed.has('package.json');

    for (const [file, text] of Object.entries(docs)) {
        const fences = [...text.matchAll(FENCE)].map((m) => ({ lang: m[1], code: m[2] }));
        const code = fences.map((f) => f.code).join('\n');
        const prose = text.replace(FENCE, '');

        // 1. What the examples import.
        for (const m of code.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"]((?:langsys-js-svelte|langsys-js-typescript)(?:\/[\w/-]+)?)['"]/g)) {
            const entry = facts.exportsByEntry.get(m[2]);
            for (const spec of m[1].split(',')) {
                const name = spec
                    .trim()
                    .replace(/^type\s+/, '')
                    .split(/\s+as\s+/)[0];
                if (!name) continue;
                if (!entry) found.push(`${file}: imports ${name} from ${m[2]}, which is not an entry the gate knows`);
                else if (!entry.has(name)) found.push(`${file}: imports ${name}, which ${m[2]} does not export`);
            }
        }

        // 2. Members of the singletons, anywhere in the file.
        for (const m of text.matchAll(/\b(LangsysAppAPI|LangsysApp)\.([A-Za-z_$][\w$]*)/g)) {
            const surface = m[1] === 'LangsysApp' ? facts.svelteApp : facts.appApi;
            if (!surface.has(m[2])) found.push(`${file}: ${m[1]}.${m[2]} is not a member of the built ${m[1]}`);
        }

        // 3. SDK-shaped names and stores in inline code.
        for (const m of prose.matchAll(/`([^`\n]+)`/g)) {
            const shape = m[1].match(/^((?:[A-Za-z_$][\w$]*\.)*)([A-Za-z_$][\w$]*)(\([^)]*\))?$/);
            if (!shape || shape[1]) continue; // a receiver: LangsysApp's are rule 2's, any other is the app's own object
            const name = shape[2];
            if (name.startsWith('$')) {
                const store = name.slice(1);
                if (!svelteExports.has(store) && !NOT_STORES.has(store))
                    found.push(`${file}: \`${m[1]}\` reads $${store}, which is not a store langsys-js-svelte exports`);
                continue;
            }
            if (!sdkShaped(name, !!shape[3]) || known(name)) continue;
            // A LangsysApp member may be named bare once its file has written it in full.
            if (!facts.svelteApp.has(name)) found.push(`${file}: \`${m[1]}\` names ${name}, which neither build exports nor declares`);
            else if (!text.includes(`LangsysApp.${name}`))
                found.push(`${file}: \`${m[1]}\` names ${name}, which only LangsysApp has: write LangsysApp.${name} at least once`);
        }

        // 4. Option keys passed straight to the three calls, in examples and inline code alike.
        const uncommented = text.replace(/(^|\s)\/\/[^\n]*/g, '$1');
        for (const [call, set] of Object.entries(OPTION_CALLS)) {
            for (const m of uncommented.matchAll(new RegExp(`${call.replace('.', '\\.')}\\(\\s*\\{`, 'g'))) {
                for (const key of objectKeys(uncommented, m.index + m[0].length - 1)) {
                    if (!facts.options[set].has(key)) found.push(`${file}: passes ${key} to ${call}, which its options do not have`);
                }
            }
        }

        // 5. Components: the ones named are exported, and the attributes an example writes are props.
        for (const m of prose.matchAll(/`<([A-Z][A-Za-z]*)>`/g)) {
            if (!svelteExports.has(m[1])) found.push(`${file}: \`<${m[1]}>\` is not a component langsys-js-svelte exports`);
        }
        for (const { lang, code: block } of fences) {
            if (lang !== 'svelte') continue;
            for (const { component, names } of componentAttributes(block)) {
                if (!COMPONENTS.includes(component)) continue;
                for (const name of names)
                    if (!facts.props[component].has(name)) found.push(`${file}: writes ${name} on <${component}>, which is not one of its props`);
            }
        }

        // 6. Each Svelte example compiles cleanly and passes the build transform with no warning.
        fences.forEach(({ lang, code: block }, n) => {
            if (lang !== 'svelte') return;
            const name = `${file} example ${n + 1}`;
            for (const issue of facts.compileSvelte(block, `${file.replace('.md', '')}-${n + 1}.svelte`))
                found.push(`${name}: the Svelte compiler reports ${issue}`);
            for (const warning of facts.transformSvelte(block, `${file.replace('.md', '')}-${n + 1}.svelte`))
                found.push(`${name}: the build transform warns: ${warning.split('\n')[0]}`);
        });

        // 6b. Every fence names a language the checks above read.
        for (const { lang } of fences)
            if (!FENCE_LANGUAGES.has(lang)) found.push(`${file}: a fence in ${lang || 'no language'}; examples are svelte, ts, js or bash`);

        // 6c. The examples that name their file type-check together, as one app.
        const files = {};
        for (const { code: block } of fences) {
            const path = (block.match(EXAMPLE_FILE) ?? [])[1];
            if (path) files[path] = block;
        }
        if (Object.keys(files).length) for (const error of facts.typecheck(files)) found.push(`${file}: an example does not type-check: ${error}`);

        // 7. Entries, and files named inside the installed packages. A package name after a slash is part of a URL or a path.
        for (const m of text.matchAll(/(?<![\w/.@-])(langsys-js-svelte|langsys-js-typescript)\/([\w-]+(?:\/[\w-]+)*)/g)) {
            const subpaths = m[1] === 'langsys-js-svelte' ? facts.svelteSubpaths : facts.coreSubpaths;
            const built = subpaths.get(`./${m[2]}`);
            if (built === undefined) found.push(`${file}: ${m[1]}/${m[2]} is not in that package's exports`);
            else if (!built) found.push(`${file}: ${m[1]}/${m[2]} is exported but its file is not built`);
        }
        for (const m of text.matchAll(/node_modules\/langsys-js-typescript\/skill\/([\w.-]+\.md)/g)) {
            if (!facts.core.skill.has(m[1]))
                found.push(`${file}: names node_modules/langsys-js-typescript/skill/${m[1]}, which the installed core (${facts.core.version}) does not ship`);
        }
        for (const m of text.matchAll(/node_modules\/langsys-js-svelte\/([\w./-]+\.\w+)/g)) {
            if (packRead && !facts.packed.has(m[1])) found.push(`${file}: names node_modules/langsys-js-svelte/${m[1]}, which the package does not ship`);
        }

        // 8. Links between the skill's files, each written `./file.md`.
        for (const m of text.matchAll(/\]\(\.\/([\w.-]+\.md)(?:#[\w-]*)?\)/g))
            if (!(m[1] in docs)) found.push(`${file}: links ./${m[1]}, which is not in skill/`);
        for (const m of text.matchAll(/\]\((?!\.\/|https?:|#)([^)\s]+)\)/g)) found.push(`${file}: links ${m[1]}, which is not a ./ link to a skill file`);
    }

    // 9. Each table of props or options lists exactly what its declaration has.
    for (const [file, text] of Object.entries(docs)) {
        let heading = '';
        const lines = text.replace(FENCE, '').split('\n');
        for (let i = 0; i < lines.length; i++) {
            const h = lines[i].match(/^#{2,4} (.+)$/);
            if (h) heading = h[1].trim();
            if (!/^\| (Prop|Option) \|/.test(lines[i])) continue;
            const target = TABLES[`${file}#${heading}`];
            if (!target) {
                found.push(`${file}: a table of ${lines[i].split('|')[1].trim().toLowerCase()}s under "${heading}" that the gate does not know`);
                continue;
            }
            const [kind, which] = target;
            const declared = facts[kind][which];
            const listed = new Set();
            for (let j = i + 2; j < lines.length && lines[j].startsWith('|'); j++) {
                const row = lines[j].match(/^\| `([A-Za-z_$][\w$]*)` \|/);
                if (row) listed.add(row[1]);
            }
            for (const name of listed) if (!declared.has(name)) found.push(`${file}: the ${which} table lists ${name}, which ${which} does not have`);
            for (const name of declared) if (!listed.has(name)) found.push(`${file}: the ${which} table does not list ${name}`);
        }
    }

    // 9b. transform.md's fallback list: everything the build declines by name, and nothing it reads.
    const fallbackList = ((docs['transform.md'] ?? '').match(/\n## Blocks it can't read\n([\s\S]*?)(?=\n## |$)/) ?? [])[1] ?? '';
    if (!fallbackList) found.push('transform.md: no "Blocks it can\'t read" section');
    const probes = [
        ...facts.fallbacks.opaque.map((tag) => [`\`<${tag}>\``, OPAQUE_PROBES[tag] ?? `<${tag}></${tag}>`]),
        ...FALLBACK_PROBES.filter(([mention]) => !facts.fallbacks.opaque.some((tag) => mention === `\`<${tag}>\``)),
    ];
    for (const construct of facts.fallbacks.constructs) {
        if (!probes.some(([mention]) => mention.startsWith(`\`${construct}\``)))
            found.push(`skill-gate: the transform declines ${construct}, which has no probe in FALLBACK_PROBES`);
    }
    for (const [mention, body] of probes) {
        if (!fallbackList.includes(mention))
            found.push(`transform.md: the build transform makes a block holding ${mention} a fallback, which the list leaves out`);
        const probe = `<script lang="ts">\n    import { Translate, Phrase } from 'langsys-js-svelte';\n    let { t, v, f, h, xs, p, attrs, Other } = $props();\n</script>\n\n<Translate category="C">${body}</Translate>\n`;
        if (!facts.transformSvelte(probe, 'fallback-probe.svelte').some((w) => w.includes('registers nothing')))
            found.push(`transform.md: lists ${mention} as making a block a fallback, but the build transform reads it`);
    }

    // 9c. The gate read the build: a parse that found nothing would pass every check above.
    if (!['init', 'setWriteGrant', 'refresh'].every((n) => facts.svelteApp.has(n))) found.push('skill-gate: read no LangsysApp members from dist/index.d.ts');
    if (facts.options.init.size < 10 || !facts.options.handle.has('locale') || !facts.options.preprocess.has('from'))
        found.push('skill-gate: read no options from the build');
    if (!facts.props.Translate?.has('category')) found.push('skill-gate: read no component props from dist/components');
    if (!facts.fallbacks.opaque.length || !facts.fallbacks.constructs.length) found.push('skill-gate: read no fallback constructs from the built transform');
    if (!packRead) found.push(`skill-gate: read no files from npm pack${facts.packError ? `: ${facts.packError}` : ''}`);

    // 10. Name and version, as package.json holds them.
    const skill = docs['SKILL.md'] ?? '';
    const front = (skill.match(/^---\n([\s\S]*?)\n---\n/) ?? [])[1] ?? '';
    if (!/^name: langsys-svelte$/m.test(front)) found.push('SKILL.md: frontmatter name is not langsys-svelte');
    if (!new RegExp(`^  package: ${facts.pkg.name}$`, 'm').test(front)) found.push(`SKILL.md: frontmatter package is not ${facts.pkg.name}`);
    const version = (front.match(/^ {2}version: (\S+)$/m) ?? [])[1];
    if (version !== facts.pkg.version) found.push(`SKILL.md: frontmatter version is ${version}, package.json ${facts.pkg.version}`);

    // 11. The preamble, word for word, first after the title.
    const span = (skill.match(PREAMBLE) ?? [])[1];
    const template = (docs['preamble.md'] ?? '').trim();
    if (span === undefined) found.push('SKILL.md: no langsys-skill-preamble span');
    else if (span.trim() !== template) found.push('SKILL.md: the preamble span differs from preamble.md');
    if (
        !skill
            .slice(skill.indexOf('\n---\n') + 5)
            .trimStart()
            .replace(/^# [^\n]*\n+/, '')
            .startsWith('<!-- langsys-skill-preamble:start -->')
    ) {
        found.push('SKILL.md: the preamble is not the first thing after the title');
    }

    // 12. Every topic file is reachable from SKILL.md, and the folder ships.
    for (const file of Object.keys(docs)) {
        if (file === 'SKILL.md' || file === 'preamble.md') continue;
        if (!skill.includes(`(./${file})`)) found.push(`SKILL.md: does not link ${file}`);
    }
    if (!facts.pkg.files.includes('skill')) found.push('package.json: files does not include skill');
    if (packRead) for (const file of Object.keys(docs)) if (!facts.packed.has(`skill/${file}`)) found.push(`npm pack: does not ship skill/${file}`);

    // 13. The core skill this one sends the agent to is installed, and always will be.
    if (!facts.core.skill.has('SKILL.md'))
        found.push(`node_modules/langsys-js-typescript/skill/SKILL.md: missing; the installed core (${facts.core.version}) ships no skill`);
    const floor = floorOf(facts.pkg.coreRange);
    if (!floor) found.push(`package.json: cannot read langsys-js-typescript's range ${facts.pkg.coreRange}`);
    else if (below(floor, CORE_WITH_SKILL.split('.').map(Number)) < 0)
        found.push(`package.json: langsys-js-typescript ${facts.pkg.coreRange} admits a core without its skill; require ^${CORE_WITH_SKILL} or later`);

    return [...new Set(found)];
}

// ── controls, then the check ─────────────────────────────────────────────────

const PLANTED = [
    [
        'an import the main entry does not export',
        (d) => ({ ...d, 'components.md': d['components.md'] + "\n```ts\nimport { t, renderEverything } from 'langsys-js-svelte';\n```\n" }),
        'imports renderEverything, which langsys-js-svelte does not export',
    ],
    [
        'an import /kit does not export',
        (d) => ({ ...d, 'sveltekit.md': d['sveltekit.md'] + "\n```ts\nimport { createLangsysHandle } from 'langsys-js-svelte/kit';\n```\n" }),
        'imports createLangsysHandle, which langsys-js-svelte/kit does not export',
    ],
    [
        'an import from an entry the gate does not know',
        (d) => ({ ...d, 'sveltekit.md': d['sveltekit.md'] + "\n```ts\nimport { handle } from 'langsys-js-svelte/server';\n```\n" }),
        'not an entry the gate knows',
    ],
    [
        'a type import the core does not export',
        (d) => ({ ...d, 'setup.md': d['setup.md'] + "\n```ts\nimport type { RegistrationOutcome } from 'langsys-js-typescript';\n```\n" }),
        'imports RegistrationOutcome',
    ],
    [
        'a LangsysApp member that does not exist',
        (d) => ({ ...d, 'setup.md': d['setup.md'] + '\n`LangsysApp.reloadEverything()`\n' }),
        'LangsysApp.reloadEverything is not a member',
    ],
    [
        "a private member of the core's LangsysApp",
        (d) => ({ ...d, 'setup.md': d['setup.md'] + '\n`LangsysApp.applyAuthorization()`\n' }),
        'LangsysApp.applyAuthorization is not a member',
    ],
    [
        'a LangsysAppAPI member that does not exist',
        (d) => ({ ...d, 'setup.md': d['setup.md'] + '\n`LangsysAppAPI.postEverything()`\n' }),
        'LangsysAppAPI.postEverything is not a member',
    ],
    [
        'an inline call neither build has',
        (d) => ({ ...d, 'sveltekit.md': d['sveltekit.md'] + '\nCall `hydrateEverything()` first.\n' }),
        'names hydrateEverything',
    ],
    ['an inline type neither build has', (d) => ({ ...d, 'setup.md': d['setup.md'] + '\nIt takes a `WriteGrantStore`.\n' }), 'names WriteGrantStore'],
    ['a store this package does not export', (d) => ({ ...d, 'setup.md': d['setup.md'] + '\nRead `$autoDiscovery` in markup.\n' }), 'reads $autoDiscovery'],
    [
        'a LangsysApp member written as if it were an export',
        (d) => ({ ...d, 'components.md': d['components.md'] + '\nCall `getCountries()`.\n' }),
        'write LangsysApp.getCountries at least once',
    ],
    [
        'an init option that does not exist',
        (d) => ({ ...d, 'setup.md': d['setup.md'].replace('UserLocaleStore: userLocale,', 'UserLocaleStore: userLocale,\n            cacheTtl: 60,') }),
        'passes cacheTtl to LangsysApp.init',
    ],
    [
        'a handle option that does not exist',
        (d) => ({
            ...d,
            'sveltekit.md': d['sveltekit.md'].replace('    locale: (event) => {', "    fallbackLocale: 'en-us',\n    locale: (event) => {"),
        }),
        'passes fallbackLocale to createLangsysHandle',
    ],
    [
        'a shorthand transform option that does not exist',
        (d) => ({ ...d, 'transform.md': d['transform.md'] + '\n`langsysPreprocess({ strict })`\n' }),
        'passes strict to langsysPreprocess',
    ],
    [
        'a component this package does not export',
        (d) => ({ ...d, 'components.md': d['components.md'] + '\nWrap it in `<Plural>`.\n' }),
        '`<Plural>` is not a component',
    ],
    [
        'an attribute that is not a prop',
        (d) => ({ ...d, 'components.md': d['components.md'].replace('<Phrase category="ProductCard">', '<Phrase category="ProductCard" label="Reviews">') }),
        'writes label on <Phrase>',
    ],
    [
        'a shorthand attribute that is not a prop',
        (d) => ({ ...d, 'components.md': d['components.md'].replace('<Translate category="Blog"', '<Translate {custom} category="Blog"') }),
        'writes custom on <Translate>',
    ],
    [
        'a prop the table lists but the component does not have',
        (d) => ({ ...d, 'components.md': d['components.md'].replace('| `label` | none |', '| `locale` | none | x |\n| `label` | none |') }),
        'the Translate table lists locale',
    ],
    [
        'a prop the table leaves out',
        (d) => ({ ...d, 'components.md': d['components.md'].replace(/^\| `custom_id` \|.*\n/m, '') }),
        'the Translate table does not list custom_id',
    ],
    [
        'an option the handle table leaves out',
        (d) => ({ ...d, 'sveltekit.md': d['sveltekit.md'].replace(/^\| `storage` \|.*\n/m, '') }),
        'the handle table does not list storage',
    ],
    [
        'a table of options the gate does not know',
        (d) => ({ ...d, 'setup.md': d['setup.md'] + '\n## Init options\n\n| Option | What |\n|---|---|\n| `debug` | x |\n' }),
        'that the gate does not know',
    ],
    [
        'a Svelte example that does not compile',
        (d) => ({ ...d, 'components.md': d['components.md'] + '\n```svelte\n{#if open}\n<p>Open</p>\n```\n' }),
        'the Svelte compiler reports error',
    ],
    [
        'a Svelte example the compiler warns about',
        (d) => ({ ...d, 'components.md': d['components.md'] + '\n```svelte\n<img src="a.png">\n```\n' }),
        'the Svelte compiler reports warning a11y_missing_attribute',
    ],
    [
        'a Svelte example the transform cannot read',
        (d) => ({
            ...d,
            'components.md':
                d['components.md'] +
                '\n```svelte\n<script lang="ts">\n    import { Translate } from \'langsys-js-svelte\';\n    let { items }: { items: string[] } = $props();\n</script>\n\n<Translate tag="ul">{#each items as item}<li>{item}</li>{/each}</Translate>\n```\n',
        }),
        'the build transform warns',
    ],
    [
        'an entry that does not exist',
        (d) => ({ ...d, 'sveltekit.md': d['sveltekit.md'] + '\nImport it from `langsys-js-svelte/server`.\n' }),
        "langsys-js-svelte/server is not in that package's exports",
    ],
    [
        'a core skill file the installed core does not ship',
        (d) => ({ ...d, 'setup.md': d['setup.md'] + '\nSee `node_modules/langsys-js-typescript/skill/stores.md`.\n' }),
        'names node_modules/langsys-js-typescript/skill/stores.md',
    ],
    [
        'a file this package does not ship',
        (d) => ({ ...d, 'sveltekit.md': d['sveltekit.md'] + '\nSee `node_modules/langsys-js-svelte/CHANGELOG.md`.\n' }),
        'names node_modules/langsys-js-svelte/CHANGELOG.md, which the package does not ship',
    ],
    ['a link to a missing file', (d) => ({ ...d, 'pitfalls.md': d['pitfalls.md'] + '\n[gone](./gone.md)\n' }), 'links ./gone.md'],
    ['a link not written ./file.md', (d) => ({ ...d, 'pitfalls.md': d['pitfalls.md'] + '\n[setup](setup.md)\n' }), 'links setup.md, which is not a ./ link'],
    [
        "a frontmatter name that is not the skill's",
        (d) => ({ ...d, 'SKILL.md': d['SKILL.md'].replace(/^name: .*$/m, 'name: langsys-sveltekit') }),
        'frontmatter name is not langsys-svelte',
    ],
    [
        "a frontmatter package that is not package.json's",
        (d) => ({ ...d, 'SKILL.md': d['SKILL.md'].replace(/^ {2}package: .*$/m, '  package: langsys-svelte') }),
        'frontmatter package is not langsys-js-svelte',
    ],
    [
        'a version package.json does not hold',
        (d) => ({ ...d, 'SKILL.md': d['SKILL.md'].replace(/^ {2}version: .*$/m, '  version: 9.9.9') }),
        'frontmatter version is 9.9.9',
    ],
    [
        'a preamble that drifted from the template',
        (d) => ({ ...d, 'SKILL.md': d['SKILL.md'].replace('never skip a step', 'skip what you like') }),
        'the preamble span differs',
    ],
    [
        'a preamble that is not the first thing after the title',
        (d) => ({
            ...d,
            'SKILL.md': d['SKILL.md'].replace('<!-- langsys-skill-preamble:start -->', 'An opening line.\n\n<!-- langsys-skill-preamble:start -->'),
        }),
        'the preamble is not the first thing after the title',
    ],
    ['a topic file SKILL.md does not link', (d) => ({ ...d, 'orphan.md': '# Orphan\n' }), 'does not link orphan.md'],
    [
        'a Svelte example in a fence with an info string',
        (d) => ({ ...d, 'components.md': d['components.md'] + '\n```svelte title="App.svelte"\n{#if open}\n<p>Open</p>\n```\n' }),
        'the Svelte compiler reports error',
    ],
    [
        'a component example in an html fence',
        (d) => ({ ...d, 'components.md': d['components.md'] + '\n```html\n<Phrase>Hi</Phrase>\n```\n' }),
        'a fence in html',
    ],
    [
        'an example file that does not type-check',
        (d) => ({ ...d, 'sveltekit.md': d['sveltekit.md'].replace('({ locale: locals.locale })', '({ locale: locals.lang })') }),
        'an example does not type-check: src/routes/+layout.server.ts',
    ],
    [
        'an opaque element the fallback list leaves out',
        (d) => ({ ...d, 'transform.md': d['transform.md'].replace('`<svg>`, ', '') }),
        'makes a block holding `<svg>` a fallback, which the list leaves out',
    ],
    [
        'a construct the fallback list leaves out',
        (d) => ({ ...d, 'transform.md': d['transform.md'].replace('a `{#snippet}`, ', '') }),
        'makes a block holding `{#snippet}` a fallback, which the list leaves out',
    ],
];

/** Text the gate must NOT report: correct writing a too-broad check would flag. */
const NOT_REPORTED = [
    [
        'a GitHub URL into this package',
        (d) => ({ ...d, 'sveltekit.md': d['sveltekit.md'] + '\nSee https://github.com/langsys/langsys-js-svelte/blob/main/README-SSR.md.\n' }),
        'langsys-js-svelte/blob',
    ],
];

const PLANTED_FACTS = [
    ['a package.json that does not ship skill/', (f) => ({ ...f, pkg: { ...f.pkg, files: ['dist'] } }), 'package.json: files does not include skill'],
    [
        'a pack that leaves the skill out',
        (f) => ({ ...f, packed: new Set([...f.packed].filter((p) => !p.startsWith('skill/'))) }),
        'npm pack: does not ship skill/SKILL.md',
    ],
    [
        'an entry exported but not built',
        (f) => ({ ...f, svelteSubpaths: new Map(f.svelteSubpaths).set('./kit', false) }),
        'langsys-js-svelte/kit is exported but its file is not built',
    ],
    ['an installed core with no skill', (f) => ({ ...f, core: { ...f.core, skill: new Set() } }), 'node_modules/langsys-js-typescript/skill/SKILL.md: missing'],
    ['a core range that admits a core without its skill', (f) => ({ ...f, pkg: { ...f.pkg, coreRange: '^0.7.0' } }), 'admits a core without its skill'],
    [
        'a construct the skill lists that the build reads',
        (f) => ({ ...f, transformSvelte: (code, name) => (/use:f/.test(code) ? [] : f.transformSvelte(code, name)) }),
        'lists `use:` as making a block a fallback, but the build transform reads it',
    ],
    [
        'a construct the build declines that has no probe',
        (f) => ({ ...f, fallbacks: { ...f.fallbacks, constructs: [...f.fallbacks.constructs, '{@debug}'] } }),
        'declines {@debug}, which has no probe',
    ],
    ['a build the gate read nothing from', (f) => ({ ...f, svelteApp: new Set() }), 'read no LangsysApp members'],
    [
        "a pack the gate read nothing from, with npm's reason",
        (f) => ({ ...f, packed: new Set(), packError: 'npm error code E404' }),
        'read no files from npm pack: npm error code E404',
    ],
];

/** Problems the gate must NOT report from these facts: ones a pack it read nothing from only seems to have. */
const NOT_REPORTED_FACTS = [
    ['a file missing from a pack it read nothing from', (f) => ({ ...f, packed: new Set() }), 'npm pack: does not ship'],
    ['a named file missing from a pack it read nothing from', (f) => ({ ...f, packed: new Set() }), 'which the package does not ship'],
];

/** `npm pack --dry-run --json` as each npm major prints it, which the gate must read alike. */
const PACK_OUTPUTS = [
    ['npm 10 and 11', '[{"name":"p","files":[{"path":"package.json"}]}]'],
    ['npm 12', '{"p":{"name":"p","files":[{"path":"package.json"}]}}'],
];

const newestSrc = Math.max(
    ...readdirSync(join(ROOT, 'src', 'lib'), { recursive: true })
        .map((f) => join(ROOT, 'src', 'lib', String(f)))
        .filter((f) => statSync(f).isFile())
        .map((f) => statSync(f).mtimeMs)
);
if (!existsSync(join(DIST, 'index.d.ts')) || statSync(join(DIST, 'index.d.ts')).mtimeMs < newestSrc) {
    console.error('skill-gate: dist/ is missing or older than src/lib. Run `npm run package` first.');
    process.exit(1);
}

const facts = await buildFacts();
const docs = readDocs();
let failed = 0;

for (const [what, plant, expected] of [
    ...PLANTED.map(([w, p, e]) => [w, () => problems(p(docs), facts), e]),
    ...PLANTED_FACTS.map(([w, p, e]) => [w, () => problems(docs, p(facts)), e]),
]) {
    if (!plant().join('\n').includes(expected)) {
        console.error(`  ✗ control: the gate did not report ${what} (expected "${expected}")`);
        failed++;
    }
}
for (const [what, plant, unexpected] of NOT_REPORTED) {
    if (problems(plant(docs), facts).join('\n').includes(unexpected)) {
        console.error(`  ✗ control: the gate reported ${what}, which is correct as written`);
        failed++;
    }
}
for (const [what, plant, unexpected] of NOT_REPORTED_FACTS) {
    if (problems(docs, plant(facts)).join('\n').includes(unexpected)) {
        console.error(`  ✗ control: the gate reported ${what}`);
        failed++;
    }
}
for (const [npm, out] of PACK_OUTPUTS) {
    let paths = new Set();
    try {
        paths = packedPaths(out);
    } catch {
        // Reported below.
    }
    if (!paths.has('package.json')) {
        console.error(`  ✗ control: the gate read no files from npm pack's output as ${npm} prints it`);
        failed++;
    }
}
const controls = PLANTED.length + PLANTED_FACTS.length + NOT_REPORTED.length + NOT_REPORTED_FACTS.length + PACK_OUTPUTS.length;
if (failed) console.error(`skill-gate: ${failed} of ${controls} controls failed, so a clean result would mean nothing.`);

const found = problems(docs, facts);
for (const p of found) console.error(`  ✗ ${p}`);
if (found.length || failed) {
    console.error(`skill-gate: ${found.length} problem(s) in skill/.`);
    process.exit(1);
}
console.log(`skill-gate: skill/ names only what the build has (${Object.keys(docs).length} files; ${controls} controls passed).`);
