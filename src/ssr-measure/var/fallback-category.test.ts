import { createRequestScope, type iCategories } from 'langsys-js-typescript';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import VarCategorySnippet from './VarCategorySnippet.svelte';
import VarFallbackCategory from './VarFallbackCategory.svelte';
import VarRecursive from './VarRecursive.svelte';

/**
 * VAR-6 for a unit the build reads on its own inside a block that falls back: inside the core's
 * request scope, the category it registers under is the block's, as it would be were the block
 * read, unless the unit names its own.
 */
async function sent(component: typeof VarFallbackCategory | typeof VarCategorySnippet | typeof VarRecursive, props: Record<string, unknown>) {
    const scope = await createRequestScope({ locale: 'en-us', catalog: {} as iCategories });
    // `.body` inside run(): Svelte renders when the body is read.
    scope.run(() => void render(component as typeof VarFallbackCategory, { props: props as never }).body);
    const blocks = (scope as unknown as { blockMisses: Map<string, unknown> }).blockMisses;
    return JSON.stringify([...scope.misses(), ...blocks.values()]);
}

const props = () => {
    let calls = 0;
    return {
        version: '1.2',
        items: ['x'],
        section: 'Shop',
        own: { category: 'Mine' },
        block: { category: 'Sp', tag: 'div' },
        after: { category: 'X' },
        unset: undefined,
        next: () => `C${++calls}`,
        calls: () => calls,
    };
};
const phrase = (category: string, text: string) => JSON.stringify({ category, phrase: text });

describe("a fallback block's own units", () => {
    it('take a category the block computes, an {#each} inside reusing its name included', async () => {
        const out = await sent(VarFallbackCategory, props());
        expect(out).toContain(phrase('Shop', 'Computed {version}'));
        expect(out).toContain(phrase('Shop', 'Each {version}'));
    });

    it('take the value the block got, computed once', async () => {
        const p = props();
        const out = await sent(VarFallbackCategory, p);
        expect(out).toContain(phrase('C1', 'Once {version}'));
        expect(p.calls()).toBe(1);
    });

    it('take the string Svelte makes of a category written as text, an unset value in it included', async () => {
        const out = await sent(VarFallbackCategory, props());
        expect(out).toContain(phrase('Shop', 'Text unset {version}'));
        expect(out).toContain(phrase('', 'Alone unset {version}'));
    });

    it('keep a category a spread names, and take one a spread gives the block', async () => {
        const out = await sent(VarFallbackCategory, props());
        expect(out).toContain(phrase('Mine', 'Spread {version}'));
        expect(out).toContain(phrase('Sp', 'Block spread {version}'));
    });

    it("keep a category they name after a spread decides the block's, read or fallen back", async () => {
        const out = await sent(VarFallbackCategory, props());
        expect(out).toContain(phrase('Shop', 'Named, read {version}'));
        expect(out).toContain(phrase('Shop', 'Named, fallen back {version}'));
    });

    it('take the instance of the block they are written in, when it renders another instance around them', async () => {
        const out = await sent(VarRecursive, { c: 'Outer', items: ['x'] });
        expect(out).toContain(phrase('Outer', 'Written in the outer one'));
    });

    it("take the block's for an empty category, as inside a block that is read", async () => {
        expect(await sent(VarFallbackCategory, props())).toContain(phrase('Out', 'Empty {version}'));
    });

    it("take the outer block's through a fallback inside it that names none", async () => {
        expect(await sent(VarFallbackCategory, props())).toContain(phrase('Outer', 'Deep {version}'));
    });

    it('take the block they are written in, not one another component wraps them in', async () => {
        const out = await sent(VarFallbackCategory, props());
        expect(out).toContain(phrase('A', 'Lexical {version}'));
        expect(out).toContain(phrase('W', 'Wrapped'));
    });

    it('in a {#snippet} the block is handed as a prop, whatever its parameters are named', async () => {
        const out = await sent(VarCategorySnippet, { ...props(), list: [{ n: 'a' }, { n: 'b' }] });
        expect(out).toContain(phrase('Shop', 'Line {version}'));
        expect(out).toContain(phrase('a,b', 'Arrow {version}'));
    });
});
