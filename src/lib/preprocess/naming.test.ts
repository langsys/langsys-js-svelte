import { parse } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';
import { assignNames, snakeCase, type Expr } from './naming.js';

/** The expressions of one phrase, as Svelte's parser hands them to the preprocessor. */
function name(...sources: string[]) {
    // lang="ts": the preprocessor meets TypeScript expressions in markup too.
    const ast = parse(`<script lang="ts"></script><p>${sources.map((s) => `{${s}}`).join(' ')}</p>`, { modern: true });
    const p = ast.fragment.nodes.find((n) => n.type === 'RegularElement') as unknown as { fragment: { nodes: Array<{ type: string; expression: Expr }> } };
    const occurrences = p.fragment.nodes.filter((n) => n.type === 'ExpressionTag').map((n, i) => ({ key: sources[i], expr: n.expression }));
    const { names, unnameable } = assignNames(occurrences);
    return { names: sources.map((s) => names.get(s)), unnameable };
}

// VAR-2's table, row by row. The shared vectors (var-naming-vectors.json, owned by the JS core)
// replace these rows once published.
describe('VAR-2 — placeholder names from the source expression', () => {
    it.each([
        ['an identifier, in snake_case', 'firstName', 'first_name'],
        ['an identifier already snake', 'name', 'name'],
        ['a store read', '$count', 'count'],
        ['a member chain: its last segment', 'user.name', 'name'],
        ['optional chaining', 'user?.profile?.displayName', 'display_name'],
        ['length', 'items.length', 'items_count'],
        ['size', 'cart.items.size', 'items_count'],
        ['count', 'order.count', 'order_count'],
        ['value', 'price.value', 'price'],
        ['current', 'ref.current', 'ref'],
        ['a call with one argument: the argument', 'formatDate(order.date)', 'date'],
        ['a nested one-argument call', 'upper(trim(user.name))', 'name'],
        ['a TypeScript assertion', 'user.name!', 'name'],
    ])('%s: {%s} → %s', (_, source, expected) => {
        expect(name(source).names).toEqual([expected]);
    });

    it.each([
        ['a binary expression', 'a + b'],
        ['a conditional', 'ok ? yes : no'],
        ['a template literal', '`${a}!`'],
        ['a computed member', 'items[0]'],
        ['a call with several arguments', 'fmt(a, b)'],
        ['a call with none', 'now()'],
    ])('%s is unnameable: value, with a warning', (_, source) => {
        expect(name(source)).toEqual({ names: ['value'], unnameable: [source] });
    });

    it('unnameable values in one phrase are value, value_2', () => {
        expect(name('a + b', 'c * d').names).toEqual(['value', 'value_2']);
    });

    it('a taken name is prefixed with its previous segment', () => {
        expect(name('a.name', 'b.name').names).toEqual(['a_name', 'b_name']);
    });

    it('then suffixed _2, _3', () => {
        expect(name('name', 'fmt(name)', 'x.name').names).toEqual(['name', 'name_2', 'x_name']);
        expect(name('a.b.name', 'c.b.name').names).toEqual(['b_name', 'b_name_2']);
    });

    it('the same expression twice is one placeholder', () => {
        expect(name('user.name', 'user.name').names).toEqual(['name', 'name']);
    });

    it('a name the developer wrote wins', () => {
        const ast = parse('<p>{user.name}</p>', { modern: true });
        const expr = (ast.fragment.nodes[0] as unknown as { fragment: { nodes: Array<{ expression: Expr }> } }).fragment.nodes[0].expression;
        expect(assignNames([{ key: 'user.name', expr }], new Set(['name'])).names.get('user.name')).toBe('user_name');
    });

    it('never produces a <Phrase> markup token', () => {
        expect(name('m0o').names).toEqual(['m0o_2']);
    });

    it('every name is ICU-safe', () => {
        for (const s of ['firstName', 'user.name', 'items.length', 'a + b', 'URLPath', '$_x9']) {
            for (const n of name(s).names) expect(n).toMatch(/^[a-z][a-z0-9_]*$/);
        }
        expect(snakeCase('URLPath')).toBe('url_path');
        expect(snakeCase('_9')).toBeNull();
    });
});
