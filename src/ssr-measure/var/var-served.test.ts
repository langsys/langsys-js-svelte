import { generateCustomId, sTranslations, type iCategories } from 'langsys-js-typescript';
import { render } from 'svelte/server';
import { afterEach, describe, expect, it } from 'vitest';
import VarServed from './VarServed.svelte';

/**
 * VAR-6 and SRV-1 on the tree path — what a server render of a transformed block sends.
 * Served bytes, never a post-hydration DOM: a crawler reads the bytes.
 */

const GREET = 'Hello {name}, welcome back';
// `props.count` ends in `count`: the previous segment plus `_count` (VAR-2).
const CART = 'You have {props_count} items';

function catalog(): iCategories {
    const block = (tokens: string[], translated: Record<string, string>) => ({ [generateCustomId('VAR', tokens)]: translated });
    return {
        VAR: {
            __category__: 'VAR',
            [GREET]: 'Ciao {name}, bentornato',
            ...block([GREET], { [GREET]: 'Ciao {name}, bentornato' }),
            [CART]: '{props_count, plural, one {Hai # articolo} other {Hai # articoli}}',
            ...block([CART], { [CART]: '{props_count, plural, one {Hai # articolo} other {Hai # articoli}}' }),
            'Welcome, VIP': 'Benvenuto, VIP',
            Welcome: 'Benvenuto',
        },
    } as unknown as iCategories;
}

const serve = (over: Partial<{ catalog: iCategories; locale: string; name: string; count: number; vip: boolean }> = {}) =>
    render(VarServed, { props: { catalog: catalog(), locale: 'it-it', name: 'Ana', count: 1, vip: false, ...over } }).body;

/** The text of the element with `id`, comments and tags removed. */
function text(body: string, id: string): string {
    const m = body.match(new RegExp(`id="${id}"[^>]*>([^]*?)</(p|ul)>`));
    if (!m) throw new Error(`no #${id} in served bytes:\n${body}`);
    return m[1].replace(/<!--[^]*?-->/g, '').replace(/<[^>]+>/g, '');
}

afterEach(() => sTranslations.set({} as iCategories));

describe('VAR-6 / SRV-1 — a transformed block is served translated', () => {
    it('control: with an empty catalog, the source is served, with the value in place', () => {
        expect(text(serve({ catalog: {} as iCategories }), 'greet')).toBe('Hello Ana, welcome back');
    });

    it('serves the translation, with the value interpolated, for any user', () => {
        expect(text(serve(), 'greet')).toBe('Ciao Ana, bentornato');
        expect(text(serve({ name: 'Luis' }), 'greet')).toBe('Ciao Luis, bentornato');
    });

    it('MARK-1: the served host carries the id of the placeholder phrase, and the resolved marker', () => {
        const body = serve().replace(/<!--[^]*?-->/g, '');
        const host = body.slice(0, body.indexOf('<p id="greet">')).match(/<div[^>]*>\s*$/)?.[0] ?? '';
        expect(host).toContain(`data-ls-contentblock="${generateCustomId('VAR', [GREET])}"`);
        expect(host).toContain(`data-ls-resolved="it-it"`);
    });

    it('the plural the catalog holds, for a typed count', () => {
        expect(text(serve({ count: 1 }), 'cart')).toBe('Hai 1 articolo');
        expect(text(serve({ count: 5 }), 'cart')).toBe('Hai 5 articoli');
    });

    it('an {#if} branch is served as the branch that renders', () => {
        expect(text(serve({ vip: true }), 'branch')).toBe('Benvenuto, VIP');
        expect(text(serve({ vip: false }), 'branch')).toBe('Benvenuto');
    });

    it('a <DontTranslate> inside a block shows its value as it is', () => {
        expect(text(serve(), 'sku')).toContain('Ana');
    });

    it('a fallback block (an {#each}) is served as source', () => {
        expect(text(serve(), 'each')).toBe('Item 1Item 2');
    });
});
