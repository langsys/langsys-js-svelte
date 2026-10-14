import { createRequestScope, registerBlock, type BlockNode, type iCategories } from 'langsys-js-typescript';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import VarDontTranslate from './VarDontTranslate.svelte';

/**
 * VAR-1 for a value inside a `<DontTranslate>`, inside the core's request scope: what the
 * post-response flush sends. A phrase holds its `<DontTranslate>` text as written, so a phrase with
 * a value there is a fallback and registers nothing; a block reads nothing inside one.
 */
async function inScope(run: () => void) {
    const scope = await createRequestScope({ locale: 'en-us', catalog: {} as iCategories });
    scope.run(run);
    return JSON.stringify(scope.misses());
}

describe('a value inside <DontTranslate>', () => {
    it('reaches no phrase: in a <Phrase>, in one nested in a block, or under a <Translate> nested in a <Phrase>', async () => {
        let body = '';
        // `.body` inside run(): Svelte renders when the body is read.
        const sent = await inScope(() => (body = render(VarDontTranslate, { props: { email: 'a@b.c', version: '1.2' } }).body));
        expect(sent).not.toContain('a@b.c');
        // The page still shows the value, verbatim.
        expect(body.replace(/<!--[^]*?-->/g, '')).toMatch(/Signed in as <span translate="no"[^>]*>a@b\.c<\/span> today/);
    });

    it('a block reads nothing inside its <DontTranslate>, a nested <Phrase> included, and registers the rest', async () => {
        const sent = await inScope(() => void render(VarDontTranslate, { props: { email: 'a@b.c', version: '1.2' } }).body);
        expect(sent).toContain('"Hello {email}"');
        expect(sent).not.toMatch(/Version/);
    });

    it('control: a phrase handed to the core with its <DontTranslate> value as text registers the value', async () => {
        const tree: BlockNode[] = [
            {
                tag: 'p',
                attrs: { 'data-ls-phrase': '' },
                children: [
                    { text: 'Signed in as ' },
                    { tag: 'span', attrs: { translate: 'no', 'data-ls-dont-translate': '' }, children: [{ text: 'a@b.c' }] },
                    { text: ' today' },
                ],
            },
        ];
        const sent = await inScope(() => void registerBlock(tree, { category: 'DT' }));
        expect(sent).toContain('"Signed in as {m0o}a@b.c{m0c} today"');
    });
});
