import {
    PHRASE_MARKER_ATTR,
    createRequestScope,
    generateCustomId,
    registerBlock,
    renderBlock,
    tokenizeTree,
    type BlockNode,
    type RenderedNode,
    type iCategories,
} from 'langsys-js-typescript';
import { parse } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';
import { langsysPreprocess } from './index.js';
import fixtureFile from '../../../vectors/canonicalization-reference.json';

/**
 * The shared canonicalization rows (`vectors/canonicalization-reference.json`, vendored byte-exact
 * from the JS core, blob 525afacd), run through the build: each row's markup written as the body of
 * a `<Translate>`, turned into a tree by the preprocessor, and tokenized by the core. The ids a
 * server render stamps are these, so they must be the ids a DOM reader derives from the same markup,
 * and a row pinning the content a block registers with is that content (VAR-3). Each phrase row is
 * written as the body of a `<Phrase>`, and registers its key, or nothing (TOK-1).
 */
const fixture = fixtureFile as unknown as {
    cases: Array<{ id: string; category: string; html: string; expected_tokens: string[]; expected_custom_id: string; expected_content?: string }>;
    phrase_cases: Array<{ id: string; category: string; html: string; expected_phrase: string; registers: boolean; earlier_phrase?: string }>;
};

/** What a Svelte author writes for each value-marker row: the value is a variable. */
const AS_SVELTE: Record<string, { markup: string; scope: Record<string, unknown> }> = {
    'var-comment': { markup: '<p>Hello {name}, welcome back</p>', scope: { name: 'Ana' } },
    'var-two-markers': { markup: '<p>Hi {firstName} {lastName}!</p>', scope: { firstName: 'Ana', lastName: 'Ruiz' } },
    'var-marker-only': { markup: '<p>{name}</p>', scope: { name: 'Ana' } },
    'var-marker-slot': { markup: '<p>Order total</p><p>{total}</p>', scope: { total: 42 } },
    // In Svelte markup `{name}` is an expression, so this row is a variable too — and lands on the
    // same token and id as the literal text the row describes.
    'brace-name-in-markup': { markup: '<p>Hello {name}</p>', scope: { name: 'Ana' } },
    'var-content-run': { markup: '<p>Signed in as {email} today</p><p>Welcome back</p>', scope: { email: 'a@b.c' } },
    'var-content-slot': { markup: '<p>Signed in as <b>{name}</b> on day 2</p>', scope: { name: 'Ana' } },
    // An author's own exclusion, written on the element: the build passes the attribute through.
    'var-content-translate-no': { markup: '<p>Signed in as <span translate="no">{email}</span> today</p>', scope: { email: 'a@b.c' } },
};
/** Rows the build does not express as a tree, each for a stated reason. */
const NOT_TREES: Record<string, string> = {
    'math-subtree': 'a <math> subtree is a fallback: another namespace',
    'svg-inline-icon': 'an <svg> subtree is a fallback: another namespace',
    'style-subtree': 'a <style> is a fallback: raw text',
    'script-subtree': 'a <script> in markup is a fallback: raw text',
};
/** Rows about markup a reader meets but this build never emits (the attribute form, voided markers, bad names). */
const READER_ONLY = /^var-(attribute|voided|unmarked|content-attr)/;

/** What a Svelte author writes for each phrase row holding a marked value: a variable. */
const PHRASE_AS_SVELTE: Record<string, { markup: string; scope: Record<string, unknown> }> = {
    'tok1-rich-no-marked': { markup: 'Signed in as <span translate="no">{email}</span> today', scope: { email: 'a@b.c' } },
    'tok1-rich-no-mixed': { markup: 'Signed in as <span translate="no">user {email}</span> today', scope: { email: 'a@b.c' } },
    'tok1-rich-notrans-marked': { markup: 'Signed in as <span data-notrans>{email}</span> today', scope: { email: 'a@b.c' } },
    'tok1-rich-notrans-mixed': { markup: 'Signed in as <span data-notrans>user {email}</span> today', scope: { email: 'a@b.c' } },
};
/** Phrase rows the build does not express as a tree. */
const PHRASE_NOT_TREES: Record<string, string> = {
    'tok1-rich-script': 'a <script> in markup is a fallback: raw text',
};

