import { createRequestScope, type iCategories } from 'langsys-js-typescript';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import VarPlaintext from './VarPlaintext.svelte';

/**
 * TOK-1's `<plaintext>`, through `<Translate>` and `<Phrase>` with the transform, inside the core's
 * request scope: what the post-response flush would send, and what the page serves. The element is
 * the core's (`NON_TRANSLATABLE_ELEMENTS`); the transform hands it over as an ordinary element.
 */
async function inScope(catalog: iCategories = {} as iCategories, locale = 'en-us') {
    const scope = await createRequestScope({ locale, catalog });
    let body = '';
    // `.body` inside run(): Svelte renders when the body is read.
    scope.run(() => (body = render(VarPlaintext, { props: { name: 'Ana' } }).body));
    const blocks = (scope as unknown as { blockMisses: Map<string, unknown> }).blockMisses;
    return { sent: [...scope.misses(), ...blocks.values()] as Array<Record<string, unknown>>, body: body.replace(/<!--[^]*?-->/g, '') };
}

describe('TOK-1: the text inside a <plaintext> is never translated', () => {
    it('registers the sentence written in ordinary markup and nothing from inside the <plaintext>', async () => {
        const { sent } = await inScope();
        const pt = sent.filter((s) => s.category === 'PT');
        // A block whose one token is the ordinary sentence registers as that phrase, once.
        expect(pt.filter((s) => s.phrase === 'Read the terms')).toHaveLength(1);
        expect(pt.filter((s) => s.phrase === 'Hello {name}')).toHaveLength(1);
        expect(
            pt.find((s) => s.phrase === 'Read the terms {m0o}{m0c}'),
            'the <Phrase> keys it as one empty pair'
        ).toBeTruthy();
        // Control: an ordinary element's text is a token, so that block registers both sentences.
        expect(pt.find((s) => JSON.stringify(s.tokens) === JSON.stringify(['Read the rules', 'Read the rules too']))).toBeTruthy();
        const tokensOf = (s: Record<string, unknown>) => (s.tokens as string[] | undefined) ?? [s.phrase as string];
        expect(
            pt
                .filter((s) => !JSON.stringify(s).includes('Read the rules'))
                .flatMap(tokensOf)
                .sort()
        ).toEqual(['Hello {name}', 'Read the terms', 'Read the terms {m0o}{m0c}']);
    });

    it('renders the ordinary sentence translated and the text inside the <plaintext> as written', async () => {
        const catalog = {
            PT: {
                'Read the terms': 'Leggi i termini',
                'Hello {name}': 'Ciao {name}',
                'Read the terms {m0o}{m0c}': 'Leggi i termini {m0o}{m0c}',
            },
        } as unknown as iCategories;
        const { body } = await inScope(catalog, 'it-it');
        // The fixture's elements sit on lines of their own, so whitespace separates them.
        expect(body).toMatch(/<div data-ls-contentblock[^>]*><p>Leggi i termini<\/p>\s*<plaintext>Read the terms<\/plaintext><\/div>/);
        expect(body).toMatch(/<div data-ls-contentblock[^>]*><p>Ciao Ana<\/p>\s*<plaintext>Hello Ana<\/plaintext><\/div>/);
        expect(body).toMatch(/<p data-ls-phrase[^>]*>Leggi i termini <plaintext>Read the terms<\/plaintext><\/p>/);
    });
});
