import { createRequestScope, type iCategories, type iContentBlock } from 'langsys-js-typescript';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import VarContent from './VarContent.svelte';

/**
 * VAR-1, VAR-3 and MARK-4 for the `content` a transformed block registers with, inside the core's request
 * scope: what the post-response flush sends. The scope's block record is read directly.
 */
async function blocksSent(name: string): Promise<iContentBlock[]> {
    const scope = await createRequestScope({ locale: 'it-it', catalog: {} as iCategories });
    // `.body` inside run(): Svelte renders when the body is read.
    scope.run(() => render(VarContent, { props: { name } }).body);
    return [...(scope as unknown as { blockMisses: Map<string, iContentBlock> }).blockMisses.values()];
}

const byToken = (blocks: iContentBlock[], token: string) => blocks.find((b) => b.tokens.includes(token))?.content ?? '';

describe("a block's registered content", () => {
    it('holds each value as its placeholder, the marker removed, the outer block and the nested one', async () => {
        const blocks = await blocksSent('Ana');
        expect(byToken(blocks, 'Welcome back, {name}')).toContain('<p>Welcome back, {name}</p>');
        expect(byToken(blocks, 'Taken by {name}')).toBe('<p>Taken by {name}</p> <p>Last week</p>');
        expect(blocks.map((b) => b.content).join('')).not.toMatch(/Ana|<!--ls:/);
    });

    it('holds a name written by hand as its placeholder too, in the text and in an attribute', async () => {
        expect(byToken(await blocksSent('Ana'), 'Written by hand')).toBe('<p title="To {name}">Hello {name}, again</p> <p>Written by hand</p>');
    });

    it("keeps a nested block or phrase host's element and none of its content", async () => {
        const outer = byToken(await blocksSent('Ana'), 'Welcome back, {name}');
        expect(outer).toMatch(/<section data-ls-contentblock[^>]*><\/section>/);
        expect(outer).toMatch(/<p data-ls-phrase[^>]*><\/p>/);
        expect(outer).not.toMatch(/Taken by|Last week|Signed in as/);
    });

    it('control: an opted-out element is the outer block’s content, and the content shows it', async () => {
        expect(byToken(await blocksSent('Ana'), 'Opted out below')).toContain('Kept with the outer block');
    });
});

describe('a nested unit inside a block (VAR-2)', () => {
    async function rendered(locale: string, catalog = {} as iCategories) {
        const scope = await createRequestScope({ locale, catalog });
        let body = '';
        scope.run(() => (body = render(VarContent, { props: { name: 'Ana' } }).body));
        const blocks = [...(scope as unknown as { blockMisses: Map<string, iContentBlock> }).blockMisses.values()];
        return { body: body.replace(/<!--[^]*?-->/g, ''), phrases: scope.misses().map((m) => m.phrase), blocks };
    }

    it('names its values on its own, so it keys as it does standing alone', async () => {
        const { phrases } = await rendered('en-us');
        expect(phrases).toContain('By {name}');
        expect(phrases).not.toContain('By {owner_name}');
        // The block's own one token, beside the nested host, registers as a phrase.
        expect(phrases).toContain('Hi {name}');
        expect(phrases).not.toContain('Hi {user_name}');
    });

    it('renders with its own values, translated or not', async () => {
        expect((await rendered('en-us')).body).toMatch(/Hi Ana<\/p>\s*<p data-ls-phrase[^>]*>By Bo<\/p>/);
        const catalog = { NAMES: { 'By {name}': 'Di {name}', 'Hi {name}': 'Ciao {name}' } } as unknown as iCategories;
        expect((await rendered('it-it', catalog)).body).toMatch(/Ciao Ana<\/p>\s*<p data-ls-phrase[^>]*>Di Bo<\/p>/);
    });
});
