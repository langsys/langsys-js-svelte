import { createRequestScope, type iCategories } from 'langsys-js-typescript';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import VarMove from './VarMove.svelte';
import VarMoveControl from './VarMoveControl.svelte';

const props = { name: 'Ana', items: ['x'], from: 'Header' };

async function inScope(catalog: iCategories = {} as iCategories, locale = 'en-us') {
    const scope = await createRequestScope({ locale, catalog });
    let body = '';
    // `.body` inside run(): Svelte renders when the body is read.
    scope.run(() => (body = render(VarMove, { props }).body));
    const blocks = [...(scope as unknown as { blockMisses: Map<string, Record<string, unknown>> }).blockMisses.values()];
    const phrases = scope.misses() as unknown as Array<Record<string, unknown>>;
    return { body: body.replace(/<!--[^]*?-->/g, ''), blocks, phrases };
}

describe('content moved to another category (MOVE-1)', () => {
    it('sends the previous category with a moved block, and the same custom_id as one that did not move (MOVE-2)', async () => {
        const { blocks } = await inScope();
        const moved = blocks.find((b) => b.category === 'Checkout' && (b.tokens as string[]).includes('Moved block {name}'));
        expect(moved?.previousCategory).toBe('Header');
        // Control: the same content under its own category sends none.
        const plain = blocks.find((b) => b.category === 'Plain');
        expect(plain).toBeDefined();
        expect(plain!.previousCategory).toBeUndefined();
        // MOVE-2: the id is the block's under its current category alone, the same block written
        // with no previous category renders the same one.
        const control = await createRequestScope({ locale: 'en-us', catalog: {} as iCategories });
        control.run(() => void render(VarMoveControl, { props: { name: 'Ana' } }).body);
        const unmoved = [...(control as unknown as { blockMisses: Map<string, Record<string, unknown>> }).blockMisses.values()];
        expect(unmoved).toHaveLength(1);
        expect(unmoved[0].previousCategory).toBeUndefined();
        expect(typeof moved?.custom_id).toBe('string');
        expect(moved?.custom_id).toBe(unmoved[0].custom_id);
    });

    it('sends the previous category with a moved phrase, a nested unit in the block, and a $t call', async () => {
        const { phrases } = await inScope();
        const of = (phrase: string) => phrases.find((p) => p.phrase === phrase);
        expect(of('Moved phrase {name}')).toMatchObject({ category: 'Checkout', previousCategory: 'Header' });
        expect(of('Nested moved {name}')).toMatchObject({ category: 'Checkout', previousCategory: 'Header' });
        expect(of('Moved call {name}')).toMatchObject({ category: 'Checkout', previousCategory: 'Header' });
    });

    it("gives a fallback block's own units its previous category, unless they name a category of their own", async () => {
        const { phrases } = await inScope();
        const of = (phrase: string) => phrases.find((p) => p.phrase === phrase);
        expect(of('Fallback unit {name}')).toMatchObject({ category: 'Cart', previousCategory: 'Header' });
        expect(of('Own unit {name}')?.category).toBe('Own');
        expect(of('Own unit {name}')?.previousCategory).toBeUndefined();
        // One naming the block's own category is in the block's move, as it is in a block that is read.
        expect(of('Same category unit {name}')).toMatchObject({ category: 'Cart', previousCategory: 'Header' });
    });

    it('renders the previous category until the catalog has the new one, and the host says where it came from (MOVE-4, MOVE-5)', async () => {
        const catalog = {
            Header: { 'Moved phrase {name}': 'Frase movida {name}', 'Moved call {name}': 'Llamada movida {name}', 'Nested moved {name}': 'Anidada {name}' },
        } as unknown as iCategories;
        const { body } = await inScope(catalog, 'es-cr');
        expect(body).toMatch(/<span[^>]*data-ls-previous-category="Header"[^>]*>Frase movida Ana<\/span>/);
        expect(body).toContain('<p>Llamada movida Ana</p>');
        // Control: once the new category has it, that renders, and the host carries no previous marker.
        const current = {
            ...catalog,
            Checkout: { 'Moved phrase {name}': 'Frase nueva {name}' },
        } as unknown as iCategories;
        const after = (await inScope(current, 'es-cr')).body;
        expect(after).toMatch(/<span(?![^>]*data-ls-previous)[^>]*>Frase nueva Ana<\/span>/);
    });

    it("fills a moved block from its previous category's id until the catalog has it, and says so on the host (MOVE-4, MOVE-5)", async () => {
        // The block's id under its previous category, as a render there derives it.
        const header = await createRequestScope({ locale: 'en-us', catalog: {} as iCategories });
        header.run(() => void render(VarMoveControl, { props: { name: 'Ana', category: 'Header' } }).body);
        const [old] = [...(header as unknown as { blockMisses: Map<string, Record<string, unknown>> }).blockMisses.values()];
        const oldId = old.custom_id as string;
        const catalog = {
            Header: { [oldId]: { 'Moved block {name}': 'Bloque movido {name}', 'Second paragraph': 'Segundo párrafo' } },
        } as unknown as iCategories;
        const { body } = await inScope(catalog, 'es-cr');
        expect(body).toMatch(new RegExp(`<div[^>]*data-ls-previous-contentblock="${oldId}"[^>]*><p>Bloque movido Ana</p>`));
        // Control: without the move, the same block under its new category renders its source.
        expect(body).toMatch(/<div(?![^>]*data-ls-previous)[^>]*><p>Moved block Ana<\/p>\s*<p>Second paragraph<\/p><\/div>/);
    });
});
