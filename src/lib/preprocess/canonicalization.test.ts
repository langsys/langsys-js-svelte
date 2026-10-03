import { generateCustomId, tokenizeTree, type BlockNode } from 'langsys-js-typescript';
import { parse } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';
import { langsysPreprocess } from './index.js';
import fixtureFile from '../../../vectors/canonicalization-reference.json';

/**
 * The shared canonicalization rows (`vectors/canonicalization-reference.json`, vendored byte-exact
 * from the JS core, blob fa32452d), run through the build: each row's markup written as the body of
 * a `<Translate>`, turned into a tree by the preprocessor, and tokenized by the core. The ids a
 * server render stamps are these, so they must be the ids a DOM reader derives from the same markup.
 */
const fixture = fixtureFile as unknown as {
    cases: Array<{ id: string; category: string; html: string; expected_tokens: string[]; expected_custom_id: string }>;
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
};
/** Rows the build does not express as a tree, each for a stated reason. */
const NOT_TREES: Record<string, string> = {
    'math-subtree': 'a <math> subtree is a fallback: another namespace',
    'svg-inline-icon': 'an <svg> subtree is a fallback: another namespace',
    'style-subtree': 'a <style> is a fallback: raw text',
    'script-subtree': 'a <script> in markup is a fallback: raw text',
};
/** Rows about markup a reader meets but this build never emits (the attribute form, voided markers, bad names). */
const READER_ONLY = /^var-(attribute|voided|unmarked)/;

function treeOf(markup: string, category: string, scope: Record<string, unknown> = {}): { tree?: BlockNode[]; fallback?: string } {
    const content = `<script>import { Translate } from 'langsys-js-svelte';</script><Translate category=${JSON.stringify(category)}>${markup}</Translate>`;
    const out = langsysPreprocess({ warn: () => {} }).markup({ content, filename: 'Row.svelte' });
    const code = out!.code;
    const ast = parse(code, { modern: true }) as unknown as {
        fragment: { nodes: Array<{ attributes?: Array<{ name: string; value: { expression: { start: number; end: number } } }> }> };
    };
    const ls = ast.fragment.nodes.flatMap((n) => n.attributes ?? []).find((a) => a.name === '__ls')!;
    const body = code.slice(ls.value.expression.start, ls.value.expression.end);
    return new Function(...Object.keys(scope), `return (${body});`)(...Object.values(scope));
}

describe('the build derives the ids a DOM reader derives', () => {
    it('reads the vendored fixture', () => {
        expect(fixture.cases.length).toBe(41);
    });

    const rows = fixture.cases.filter((c) => !READER_ONLY.test(c.id));
    it.each(rows.map((c) => [c.id, c] as const))('%s', (id, c) => {
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
    });
});
