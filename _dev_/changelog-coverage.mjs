#!/usr/bin/env node
/**
 * changelog-coverage — assert every released git tag has a CHANGELOG section.
 *
 * Standalone and dependency-free so any repo can drop it into its own CI. It
 * belongs THERE rather than in a central guard: the tags live in the repo, and
 * the failure it prevents is silent, so it has to run on every release rather
 * than when someone remembers.
 *
 * WHY THIS EXISTS — two traced incidents, independently, in two repos:
 *
 *   langsys-js-typescript@0.2.0 flipped t(category, phrase) → t(phrase, category?)
 *   with no changelog entry. Nothing prompted CLAUDE.md or the README. The docs
 *   were correct when written and then STRANDED for eleven releases.
 *
 *   langsys-js-svelte@3.1.0 ADDED <Phrase>/<DontTranslate> and REMOVED the
 *   contentBlocks re-export, with no entry. That one gap produced defects on
 *   three surfaces: an undocumented README (four minor releases), a stale
 *   index.d.ts header, and a CLAUDE.md referencing the removed export.
 *
 * So: a missing changelog entry is a doc defect that CAUSES other doc defects.
 * It has no symptom on the day it happens; the defects surface months later
 * looking like unrelated writing errors.
 *
 * ON FILLING A GAP — reconstruction is only cheap where commit-message
 * discipline already held. Where commit bodies explain the mechanism, history is
 * recoverable. Where they are terse, you can DETECT the gap but not fill it
 * accurately, and the honest move is a stub recording that the release exists and
 * is undocumented. Do not invent plausible history to satisfy this check: a
 * confidently-wrong entry is worse than an acknowledged gap, because it stops
 * anyone looking further.
 *
 * Usage: node changelog-coverage.mjs [repoDir] [--strict]
 * Exit:  0 covered (or gaps, without --strict); 1 gaps found with --strict.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repo = resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : process.cwd());
const strict = process.argv.includes('--strict');

const changelog = ['CHANGELOG.md', 'CHANGELOG.markdown', 'changelog.md']
    .map((f) => join(repo, f)).find(existsSync);

if (!changelog) {
    console.log(`changelog-coverage: no CHANGELOG found in ${repo}`);
    process.exit(strict ? 1 : 0);
}

let tags = [];
try {
    tags = execFileSync('git', ['-C', repo, 'tag'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
        .split('\n').map((t) => t.trim())
        .filter((t) => /^v?\d+\.\d+\.\d+$/.test(t));
} catch {
    console.log('changelog-coverage: not a git repository, or git unavailable');
    process.exit(0);
}

if (tags.length === 0) {
    console.log('changelog-coverage: no release tags yet');
    process.exit(0);
}

const text = readFileSync(changelog, 'utf8');
// Heading formats vary (## [1.2.3], ## v1.2.3 — date, ### 1.2.3), so match the
// version number inside any heading rather than a fixed shape.
const documented = new Set([...text.matchAll(/^#{1,4}\s.*?(\d+\.\d+\.\d+)/gm)].map((m) => m[1]));

const cmp = (a, b) => {
    const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
    return 0;
};

// A changelog may deliberately begin at a point in history — reporting every tag
// older than its earliest entry is noise, and noise trains readers to ignore the
// check. Verified load-bearing: 16 reported without this boundary, 2 with.
const earliest = [...documented].sort(cmp)[0];

const missing = tags
    .map((t) => t.replace(/^v/, ''))
    .filter((v) => !documented.has(v))
    .filter((v) => !earliest || cmp(v, earliest) > 0)
    .sort(cmp);

const rel = changelog.replace(repo + '/', '');
if (missing.length === 0) {
    console.log(`changelog-coverage: all ${tags.length} released tag(s) documented in ${rel}`);
    process.exit(0);
}

console.log(`\nchangelog-coverage: ${missing.length} released tag(s) missing from ${rel}\n`);
for (const v of missing) console.log(`  ✗ ${v}`);
console.log(`\n  (covered range starts at ${earliest}; older tags are not reported)`);
console.log(`
  A missing entry has no symptom today. It removes the prompt to update the
  README, the type-declaration header, and any agent-facing docs — so the
  defects surface later looking like unrelated writing errors.

  Fill from the commit bodies for each tag. If they are too terse to reconstruct
  accurately, write a stub recording that the release exists and is undocumented.
  Do NOT invent plausible history to satisfy this check.
`);
process.exit(strict ? 1 : 0);
