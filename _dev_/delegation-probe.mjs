#!/usr/bin/env node
/**
 * Absence probes for every CONFORMANCE.md row graded `delegated`.
 *
 * A `delegated` row says the core owns a rule and this binding demonstrably does not
 * take part. "We searched and found nothing" is worthless on its own — a search that
 * cannot find anything also finds nothing — so every probe is run twice: once over this
 * binding, where it must count zero, and once over the core's source, where the same
 * pattern must count MORE than zero. The core count is the firing control.
 *
 * One pattern per rule id, never one per family. A family probe proves the family's
 * most common symbol is absent, which says nothing about the rule whose mechanism is
 * named something else.
 *
 * Comments are stripped on BOTH sides before counting. The first published version of
 * these probes stripped only line comments, and a binding count of 2 turned out to be
 * JSDoc prose; the core side had never been filtered at all, so a control could have
 * been firing on a comment.
 *
 *   node _dev_/delegation-probe.mjs              # table, plus which core checkout was read
 *   node _dev_/delegation-probe.mjs --check      # exit 1 on any binding hit, dead control,
 *                                                # or mismatch with CONFORMANCE.md's delegated rows
 *   node _dev_/delegation-probe.mjs --self-test  # prove the counter and the stripper can fail
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BINDING_SRC = join(ROOT, 'src/lib');

/** [rule id, pattern]. The pattern names the core's mechanism for that rule. */
export const PROBES = [
    ['GATE-1', 'write_enabled'],
    ['GATE-2', 'applyWriteEnabled|canWrite'],
    ['GATE-3', 'localStorage|sessionStorage|setWriteEnabled'],
    ['GATE-4', 'persistScoped|catalogCache'],
    ['GATE-5', 'updateTokens'],
    ['GATE-6', 'recordMissForDiscovery'],
    ['GATE-7', 'registerContentBlock'],
    ['GATE-8', 'key_type'],
    ['GATE-9', 'discoveryBaseLocaleOnly'],
    ['CAT-1', 'buildTFn|missingToken'],
    ['CAT-2', '\\blookup\\('],
    ['CAT-3', 'isContentBlockKnown'],
    ['REG-1', 'canWrite'],
    ['REG-2', 'debounceTimer|scheduleTokenFlush'],
    ['REG-3', 'flushOnTeardown'],
    ['REG-4', 'keepalive|sendBeacon'],
    ['REG-5', 'installTeardownFlush|visibilitychange|pagehide'],
    ['REG-6', '\\[\\.\\.\\.this\\.missingTokens\\]'],
    ['REG-7', 'updateInFlight'],
    ['REG-8', 'consecutiveFailures|retryNotBefore'],
    ['REG-9', 'batch_limit'],
    ['REG-10', 'noteSendFailure|createTranslatableItems'],
    ['REG-11', 'warnedEllipsis'],
    ['REG-12', 'missingToken'],
    ['REG-13', 'catalogFetchesInFlight'],
    ['HINT-1', 'discovery/hint'],
    ['HINT-3', 'recordMissForDiscovery|location\\.href'],
    ['HINT-4', 'SESSION_KEY_PREFIX'],
    ['HINT-5', 'HINT_MIN_DELAY_MS|HINT_MAX_DELAY_MS'],
    ['HINT-6', 'normalizeHintUrl'],
    ['HINT-7', '429'],
    ['HINT-8', 'postDiscoveryHint'],
    ['HINT-9', 'auto_discovery|autoDiscovery'],
    ['HINT-10', 'passwd|apikey'],
    ['HINT-11', 'fragmentParamNames|OAUTH_STATE_MARKERS'],
    ['HINT-12', 'utm_|gclid|fbclid'],
    ['ICU-1', 'IntlMessageFormat'],
    ['ICU-2', '\\binterpolate\\('],
    ['ICU-3', '_recoverMissingArgs'],
    ['ICU-4', 'noteDefaultedArgs'],
    ['ICU-5', 'isICU'],
    ['ICU-6', 'noteFormatterFailure'],
    ['CID-1', 'canonicalContentBlockJson'],
    ['CID-2', 'generateCustomId'],
    ['CID-3', 'generateLegacyCustomId'],
    ['CID-4', 'legacyTokenizeElement'],
    ['TOK-1', 'noscript'],
    ['TOK-2', 'normalizeTokenText'],
    ['TOK-3', 'aria-roledescription'],
    ['TOK-4', 'translateAttribute'],
    ['TOK-5', 'normalizeMarkupPlaceholders|adoptPercentPlaceholders'],
    ['TOK-6', 'usesSingleTextNodeFastPath'],
    ['MARK-2', 'PHRASE_MARKER_ATTR_LEGACY|isPhraseMarked'],
    ['MARK-3', 'isContentBlockMarked'],
    ['MARK-4', '_walkForTokens'],
    ['SSR-1', 'shouldQueueForWrite'],
    ['SSR-2', 'ssrWriteEnabled'],
    ['CACHE-1', 'langsys:translations'],
    ['CACHE-2', 'catalogUnavailable'],
    ['OBS-1', 'noticeUnusableWriteCapability'],
    ['WIRE-1', 'x-Authorization|X-Authorization'],
    ['WIRE-2', '204'],
    ['WIRE-3', 'toLowerCase|getCanonicalLocales'],
    ['WIRE-4', '\\bsettle\\('],
    // The server-message helpers are re-exported by reference, so their exported names appear
    // in the binding. The probes name what those functions do inside, which the binding never does.
    ['MSG-1', 'function dig|MAX_DEPTH'],
    ['MSG-2', 'SERVER_MESSAGE_CODES = '],
    ['MSG-6', 'DEFAULT_SERVER_MESSAGE_CATEGORY = '],
    ['MIG-1', 'legacyKeys'],
    ['MIG-2', 'convertLegacyCall'],
    ['MIG-3', 'valueAt'],
    ['MIG-4', 'convertLegacyPluralForms|PLURAL_CATEGORIES'],
    ['MIG-5', 'looksLikeAPath'],
    ['MIG-6', 'warnedLegacy'],
    ['MIG-7', 'FOREIGN_EXTENSIONS|SUPPORTED_LEGACY_FORMATS'],
    ['MIG-8', 'convertLegacyValue'],
    ['SNAP-2', 'parseSnapshot'],
    ['SNAP-3', 'markSeeded'],
];

