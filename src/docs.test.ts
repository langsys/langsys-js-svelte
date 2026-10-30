import { describe, expect, it } from 'vitest';
// `?raw`, not `node:fs`: this project carries no Node type definitions, and the raw
// import reads the same bytes the tarball ships.
import readme from '../README.md?raw';
import readmeSsr from '../README-SSR.md?raw';

/**
 * Two spec rules are about what the SHIPPED documents say, so they are checked against
 * the documents rather than asserted in a conformance row.
 *
 * - SSR-3 — the `'server'` strategy's allow-list precondition stated "in its own callout,
 *   not a footnote". It used to be the last sentence of a callout about something else.
 * - WIRE-5 — the API-base seam documented where an integrator actually reads: the README.
 *
 * Both READMEs ship in the tarball (`files` in package.json).
 */
const DOCS: Record<string, string> = { 'README.md': readme, 'README-SSR.md': readmeSsr };
const doc = (name: string): string => DOCS[name];

/** GitHub alert callouts: a `> [!TYPE]` line plus the `>` lines under it. A plain blockquote is not one. */
function callouts(md: string): string[] {
    const lines = md.split('\n');
    const found: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        if (!/^> \[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/.test(lines[i])) continue;
        const body: string[] = [];
        for (let j = i + 1; j < lines.length && lines[j].startsWith('>'); j++) body.push(lines[j].replace(/^>\s?/, ''));
        found.push(body.join('\n'));
    }
    return found;
}

/** A callout that LEADS with the precondition — not one that mentions it in passing. */
const leadsWithAllowList = (callout: string) => /^\*\*`'server'` requires[^*]*allow-listed/.test(callout);

describe('SSR-3 — the server strategy’s precondition is a callout of its own', () => {
    it('control: the parser finds a callout that is known to exist', () => {
        expect(callouts(doc('README-SSR.md')).some((c) => c.includes('hooks.server.js'))).toBe(true);
    });

    it('control: a plain blockquote is not counted as a callout', () => {
        // README.md's discovery-gap note is a blockquote that ALSO mentions the allow-list —
        // exactly the footnote shape the rule forbids. It must not satisfy the check.
        expect(doc('README.md')).toContain('> **The discovery gap under');
        expect(callouts(doc('README.md')).some((c) => c.includes('The discovery gap under'))).toBe(false);
    });

    it.each(['README.md', 'README-SSR.md'])('%s carries a callout that leads with the allow-list precondition', (name) => {
        expect(callouts(doc(name)).some(leadsWithAllowList)).toBe(true);
    });
});

describe('WIRE-5 — the API-base seam is documented on the README', () => {
    it('a README section shows `apiUrl` in init config and warns off a late `setBaseUrl`', () => {
        const section = doc('README.md')
            .split(/\n### /)
            .find((s) => s.startsWith('Pointing the SDK at another API'));
        expect(section).toBeDefined();
        expect(section).toMatch(/apiUrl:/);
        expect(section).toMatch(/setBaseUrl/);
    });
});
