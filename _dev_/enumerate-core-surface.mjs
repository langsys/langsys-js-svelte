#!/usr/bin/env node
/**
 * Enumerates the core's instance surface and reports what the binding does or
 * does not expose. The list in any report must be produced by THIS script, not
 * typed — a hand-written list passes for exactly the members someone remembered.
 *
 *   node _dev_/enumerate-core-surface.mjs
 *   node _dev_/enumerate-core-surface.mjs --self-test
 *
 * `--self-test` is the positive control the fleet brief requires: it hides a real
 * member behind a deliberately-lossy wrapper and shows the script REPORTING it as
 * dropped. "Zero dropped" is only meaningful once the detector has been shown to
 * detect.
 *
 * ── The finding this script exists to record ──────────────────────────────────
 * A runtime prototype walk cannot see TypeScript's `private`. `private` is erased
 * at compile time, so `getOwnPropertyNames` returns implementation detail beside
 * API with nothing to tell them apart. Every "dropped member" this script reports
 * must be checked against the core's `.d.ts` before being called a defect — see
 * the PRIVATE column, which does exactly that.
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

// ── Provenance: the module actually imported, not the one assumed ────────────
const corePath = realpathSync(require.resolve('langsys-js-typescript'));
const coreRoot = corePath.slice(0, corePath.indexOf('/dist/'));
const sha = (() => {
    try {
        return execFileSync('git', ['-C', coreRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
        return '(not a git checkout — vendored?)';
    }
})();
const branch = (() => {
    try {
        return execFileSync('git', ['-C', coreRoot, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
    } catch {
        return '(n/a)';
    }
})();

const core = require('langsys-js-typescript');

/** Every own-property name up the prototype chain, constructor excluded. */
function members(obj) {
    const seen = new Set();
    let o = obj;
    while (o && o !== Object.prototype) {
        for (const k of Object.getOwnPropertyNames(o)) if (k !== 'constructor') seen.add(k);
        o = Object.getPrototypeOf(o);
    }
    return [...seen].sort();
}

/**
 * Is `name` declared `private` in the core's own .d.ts class block? This is the
 * column that turns a scary number into an accurate one.
 */
const dts = readFileSync(join(coreRoot, 'dist/index.d.ts'), 'utf8');
const classBlock = (() => {
    const i = dts.indexOf('declare class LangsysAppClass');
    return i === -1 ? '' : dts.slice(i, dts.indexOf('\n}', i));
})();
const isPrivate = (name) => new RegExp(`^\\s+private ${name}[;:?(]`, 'm').test(classBlock);

// ── The comparison ───────────────────────────────────────────────────────────
const selfTest = process.argv.includes('--self-test');
const coreList = members(core.LangsysApp);

// Under --self-test, stand up a deliberately lossy wrapper: it hides one real
// member. The script must report that member as dropped.
const HIDDEN = 'refresh';
const binding = selfTest
    ? new Proxy(core.LangsysApp, {
          get: (t, p) => (p === HIDDEN ? undefined : Reflect.get(t, p, t)),
          has: (t, p) => (p === HIDDEN ? false : Reflect.has(t, p)),
      })
    : (core.__bindingUnderTest ?? null);

console.log(`core module   ${corePath}`);
console.log(`core checkout ${coreRoot}`);
console.log(`core branch   ${branch}`);
console.log(`core SHA      ${sha}`);
console.log(`core members  ${coreList.length}`);
console.log('');

if (selfTest) {
    const dropped = coreList.filter((m) => !(m in binding));
    console.log(`SELF-TEST: hid \`${HIDDEN}\` behind a lossy wrapper.`);
    console.log(`  dropped detected: ${dropped.length ? dropped.join(', ') : '(none)'}`);
    const ok = dropped.includes(HIDDEN);
    console.log(`  ${ok ? 'PASS' : 'FAIL'} — the detector ${ok ? 'found' : 'MISSED'} a member it should have found.`);
    process.exit(ok ? 0 : 1);
}

console.log('MEMBER                          PRIVATE-IN-DTS   TYPEOF');
console.log('------------------------------  --------------   ------');
for (const m of coreList) {
    const priv = isPrivate(m) ? 'private' : 'PUBLIC ';
    console.log(`${m.padEnd(30)}  ${priv.padEnd(14)}   ${typeof core.LangsysApp[m]}`);
}
const pub = coreList.filter((m) => !isPrivate(m));
console.log('');
console.log(`public members: ${pub.length}   private-in-dts: ${coreList.length - pub.length}`);
console.log('');
console.log('Run the vitest surface suite for reachability through the binding:');
console.log('  npm test -- --run src/lib/surface.test.ts');
