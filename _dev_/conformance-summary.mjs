#!/usr/bin/env node
/**
 * Checks CONFORMANCE.md against the spec revision its own header cites — by RULE ID.
 *
 * Replaces a summary that counted grade cells. Counting cells measured the table rather
 * than the spec: a file grading seven family names and eighteen explicit ids printed a
 * tidy total while covering 57 of 79 rules and contradicting itself in seven places,
 * because nothing compared its rows with the spec's rule list. This reads the rule list
 * out of the exact blob the header names and checks that every id is graded once.
 *
 *   node _dev_/conformance-summary.mjs              # tally by status, plus any problems
 *   node _dev_/conformance-summary.mjs --check      # exit 1 on any problem
 *   node _dev_/conformance-summary.mjs --self-test  # prove every check can fail
 *
 * The spec is read from git by blob, never from a working copy. Set LANGSYS2_DIR if the
 * langsys2 clone is not at ../langsys2.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LANGSYS2 = resolve(ROOT, process.env.LANGSYS2_DIR ?? '../langsys2');

const STATUSES = [
    /^implemented$/,
    /^provisional$/,
    /^delegated$/,
    /^partial$/,
    /^not implemented$/,
    /^held \(strip ruling\)$/,
    /^waived$/,
    /^n\/a \(profile: [^)]+\)$/,
    /^n\/a \(architecture: .+\)$/,
];
const TIERS = ['live', 'contract', 'mock', 'n/a (pure)', '-'];
const IMPLEMENTED_TIERS = ['live', 'contract', 'n/a (pure)'];
const TABLE_HEADER = /^\|\s*Rule\s*\|\s*Status\s*\|\s*Tier\s*\|\s*Evidence\s*\|/;

/** Split a table row on UNESCAPED pipes, so `a\|b` inside evidence stays one cell. */
const cellsOf = (line) =>
    line
        .trim()
        .replace(/^\|/, '')
        .replace(/(?<!\\)\|$/, '')
        .split(/(?<!\\)\|/)
        .map((c) => c.trim());

