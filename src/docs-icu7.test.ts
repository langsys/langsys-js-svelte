import { describe, expect, it } from 'vitest';

/**
 * ICU-7: every surface this package ships shows phrases flat (`You have {count} new messages`) and
 * never writes a `plural`, `select` or `selectordinal` into a phrase. No network.
 *
 * The surfaces are what a developer or an agent reads: the READMEs, the agent skill, the doc comments
 * in `src/lib` (the tarball's JavaScript and the type declarations an editor shows come from them),
 * the demo and testbed pages under `src/routes`, and the guides under `_dev_`. A construct is allowed
 * only in a passage named in EXEMPT, which says which of ICU's three roles in documentation it serves.
 * A new ICU example fails here until someone decides it belongs in one of them and names it.
 *
 * Read through Vite's `?raw`, as `docs.test.ts` reads the READMEs: this project carries no Node types.
 */
const FILES = import.meta.glob(
    [
        '/*.md',
        '/skill/**/*.md',
        '/_dev_/**/*.md',
        '/src/routes/**/*.{svelte,ts,js}',
        '/src/lib/**/*.{svelte,ts,js}',
        '!/src/lib/**/*.test.ts',
        '!/src/routes/**/*.test.ts',
    ],
    { query: '?raw', import: 'default', eager: true }
) as Record<string, string>;

/** Root documents outside the rule, each for its reason. A new root document is scanned unless it is named here. */
const OUTSIDE = new Map<string, string>([
    ['CHANGELOG.md', 'a changelog records what earlier releases did'],
    ['CONFORMANCE.md', 'the grading of this package against the spec, for its maintainers; not shipped'],
    ['CLAUDE.md', "guidance for the maintainers' coding agent; not shipped"],
]);