/**
 * Absence halves of rules this binding OWNS and grades `implemented` — BIND-2, BIND-3,
 * BIND-5. Same instrument and the same control: zero here, more than zero in the core,
 * which is where the thing each rule forbids a binding from doing actually lives.
 */
export const OWN_ABSENCE = [
    ['BIND-2', 'write_enabled|key_type|auto_discovery|autoDiscovery'],
    ['BIND-3', 'fetch\\(|XMLHttpRequest|sendBeacon|setInterval|keepalive|headers'],
    ['BIND-5', 'memo|[Cc]ache|new Map\\(|new WeakMap\\('],
];

/**
 * Strip block, HTML and line comments. `//` preceded by `:` is kept so a URL in a
 * string survives — the self-test pins that, because a stripper that ate the rest of a
 * line after `https://` would silently zero whatever followed it.
 */
export function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

export function count(src, pattern) {
    return (stripComments(src).match(new RegExp(pattern, 'g')) ?? []).length;
}

function walk(dir, exts) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(p, exts));
        else if (exts.some((e) => entry.name.endsWith(e)) && !/\.(test|spec)\.[jt]s$/.test(entry.name)) out.push(p);
    }
    return out;
}

const read = (files) => files.map((f) => readFileSync(f, 'utf8')).join('\n');

function coreCheckout() {
    const pkg = realpathSync(join(ROOT, 'node_modules/langsys-js-typescript'));
    const git = (...a) => {
        try {
            return execFileSync('git', ['-C', pkg, ...a], { encoding: 'utf8' }).trim();
        } catch {
            return null;
        }
    };
    const status = git('status', '--porcelain', '--', 'src');
    return {
        pkg,
        src: join(pkg, 'src'),
        branch: git('rev-parse', '--abbrev-ref', 'HEAD') ?? '(not a git checkout — registry install?)',
        sha: git('rev-parse', '--short', 'HEAD') ?? '-',
        dirty: status === null ? '-' : status ? status.split('\n').length : 0,
    };
}

/** The ids CONFORMANCE.md grades `delegated`, read from its status table. */
function delegatedRows() {
    const md = readFileSync(join(ROOT, 'CONFORMANCE.md'), 'utf8');
    return md
        .split('\n')
        .map((l) => l.split('|').map((c) => c.trim()))
        .filter((c) => c.length > 3 && /^[A-Z]{2,5}-\d+$/.test(c[1]) && c[2] === 'delegated')
        .map((c) => c[1]);
}