function treeOf(markup: string, category: string, scope: Record<string, unknown> = {}, unit = 'Translate'): { tree?: BlockNode[]; fallback?: string } {
    const content = `<script>import { ${unit} } from 'langsys-js-svelte';</script><${unit} category=${JSON.stringify(category)}>${markup}</${unit}>`;
    const out = langsysPreprocess({ warn: () => {} }).markup({ content, filename: 'Row.svelte' });
    const code = out!.code;
    const ast = parse(code, { modern: true }) as unknown as {
        fragment: { nodes: Array<{ attributes?: Array<{ name: string; value: { expression: { start: number; end: number } } }> }> };
    };
    const ls = ast.fragment.nodes.flatMap((n) => n.attributes ?? []).find((a) => a.name === '__ls')!;
    const body = code.slice(ls.value.expression.start, ls.value.expression.end);
    return new Function(...Object.keys(scope), `return (${body});`)(...Object.values(scope));
}

/** What a request scope sends for `run`: its phrase misses, and the content of each block. */
async function sent(run: () => void, catalog: iCategories = {} as iCategories, locale = 'en-us') {
    const scope = await createRequestScope({ locale, catalog });
    scope.run(run);
    const blocks = (scope as unknown as { blockMisses: Map<string, { content?: string }> }).blockMisses;
    return { phrases: scope.misses(), contents: [...blocks.values()].map((b) => b.content) };
}

const textOf = (nodes: RenderedNode[]): string => nodes.map((n) => ('text' in n ? n.text : 'tag' in n ? textOf(n.children) : '')).join('');

describe('the build derives the ids a DOM reader derives', () => {
    it('reads the vendored fixture', () => {
        expect(fixture.cases.length).toBe(45);
        expect(fixture.phrase_cases.length).toBe(13);
    });

    const rows = fixture.cases.filter((c) => !READER_ONLY.test(c.id));
    it.each(rows.map((c) => [c.id, c] as const))('%s', async (id, c) => {
        const svelte = AS_SVELTE[id];
        const out = treeOf(svelte?.markup ?? c.html, c.category, svelte?.scope);
        if (NOT_TREES[id]) {
            expect(out.fallback).toBeDefined();
            return;
        }
        expect(out.fallback).toBeUndefined();
        const { tokens } = tokenizeTree(out.tree!);
        expect(tokens).toEqual(c.expected_tokens);
        expect(generateCustomId(c.category, tokens)).toBe(c.expected_custom_id);
        if (c.expected_content !== undefined) {
            const { contents } = await sent(() => void registerBlock(out.tree!, { category: c.category }));
            expect(contents).toEqual([c.expected_content]);
        }
    });
});

describe('a <Phrase> keys an excluded element as the core does (TOK-1)', () => {
    it.each(fixture.phrase_cases.map((c) => [c.id, c] as const))('%s', async (id, c) => {
        const svelte = PHRASE_AS_SVELTE[id];
        const out = treeOf(svelte?.markup ?? c.html, c.category, svelte?.scope, 'Phrase');
        if (PHRASE_NOT_TREES[id]) {
            expect(out.fallback).toBeDefined();
            return;
        }
        expect(out.fallback).toBeUndefined();
        // The host as <Phrase> renders it.
        const host: BlockNode[] = [{ tag: 'span', attrs: { [PHRASE_MARKER_ATTR]: '' }, children: out.tree! }];
        const { phrases } = await sent(() => void registerBlock(host, { category: c.category }));
        expect(phrases).toEqual(c.registers ? [{ category: c.category, phrase: c.expected_phrase }] : []);
        // A key the reader produced before is looked up on a miss, and never registered.
        if (c.earlier_phrase && c.earlier_phrase !== c.expected_phrase) {
            const catalog = { [c.category]: { [c.earlier_phrase]: `IT ${c.earlier_phrase}` } } as unknown as iCategories;
            let text = '';
            const later = await sent(
                () => {
                    text = textOf(renderBlock(host, { category: c.category }).nodes);
                    void registerBlock(host, { category: c.category });
                },
                catalog,
                'it-it'
            );
            expect(text).toMatch(/^IT /);
            expect(later.phrases).toEqual([{ category: c.category, phrase: c.expected_phrase }]);
        }
    });
});
