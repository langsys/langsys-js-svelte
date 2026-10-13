import { parse } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';
import { assignNames, shapeOf, type Expr } from './naming.js';
import vectorFile from '../../../vectors/var-naming-vectors.json';

/**
 * VAR-2, run on the shared naming vectors (`vectors/var-naming-vectors.json`, vendored byte-exact
 * from the JS core, blob da9cf3d5). The naming is the core's; what these rows pin here is that
 * Svelte's AST maps onto each row's shape, and that the names come out as the row says.
 */

const vectors = vectorFile as unknown as {
    cases: Array<{ id: string; expressions: Array<{ source: string; shape: unknown; explicit?: string }>; names: string[] }>;
};

/** Expressions as Svelte's parser hands them to the preprocessor (lang="ts", as in a real app). */
function exprs(...sources: string[]): Expr[] {
    const ast = parse(`<script lang="ts"></script><p>${sources.map((s) => `{${s}}`).join(' ')}</p>`, { modern: true });
    const p = ast.fragment.nodes.find((n) => n.type === 'RegularElement') as unknown as { fragment: { nodes: Array<{ type: string; expression: Expr }> } };
    return p.fragment.nodes.filter((n) => n.type === 'ExpressionTag').map((n) => n.expression);
}

function names(sources: string[], explicit: Array<string | undefined> = [], taken: Set<string> = new Set()) {
    const parsed = exprs(...sources);
    const { names, unnameable } = assignNames(
        sources.map((_, i) => ({ id: i, expr: parsed[i], explicit: explicit[i] })),
        taken
    );
    return { names: parsed.map((_, i) => names.get(i)), unnameable: unnameable.map((i) => sources[i]) };
}

describe('VAR-2 — the shared naming vectors', () => {
    it('are the vendored file, with every row the spec table asks for', () => {
        expect(vectors.cases.length).toBe(31);
    });

    it.each(vectors.cases.map((c) => [c.id, c] as const))('%s', (_, c) => {
        const sources = c.expressions.map((e) => e.source);
        const parsed = exprs(...sources);
        // The binding's half: Svelte's AST maps onto the row's shape.
        expect(parsed.map(shapeOf)).toEqual(c.expressions.map((e) => e.shape));
        // And the names are the row's.
        expect(
            names(
                sources,
                c.expressions.map((e) => e.explicit)
            ).names
        ).toEqual(c.names);
    });
});

describe('VAR-2 — what Svelte adds', () => {
    it.each([
        ['a store read', '$count', 'count'],
        ['optional chaining', 'user?.profile?.displayName', 'display_name'],
        ['a TypeScript assertion', 'user.name!', 'name'],
        ['a nested one-argument call', 'upper(trim(user.name))', 'name'],
    ])('%s: {%s} → %s', (_, source, expected) => {
        expect(names([source]).names).toEqual([expected]);
    });

    it('a name written in the text (%name%) or in a literal params is taken', () => {
        expect(names(['user.name'], [], new Set(['name'])).names).toEqual(['user_name']);
    });

    it('reports every value it cannot name', () => {
        expect(names(['a + b', 'a+b', 'fmt(x, y)', 'user.name']).unnameable).toEqual(['a + b', 'a+b', 'fmt(x, y)']);
    });
});

describe('VAR-2 — distinct values never share a placeholder', () => {
    it('two unnameable expressions of one kind are value and value_2', () => {
        expect(names(['a + b', 'c * d']).names).toEqual(['value', 'value_2']);
        expect(names(['fmt("a b")', 'fmt("ab")']).names).toEqual(['value', 'value_2']);
    });

    it('a self-naming expression that repeats is one placeholder', () => {
        expect(names(['name', 'user.name', 'name', 'user . name']).names).toEqual(['name', 'user_name', 'name', 'user_name']);
    });

    it('an unnameable expression that repeats is a placeholder each time', () => {
        expect(names(['a + b', 'a+b', 'a + b']).names).toEqual(['value', 'value_2', 'value_3']);
    });
});
