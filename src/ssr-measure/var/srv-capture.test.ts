import { createRequestScope, type iCategories } from 'langsys-js-typescript';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import VarNested from './VarNested.svelte';

/**
 * SRV-5 through the transform, inside the core's request scope — the render a SvelteKit request
 * performs. The scope's own record is counted: every block a render hands the core is recorded
 * through `recordRendered`, and what the post-response flush sends is `misses()`. Counting calls,
 * not a set, because duplicates are identical and a set hides them.
 */
async function renderInScope() {
    const scope = await createRequestScope({ locale: 'it-it', catalog: {} as iCategories });
    // The scope's internal record, which the core's renderer calls; the public type does not name it.
    const internal = scope as unknown as { recordRendered(entry: { customId: string }): void };
    const recorded: string[] = [];
    const original = internal.recordRendered.bind(scope);
    internal.recordRendered = (entry) => {
        recorded.push(entry.customId);
        return original(entry);
    };
    const body = scope.run(() => render(VarNested, { props: {} }).body);
    return { scope, recorded, body };
}

describe('SRV-5 — each nested block is captured once, and a declined one takes the fallback', () => {
    it('a depth-3 nested block records each block exactly once per render', async () => {
        const { recorded } = await renderInScope();
        const counts = Object.values(recorded.reduce<Record<string, number>>((m, id) => ({ ...m, [id]: (m[id] ?? 0) + 1 }), {}));
        expect(counts).toEqual([1, 1, 1]);
    });

    it('… and what the flush sends has each miss once', async () => {
        const { scope } = await renderInScope();
        // The flush sends the phrase misses and the block misses; a single-token block is a phrase.
        const internal = scope as unknown as { phraseMisses: Map<string, unknown>; blockMisses: Map<string, unknown> };
        const text = JSON.stringify([...internal.phraseMisses.values(), ...internal.blockMisses.values()]);
        for (const phrase of ['Depth one', 'Depth two', 'Depth three']) expect(text.split(`"${phrase}"`).length - 1).toBe(1);
    });

    it('an {#await} block is declined, not captured: served as source, no resolved marker, nothing thrown', async () => {
        const { body } = await renderInScope();
        const at = body.indexOf('id="awaiting"');
        expect(at).toBeGreaterThan(0);
        expect(body.replace(/<!--[^]*?-->/g, '')).toContain('<p id="awaiting">Loading…</p>');
        const host =
            body
                .slice(0, at)
                .replace(/<!--[^]*?-->/g, '')
                .match(/<div[^>]*>\s*$/)?.[0] ?? '';
        expect(host).not.toContain('data-ls-resolved');
    });
});
