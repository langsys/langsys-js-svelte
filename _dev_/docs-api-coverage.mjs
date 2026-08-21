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

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

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
            const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()?.trim();
            if (name) names.add(name);
        }
    }
    for (const m of source.matchAll(
        /export\s+(?:declare\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g,
    )) {
        names.add(m[1]);
    }
    return names;
}

const dts = readFileSync(DTS, 'utf8');
const exported = topLevelExports(dts);

const surfaces = new Map();
// `LangsysApp` is the Svelte wrapper instance, not the base SDK singleton — its
// surface is whatever LangsysAppSvelte declares, which is deliberately narrower.
const svelteApp = classMembers(dts, 'LangsysAppSvelte');
if (!svelteApp) {
    console.error('docs-api-coverage: could not locate `declare class LangsysAppSvelte` in dist/index.d.ts.');
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
            const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]?.trim();
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