/** Rule ids are the anchors that introduce a `###` rule heading — not `profiles`, not `open`. */
export function specIds(spec) {
    return [...spec.matchAll(/<a id="([a-z]+-\d+)"><\/a>\s*\n###\s/g)].map((m) => m[1].toUpperCase());
}

export function audit(md, loadSpec) {
    const problems = [];

    const blob = md.match(/^\|\s*\*\*Spec revision read\*\*\s*\|[^\n]*\bblob ([0-9a-f]{40})\b/m)?.[1];
    if (!blob) problems.push('header: no `| **Spec revision read** | … blob <40-hex sha> |` row');
    if (!/^\|\s*\*\*Profiles\*\*\s*\|/m.test(md)) problems.push('header: no `| **Profiles** |` row');

    let ids = [];
    if (blob) {
        try {
            ids = specIds(loadSpec(blob));
            if (!ids.length) problems.push(`spec: blob ${blob} contains no rule ids`);
        } catch (e) {
            problems.push(`header: blob ${blob} does not resolve (${String(e.message).split('\n')[0]})`);
        }
    }

    const lines = md.split('\n');
    const headers = lines.flatMap((l, i) => (TABLE_HEADER.test(l) ? [i] : []));
    if (headers.length !== 1) problems.push(`status table: expected exactly one \`| Rule | Status | Tier | Evidence |\` header, found ${headers.length}`);

    const rows = [];
    if (headers.length) {
        for (let i = headers[0] + 2; i < lines.length && lines[i].trim().startsWith('|'); i++) rows.push({ line: i + 1, cells: cellsOf(lines[i]) });
    }

    const graded = new Map();
    const tally = {};
    for (const { line, cells } of rows) {
        const [id, status = '', tier = '', evidence = ''] = cells;
        if (cells.length !== 4) problems.push(`line ${line}: ${cells.length} cells, expected 4`);
        if (!/^[A-Z]+-\d+$/.test(id)) {
            problems.push(`line ${line}: \`${id}\` is not a single rule id — family rows are not allowed`);
            continue;
        }
        if (ids.length && !ids.includes(id)) problems.push(`line ${line}: ${id} is not a rule in blob ${blob}`);
        graded.set(id, (graded.get(id) ?? 0) + 1);

        if (!STATUSES.some((re) => re.test(status))) problems.push(`line ${line}: ${id} status \`${status}\` is not canonical`);
        if (!TIERS.includes(tier)) problems.push(`line ${line}: ${id} tier \`${tier}\` is not canonical`);
        if (status === 'implemented' && !IMPLEMENTED_TIERS.includes(tier))
            problems.push(`line ${line}: ${id} is implemented on tier \`${tier}\` — needs live, contract or n/a (pure)`);
        if (status === 'delegated' && tier !== '-') problems.push(`line ${line}: ${id} is delegated with tier \`${tier}\` — a delegated row takes \`-\``);
        if (status === 'provisional' && tier !== 'mock')
            problems.push(`line ${line}: ${id} is provisional with tier \`${tier}\` — provisional means mock evidence`);
        if (!evidence) problems.push(`line ${line}: ${id} has no evidence`);

        const bucket = status.replace(/^(n\/a \((?:profile|architecture)):.*$/, '$1)');
        tally[bucket] = (tally[bucket] ?? 0) + 1;
    }
    for (const [id, n] of graded) if (n > 1) problems.push(`${id} is graded ${n} times`);
    for (const id of ids) if (!graded.has(id)) problems.push(`${id} is not graded`);

    return { blob, ids, rows: rows.length, tally, problems };
}

const gitSpec = (blob) => execFileSync('git', ['-C', LANGSYS2, 'cat-file', '-p', blob], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function selfTest() {
    const blob = readFileSync(join(ROOT, 'CONFORMANCE.md'), 'utf8').match(/\bblob ([0-9a-f]{40})\b/)?.[1];
    if (!blob) {
        console.log('FAIL  self-test needs the blob CONFORMANCE.md cites, to build a synthetic file from real rule ids');
        process.exit(1);
    }
    const ids = specIds(gitSpec(blob));
    const passing = [
        `| **Spec revision read** | langsys2 x, docs/sdk-spec.mdx blob ${blob} |`,
        '| **Profiles** | binding |',
        '',
        '| Rule | Status | Tier | Evidence |',
        '| --- | --- | --- | --- |',
        ...ids.map((id) => `| ${id} | delegated | - | probe \`a\\|b\` |`),
    ].join('\n');
    const first = ids[0];

    const cases = [
        ['an unmodified synthetic file passes', passing, null],
        ['a missing row', passing.replace(/\n[^\n]*$/, ''), 'is not graded'],
        ['a duplicated row', `${passing}\n| ${first} | delegated | - | again |`, 'graded 2 times'],
        ['a family row', passing.replace(`| ${first} |`, '| GATE |'), 'family rows are not allowed'],
        ['an id the spec does not have', `${passing}\n| ZZZ-99 | delegated | - | x |`, 'is not a rule in blob'],
        ['a non-canonical status', passing.replace(`| ${first} | delegated |`, `| ${first} | done |`), 'is not canonical'],
        ['implemented on mock evidence', passing.replace(`| ${first} | delegated | - |`, `| ${first} | implemented | mock |`), 'is implemented on tier'],
        ['delegated with a tier', passing.replace(`| ${first} | delegated | - |`, `| ${first} | delegated | live |`), 'a delegated row takes'],
        ['a second status table', `${passing}\n\n| Rule | Status | Tier | Evidence |\n| --- | --- | --- | --- |`, 'expected exactly one'],
        ['a blob that does not resolve', passing.replace(blob, '0'.repeat(40)), 'does not resolve'],
        ['no Profiles row', passing.replace('| **Profiles** | binding |', ''), 'Profiles'],
    ];

    let bad = 0;
    for (const [name, doc, expected] of cases) {
        const { problems } = audit(doc, gitSpec);
        const ok = expected === null ? problems.length === 0 : problems.some((p) => p.includes(expected));
        if (!ok) bad++;
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  — problems: ${JSON.stringify(problems.slice(0, 3))}`}`);
    }
    console.log(`\nsynthetic file built from ${ids.length} rule ids in blob ${blob.slice(0, 8)}`);
    process.exit(bad ? 1 : 0);
}

if (process.argv.includes('--self-test')) selfTest();

const { blob, ids, rows, tally, problems } = audit(readFileSync(join(ROOT, 'CONFORMANCE.md'), 'utf8'), gitSpec);
console.log(`spec     blob ${blob ?? '(none)'} in ${LANGSYS2} — ${ids.length} rule ids`);
console.log(`file     ${rows} status rows`);
console.log('');
for (const [status, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`${status.padEnd(26)} ${n}`);
console.log(`${'TOTAL'.padEnd(26)} ${rows}`);
console.log(`\n${problems.length} problem(s)`);
for (const p of problems) console.log(`  ${p}`);
if (process.argv.includes('--check') && problems.length) process.exit(1);
