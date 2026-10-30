/**
 * Writes `seeds/`, the files the SDK test clone seeds this binding's contract cases from before a
 * run, from `cases.mjs`. The clone's `SDK_TEST_SEED_PATHS` names the folder.
 *
 *     node _dev_/contract/make-seeds.mjs            # write the files
 *     node _dev_/contract/make-seeds.mjs --check    # fail if a file differs from what it would write
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import { seeds } from './cases.mjs';

const DIR = join(dirname(fileURLToPath(import.meta.url)), 'seeds');
const check = process.argv.includes('--check');
const options = { ...(await prettier.resolveConfig(join(DIR, 'x.json'))), parser: 'json' };

mkdirSync(DIR, { recursive: true });
const wanted = new Map();
for (const { file, doc } of seeds()) wanted.set(file, await prettier.format(JSON.stringify(doc), options));

const problems = [];
for (const [file, text] of wanted) {
    let current = null;
    try {
        current = readFileSync(join(DIR, file), 'utf8');
    } catch {
        // missing
    }
    if (current === text) continue;
    if (check) problems.push(`${file} ${current === null ? 'is missing' : 'differs from cases.mjs'}`);
    else writeFileSync(join(DIR, file), text);
}
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json') && !wanted.has(f))) problems.push(`${file} is not a suite in cases.mjs`);

for (const p of problems) console.error(p);
console.log(`${wanted.size} seed files${check ? ' checked' : ' written'}, ${problems.length} problem(s)`);
process.exit(problems.length ? 1 : 0);
