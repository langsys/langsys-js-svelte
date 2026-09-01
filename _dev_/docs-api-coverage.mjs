#!/usr/bin/env node
/**
 * docs-api-coverage — fail when the docs name an API that does not exist.
 *
 * Markdown does not typecheck. A code sample can call `LangsysApp.resolveLocale()`
 * or import `{ negotiate }` and ship, because nothing reads it. The langsys-skill
 * agent shipped exactly that — three SSR tracks calling two different helpers that
 * were never in the SDK, the second introduced by the commit fixing the first.
 *
 * THE ALLOWLIST MUST INCLUDE CLASS MEMBERS, NOT JUST THE `export { … }` LINE.
 * Almost the entire useful surface here — init, refresh, detectPreferredLocale,
 * getLocales*, t — are members of the LangsysAppSvelte class, and a class's members
 * never appear in an export statement. A checker built from that statement alone
 * does not merely miss fakes: it reports every real method as invented, which reads
 * as a broken checker and gets switched off. Reported by the skill agent after their
 * own guard did precisely this.
 *
 * Source of truth is the BUILT `dist/index.d.ts`, not `src/`: that file is what a
 * consumer's typechecker resolves, so it is the surface that actually exists for
 * them. Run `npm run package` first.
 *
 * Usage: node _dev_/docs-api-coverage.mjs [rootDir] [--strict]
 *        --strict exits 1 on any finding (use in CI); default reports and exits 0.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC_LIB = new URL('../src/lib', import.meta.url).pathname;

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const root = args.find((a) => !a.startsWith('--')) ?? '.';

const DTS = join(root, 'dist', 'index.d.ts');
const BASE_DTS = join(root, 'node_modules', 'langsys-js-typescript', 'dist', 'index.d.ts');
const DOCS = ['README.md', 'README-SSR.md', 'CLAUDE.md'];

if (!existsSync(DTS)) {
    // Exiting 0 here would be the changelog-coverage trap: a missing input silently
    // becomes a pass. This check is worthless if it can vacuously succeed, so a
    // missing dist is a hard failure with the fix in the message.
    console.error(`docs-api-coverage: ${DTS} not found — run \`npm run package\` first.`);
    process.exit(1);
}

/** Members declared inside `declare class <name> { … }`, including getters. */
function classMembers(source, className) {
    const start = source.indexOf(`declare class ${className}`);
    if (start === -1) return null;
    const open = source.indexOf('{', start);
    let depth = 0,
        end = open;
    for (let i = open; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}' && --depth === 0) {
            end = i;
            break;
        }
    }
    const body = source.slice(open + 1, end);
    const names = new Set();
    // `foo(`, `get foo(`, `readonly foo:`, `foo:`
    for (const m of body.matchAll(/^\s*(?:get\s+|set\s+|readonly\s+)?([A-Za-z_$][\w$]*)\s*[(:<]/gm)) {
        names.add(m[1]);
    }
    return names;
}