const SURFACES = Object.fromEntries(
    Object.entries(FILES)
        .map(([path, text]) => [path.replace(/^\//, ''), text] as const)
        .filter(([path]) => !OUTSIDE.has(path))
);

/** An ICU argument that selects a branch: `{count, plural, …}`, `{name_gender, select, …}`. */
const ICU_CONSTRUCT = /\{\s*[A-Za-z_][\w.]*\s*,\s*(?:plural|select|selectordinal)\b/g;

type Role = 'catalog' | 'mig-4' | 'counter-example';
interface ExemptPassage {
    /** Path from the repository root. */
    file: string;
    role: Role;
    /** Text the passage holds exactly once in the file; every construct it exempts sits inside it. */
    text: string;
    /** What its line must also hold, which shows the passage for what it is (`❌`, or the words that say a translation holds it). */
    mark: string;
    /** `counter-example` only: a line next to it holding this, with no construct, is the flat phrase that replaces it. */
    flatBeside?: string;
}

/** ICU's three roles in documentation, as named passages. */
const EXEMPT: readonly ExemptPassage[] = [
    {
        // Role: what the catalog returns. The README says a number keeps its type so a plural form a
        // translation grows selects; the phrase the developer writes stays `{count}`.
        file: 'README.md',
        role: 'catalog',
        text: '(`{count, plural, one {…} other {…}}`)',
        mark: 'a plural form a translation grows',
    },
    // Role `mig-4` (what MIG-4 converts a legacy plural file into) and role `counter-example` have
    // no passage today: the README's legacy-keys section names the conversion in prose.
];

interface Finding {
    file: string;
    line: number;
    problem: string;
}

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;

/** What is wrong in one surface: an ICU construct no exempt passage covers, or an exempt passage that is missing, repeated or no longer marked. */
function scanSurface(file: string, text: string, exempt: readonly ExemptPassage[]): Finding[] {
    const findings: Finding[] = [];
    const lines = text.split('\n');
    const spans: Array<[number, number]> = [];
    for (const passage of exempt.filter((p) => p.file === file)) {
        const first = text.indexOf(passage.text);
        if (first === -1) {
            findings.push({ file, line: 0, problem: `exempt passage (${passage.role}) not found: ${JSON.stringify(passage.text)}` });
            continue;
        }
        const line = lineOf(text, first);
        if (text.indexOf(passage.text, first + 1) !== -1) findings.push({ file, line, problem: `exempt passage (${passage.role}) appears more than once` });
        spans.push([first, first + passage.text.length]);
        if (!(lines[line - 1] ?? '').includes(passage.mark))
            findings.push({ file, line, problem: `exempt passage (${passage.role}) lost its marking ${JSON.stringify(passage.mark)}` });
        if (passage.role === 'counter-example') {
            const beside = [lines[line - 2], lines[line]].filter(
                (l) => l !== undefined && passage.flatBeside !== undefined && l.includes(passage.flatBeside) && !new RegExp(ICU_CONSTRUCT.source).test(l)
            );
            if (!beside.length)
                findings.push({
                    file,
                    line,
                    problem: `counter-example has no flat replacement (a line holding ${JSON.stringify(passage.flatBeside)}) beside it`,
                });
        }
    }
    for (const match of text.matchAll(ICU_CONSTRUCT)) {
        const at = match.index ?? 0;
        if (spans.some(([from, to]) => at >= from && at < to)) continue;
        const line = lineOf(text, at);
        findings.push({ file, line, problem: `ICU construct in a phrase, not an exempt passage: ${(lines[line - 1] ?? '').trim()}` });
    }
    return findings;
}

describe('ICU-7: the surfaces this package ships show phrases flat', () => {
    it('scans the READMEs, the skill, the doc comments in src/lib, the demo and testbed pages and the guides, and not the three documents outside the rule', () => {
        const names = Object.keys(SURFACES);
        for (const expected of [
            'README.md',
            'README-SSR.md',
            'skill/SKILL.md',
            'skill/components.md',
            'skill/transform.md',
            'src/lib/index.ts',
            'src/lib/components/Translate.svelte',
            'src/lib/preprocess/index.ts',
            'src/routes/+page.svelte',
            'src/routes/fixture/var/+page.svelte',
            '_dev_/LOCAL-TESTING.md',
        ]) {
            expect(names).toContain(expected);
        }
        for (const name of OUTSIDE.keys()) {
            expect(Object.keys(FILES)).toContain(`/${name}`);
            expect(names).not.toContain(name);
        }
        expect(names.filter((n) => n.endsWith('.test.ts'))).toEqual([]);
    });

    it('writes no plural, select or selectordinal into a phrase, outside the named exempt passages', () => {
        const findings = Object.entries(SURFACES).flatMap(([file, text]) => scanSurface(file, text, EXEMPT));
        expect(findings.map((f) => `${f.file}:${f.line} ${f.problem}`)).toEqual([]);
    });

    it('has every exempt passage in a scanned surface', () => {
        for (const passage of EXEMPT) expect(Object.keys(SURFACES)).toContain(passage.file);
    });
});

describe('ICU-7: the check fails on what it exists to catch', () => {
    const flat = ['`You have {count} new messages`', "{$t('You have {count} new messages', 'Inbox', { count })}"].join('\n');

    it('passes flat phrases', () => {
        expect(scanSurface('x.md', flat, [])).toEqual([]);
    });

    it.each([
        ['a $t() argument', "{$t('{count, plural, one {# item} other {# items}}', 'Cart', { count })}"],
        ['a $t() argument with no spaces', "{$t('{n,plural,one{# item}other{# items}}', 'Cart', { n })}"],
        ['<Translate> content', '<Translate category="Cart">{count, plural, one {# item} other {# items}}</Translate>'],
        ['<Phrase> content', '<Phrase>{gender, select, female {She} other {They}} replied</Phrase>'],
        ['a phrase in prose', 'Write `{place, selectordinal, one {#st} two {#nd} other {#th}}` and it works.'],
        ['a doc comment', " * e.g. t('{who_gender, select, male {He} other {They}} left')"],
    ])('fails on %s', (_name, text) => {
        const findings = scanSurface('src/routes/+page.svelte', text, []);
        expect(findings).toHaveLength(1);
        expect(findings[0].problem).toContain('ICU construct in a phrase');
    });

    it('ignores the words plural and select where no argument uses them', () => {
        expect(scanSurface('x.md', '`<select>` picks a locale; a plural needs the count and its noun in one phrase; a {select} placeholder', [])).toEqual([]);
    });

    const counterExample: ExemptPassage = {
        file: 'x.md',
        role: 'counter-example',
        text: "$t('{count, plural, one {#} other {#}}', 'A', { count })",
        mark: '❌',
        flatBeside: '✅',
    };
    const marked = [
        "$t('You have {count} new messages', 'A', { count })  // ✅",
        "$t('{count, plural, one {#} other {#}}', 'A', { count })  // ❌ ICU written by hand",
    ].join('\n');

    it('allows a counter-example marked wrong beside its flat replacement', () => {
        expect(scanSurface('x.md', marked, [counterExample])).toEqual([]);
    });

    it('fails an exempt passage edited to lose its marking', () => {
        expect(scanSurface('x.md', marked.replace('❌', ''), [counterExample]).map((f) => f.problem)).toEqual([expect.stringContaining('lost its marking')]);
    });

    it('fails a counter-example whose flat replacement is gone', () => {
        expect(scanSurface('x.md', marked.split('\n')[1], [counterExample]).map((f) => f.problem)).toEqual([expect.stringContaining('no flat replacement')]);
    });

    it('fails a second copy of an exempt passage, and a construct outside it', () => {
        expect(scanSurface('x.md', `${marked}\n${marked.split('\n')[1]}`, [counterExample]).map((f) => f.problem)).toEqual([
            expect.stringContaining('more than once'),
            expect.stringContaining('ICU construct in a phrase'),
        ]);
    });

    it('fails an exempt passage that no longer exists, so a reworded passage is decided again', () => {
        expect(scanSurface('x.md', flat, [counterExample]).map((f) => f.problem)).toEqual([expect.stringContaining('not found')]);
    });
});
