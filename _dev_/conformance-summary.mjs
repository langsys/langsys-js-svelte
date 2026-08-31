#!/usr/bin/env node
/**
 * Recomputes CONFORMANCE.md's summary from its own tables.
 *
 * Exists because the first version of that summary was labelled "computed" and
 * was not: it said 7 delegated where the tables carry 8, having missed BIND-3's
 * own row — a hand-count wearing the word "computed". Run it and paste, or diff
 * it against what the file claims.
 *
 *   node _dev_/conformance-summary.mjs
 */
import { readFileSync } from 'node:fs';

const GRADES = ['implemented', 'provisional', 'partial', 'delegated', 'n-a', 'open'];
const text = readFileSync(new URL('../CONFORMANCE.md', import.meta.url), 'utf8');

// Grade cells only: a table row whose second-or-later cell is exactly `grade`.
// The Grades *legend* table is skipped by requiring a rule/family name in cell 1.
const rows = text
    .split('\n')
    .filter((l) => l.startsWith('|') && !l.includes('| Means') && !/^\|\s*-+/.test(l))
    .map((l) => l.split('|').map((c) => c.trim()))
    .filter((cells) => cells.length > 2 && /\*\*|`/.test(cells[1] ?? ''));

const counts = Object.fromEntries(GRADES.map((g) => [g, 0]));
let total = 0;
for (const cells of rows) {
    const hit = cells.slice(2).find((c) => GRADES.includes(c.replace(/`/g, '')));
    if (!hit) continue;
    counts[hit.replace(/`/g, '')] += 1;
    total += 1;
}

for (const g of GRADES) console.log(`${g.padEnd(12)} ${counts[g]}`);
console.log(`${'TOTAL'.padEnd(12)} ${total}`);