/** Top-level exported identifiers: `export { a, b }`, `export declare const c`, etc. */
function topLevelExports(source) {
    const names = new Set();
    // `export type { … }` must be matched too. Missing it does not under-report —
    // it makes the checker flag every re-exported type as invented, which is the
    // failure mode that gets a checker disabled rather than fixed.
    for (const m of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
        for (const part of m[1].split(',')) {
            const name = part
                .trim()
                .replace(/^type\s+/, '')
                .split(/\s+as\s+/)
                .pop()
                ?.trim();
            if (name) names.add(name);
        }
    }
    for (const m of source.matchAll(/export\s+(?:declare\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g)) {
        names.add(m[1]);
    }
    return names;
}

/**
 * The `LangsysApp` surface as a consumer's typechecker sees it: the core class's
 * public members, minus what the binding omits, plus what it adds back.
 * Resolved from the exported TYPE rather than from a class declaration, because
 * the class no longer exists and its absence is what made this gate lie.
 */
function svelteAppSurface(dtsText, baseDtsText) {
    const m = dtsText.match(/type LangsysAppSvelte = Omit<typeof (\w+), ([^>]*)> & \{([\s\S]*?)\n\};/);
    if (!m) return null;
    const [, coreIdent, omitted, added] = m;
    // The core class is declared in the BASE SDK's d.ts — this package re-exports
    // its types rather than redeclaring them, so looking only in our own build is
    // how the previous resolver came up empty.
    const core =
        classMembers(dtsText, 'LangsysAppClass') ??
        classMembers(dtsText, coreIdent) ??
        (baseDtsText ? (classMembers(baseDtsText, 'LangsysAppClass') ?? classMembers(baseDtsText, coreIdent)) : null);
    if (!core) return null;
    const drop = new Set([...omitted.matchAll(/'([^']+)'/g)].map((x) => x[1]));
    const names = new Set([...core].filter((n) => !drop.has(n)));
    for (const a of added.matchAll(/^\s*(?:\/\*[\s\S]*?\*\/\s*)?([A-Za-z_$][\w$]*)\s*[(?:]/gm)) names.add(a[1]);
    return names;
}

const dts = readFileSync(DTS, 'utf8');
const exported = topLevelExports(dts);

const surfaces = new Map();
// `LangsysApp` is the Svelte wrapper instance, not the base SDK singleton — its
// surface is whatever LangsysAppSvelte declares, which is deliberately narrower.
//
// `LangsysApp` used to be a hand-written class, and this gate located it by
// parsing `declare class LangsysAppSvelte` out of the built d.ts. That class was
// deleted when the wrapper became a Proxy — and the gate kept reporting 54/54,
// exit 0, for eleven days, because `dist/` is gitignored and the stale artifact
// on disk still contained it. It was validating a build nobody had produced from
// the tree it was run against.
//
// Two changes so that cannot recur: the surface is resolved through the EXPORTED
// TYPE (`type LangsysAppSvelte = Omit<typeof _LangsysApp, …> & { … }`), which is
// what a consumer's typechecker actually resolves; and a stale build is refused
// outright rather than silently believed.
const newestSrc = Math.max(
    ...readdirSync(SRC_LIB, { recursive: true })
        .map((f) => join(SRC_LIB, String(f)))
        .filter((f) => statSync(f).isFile())
        .map((f) => statSync(f).mtimeMs)
);
if (statSync(DTS).mtimeMs < newestSrc) {
    console.error(
        'docs-api-coverage: dist/index.d.ts is OLDER than src/lib — refusing to validate a stale build.\n' +
            '  run `npm run package` first. (This gate reported 54/54 against an 11-day-old artifact.)'
    );
    process.exit(1);
}

const baseDts = existsSync(BASE_DTS) ? readFileSync(BASE_DTS, 'utf8') : null;
const svelteApp = svelteAppSurface(dts, baseDts);
if (!svelteApp) {
    console.error(
        'docs-api-coverage: could not resolve the LangsysApp surface from dist/index.d.ts.\n' +
            '  expected `type LangsysAppSvelte = Omit<typeof _LangsysApp, ...> & { ... }` plus the core class.'
    );
    process.exit(1);
}
surfaces.set('LangsysApp', svelteApp);

if (existsSync(BASE_DTS)) {
    const base = readFileSync(BASE_DTS, 'utf8');
    const api = classMembers(base, 'LangsysAPI') ?? classMembers(base, 'LangsysAppAPIClass');
    if (api) surfaces.set('LangsysAppAPI', api);
}

const findings = [];

for (const file of DOCS) {
    const path = join(root, file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');

    // 1. Member access on a documented object.
    for (const [obj, members] of surfaces) {
        const re = new RegExp(`\\b${obj}\\.([A-Za-z_$][\\w$]*)`, 'g');
        for (const m of text.matchAll(re)) {
            if (!members.has(m[1])) {
                findings.push(`${file}: ${obj}.${m[1]} — not declared on the public surface`);
            }
        }
    }

    // 2. Named imports from this package.
    for (const m of text.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'langsys-js-svelte'/g)) {
        for (const part of m[1].split(',')) {
            const name = part
                .trim()
                .replace(/^type\s+/, '')
                .split(/\s+as\s+/)[0]
                ?.trim();
            if (name && !exported.has(name)) {
                findings.push(`${file}: import { ${name} } — not exported from the package`);
            }
        }
    }
}

const unique = [...new Set(findings)];

if (unique.length === 0) {
    const total = surfaces.get('LangsysApp').size + exported.size;
    console.log(`docs-api-coverage: every API named in ${DOCS.join(', ')} exists (${total} declared names checked).`);
    process.exit(0);
}

console.error(`docs-api-coverage: ${unique.length} reference(s) to API that does not exist:\n`);
for (const f of unique) console.error(`  - ${f}`);
console.error('\nEither the docs are wrong, or the export is missing from src/lib/index.ts.');
process.exit(strict ? 1 : 0);