function selfTest() {
    const cases = [
        ['counter fires on code', count('const x = write_enabled;', 'write_enabled'), 1],
        ['line comment stripped', count('// write_enabled', 'write_enabled'), 0],
        ['block comment stripped', count('/* write_enabled */', 'write_enabled'), 0],
        ['HTML comment stripped', count('<!-- write_enabled -->', 'write_enabled'), 0],
        ['URL in a string survives stripping', count("const u = 'https://a/b'; write_enabled", 'write_enabled'), 1],
        [
            'binding walker reads real files (PHRASE_MARKER_ATTR is used in Phrase.svelte)',
            count(read(walk(BINDING_SRC, ['.ts', '.svelte'])), 'PHRASE_MARKER_ATTR') > 0,
            true,
        ],
        ['binding walker excludes tests (surface.test.ts names core members)', walk(BINDING_SRC, ['.ts']).some((f) => f.endsWith('.test.ts')), false],
        ['core walker reads real files', walk(coreCheckout().src, ['.ts']).length > 10, true],
    ];
    let bad = 0;
    for (const [name, got, want] of cases) {
        const ok = got === want;
        if (!ok) bad++;
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (got ${got}, want ${want})`);
    }
    process.exit(bad ? 1 : 0);
}

if (process.argv.includes('--self-test')) selfTest();

const core = coreCheckout();
const bindingText = read(walk(BINDING_SRC, ['.ts', '.svelte']));
const coreText = read(walk(core.src, ['.ts']));

console.log(`binding  ${relative(ROOT, BINDING_SRC)} (tests excluded, comments stripped)`);
console.log(`core     ${core.pkg}`);
console.log(`         ${core.branch} @ ${core.sha}, ${core.dirty} uncommitted file(s) under src/`);
console.log('');

const problems = [];
const seen = new Set();
const probe = (id, pattern) => {
    const b = count(bindingText, pattern);
    const c = count(coreText, pattern);
    const verdict = b !== 0 ? 'BINDING HIT' : c === 0 ? 'DEAD CONTROL' : 'ok';
    if (verdict !== 'ok') problems.push(`${id}: ${verdict} (binding ${b}, core ${c})`);
    console.log(`${id.padEnd(8)} binding ${String(b).padStart(2)}  core ${String(c).padStart(3)}  ${verdict.padEnd(12)} /${pattern}/`);
};

for (const [id, pattern] of PROBES) {
    if (seen.has(id)) problems.push(`${id}: probed twice`);
    seen.add(id);
    probe(id, pattern);
}

console.log('\nabsence halves of rows graded `implemented` (the binding’s own rules):');
for (const [id, pattern] of OWN_ABSENCE) probe(id, pattern);

// Each delegated row cites the core row it rests on, with that row's grade. The grade is read
// from the CONFORMANCE.md of the core checkout resolved above, so a citation that no longer
// matches the core — a row the core has since downgraded, say — fails here.
const cells = (l) => l.split(/(?<!\\)\|/).map((c) => c.trim());
const coreGrades = new Map(
    readFileSync(join(core.pkg, 'CONFORMANCE.md'), 'utf8')
        .split('\n')
        .map(cells)
        .filter((c) => /^[A-Z]+-\d+$/.test(c[1] ?? ''))
        .map((c) => [c[1], c[2]])
);
for (const line of readFileSync(join(ROOT, 'CONFORMANCE.md'), 'utf8').split('\n')) {
    const c = cells(line);
    if (c[2] !== 'delegated') continue;
    const cited = c[4]?.match(/^core row ([A-Z]+-\d+) \(([^,)]+(?: \([^)]*\))?)/);
    if (!cited || cited[1] !== c[1]) problems.push(`${c[1]}: delegated row does not open with "core row ${c[1]} (<grade>…"`);
    else if (coreGrades.get(c[1]) !== cited[2]) problems.push(`${c[1]}: cites the core row as \`${cited[2]}\`, the core grades it \`${coreGrades.get(c[1])}\``);
}

const delegated = new Set(delegatedRows());
for (const id of delegated) if (!seen.has(id)) problems.push(`${id}: graded delegated in CONFORMANCE.md with no probe here`);
for (const id of seen) if (!delegated.has(id)) problems.push(`${id}: probed here but not graded delegated in CONFORMANCE.md`);

console.log(`\n${PROBES.length} delegation probes + ${OWN_ABSENCE.length} own-rule probes, ${delegated.size} delegated rows, ${problems.length} problem(s)`);
for (const p of problems) console.log(`  ${p}`);
if (process.argv.includes('--check') && problems.length) process.exit(1);
