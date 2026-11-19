import type { RequestEvent } from '@sveltejs/kit';
import { generateCustomId } from 'langsys-js-typescript';
import { render } from 'svelte/server';
import { writable } from 'svelte/store';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LangsysApp } from '$lib/index.js';
import { createLangsysHandle } from '$lib/kit/server.js';
import { startClone, type Case, type Clone } from '../../srv-scope/clone.js';
import VarMoveClone from './VarMoveClone.svelte';

/**
 * MOVE-1, MOVE-3 and MOVE-4 against an SDK test clone (CONF-2), through SvelteKit's handle under a
 * write key and the `server` strategy, so the request scope sends a render's misses after the
 * response. The case (`_dev_/contract/cases.mjs`, suite 8) holds `Buy now`, `Sign in`, `Not moved`
 * and a two-paragraph block under `Header`, and `Plain buy` with no category, each translated into
 * es-es; nothing under `Checkout`, where the page (`VarMoveClone.svelte`) now writes them. Machine
 * translation is off for the project, so a translation the API holds under `Checkout` afterwards can
 * only be the one the move copied.
 *
 * What the binding sent is read at the fetch seam; what the API did with it, through its catalog.
 */
let clone: Clone | undefined;
let c: Case;
/** Every registration item the core sent, in order. */
let items: Array<Record<string, unknown>> = [];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => Promise<boolean>, ms = 30_000): Promise<boolean> {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(500)) if (await check()) return true;
    return check();
}
const strip = (html: string) => html.replace(/<!--[^]*?-->/g, '');
const catalog = () => clone!.catalog(c.keys.write.key, c.keys.write.project, 'es-es');
const HEADER_BLOCK = generateCustomId('Header', ['Moved block', 'Second paragraph']);
const CHECKOUT_BLOCK = generateCustomId('Checkout', ['Moved block', 'Second paragraph']);

const handle = createLangsysHandle({ locale: () => 'es-es' });
/** One request through the handle, which sends the scope's misses after the response. */
async function request(): Promise<string> {
    const event = { url: new URL('http://app.test/checkout') } as unknown as RequestEvent;
    const resolve = async () => new Response(`<html><head></head><body>${render(VarMoveClone).body}</body></html>`);
    return strip(await (await handle({ event, resolve } as unknown as Parameters<typeof handle>[0])).text());
}

let first = '';

beforeAll(async () => {
    clone = await startClone();
    c = clone.caseOf(8, 1);
    for (const m of ['log', 'info', 'warn', 'group', 'groupCollapsed', 'groupEnd'] as const) vi.spyOn(console, m).mockImplementation(() => {});
    const res = await LangsysApp.init({
        projectid: c.keys.write.project,
        key: c.keys.write.key,
        UserLocaleStore: writable('es-es'),
        baseLocale: 'en-us',
        apiUrl: clone.base,
        ssrTokenStrategy: 'server',
    });
    expect(res.status, 'premise: the write session initialised').toBe(true);
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (url.href.startsWith(clone!.base) && url.pathname.endsWith('/translatable-items') && typeof init?.body === 'string') {
            items.push(...((JSON.parse(init.body) as { items?: Array<Record<string, unknown>> }).items ?? []));
        }
        return realFetch(input, init);
    });
    first = await request();
}, 60_000);

afterAll(() => {
    vi.restoreAllMocks();
    clone?.stop();
});

describe('MOVE-4: until the API holds the content under its new category, the previous one renders', () => {
    it("renders the moved <Phrase>, $t() call and <Translate> from Header's translations, and the host says so (MOVE-5)", () => {
        expect(first).toMatch(/<p[^>]*data-ls-previous-category="Header"[^>]*>Comprá ya<\/p>/);
        expect(first).toContain('<p id="call">Ingresá</p>');
        expect(first).toMatch(new RegExp(`<div[^>]*data-ls-previous-contentblock="${HEADER_BLOCK}"[^>]*><p>Bloque movido</p>\\s*<p>Segundo párrafo</p></div>`));
        // A previous category of '' reads the content with no category.
        expect(first).toMatch(/<p[^>]*data-ls-previous-category=""[^>]*>Compra simple<\/p>/);
    });

    it('control: content Header holds, written under Checkout with no move, renders its source', () => {
        expect(first).toMatch(/<p(?![^>]*data-ls-previous)[^>]*>Not moved<\/p>/);
    });
});

describe('MOVE-1: the previous category travels as previous_category, and the API keeps the translations', () => {
    it('sends previous_category on each moved item, "" for no category, and no key on the control', async () => {
        await until(async () => items.length >= 5, 15_000);
        const of = (phrase: string) => items.filter((i) => i.type === 'phrase' && i.phrase === phrase);
        expect(of('Buy now')).toEqual([expect.objectContaining({ category: 'Checkout', previous_category: 'Header' })]);
        expect(of('Sign in')).toEqual([expect.objectContaining({ category: 'Checkout', previous_category: 'Header' })]);
        expect(of('Plain buy')).toEqual([expect.objectContaining({ category: 'Checkout', previous_category: '' })]);
        expect(of('Not moved')).toHaveLength(1);
        expect(of('Not moved')[0]).not.toHaveProperty('previous_category');
        const blocks = items.filter((i) => i.type === 'content_block');
        expect(blocks).toEqual([expect.objectContaining({ custom_id: CHECKOUT_BLOCK, category: 'Checkout', previous_category: 'Header' })]);
    });

    it("lands each moved item under Checkout with its previous category's translation, and the control with none", async () => {
        const landed = await until(async () => {
            const cats = await catalog();
            return cats.Checkout?.['Buy now'] === 'Comprá ya' && typeof cats.Checkout?.[CHECKOUT_BLOCK] === 'object';
        });
        expect(landed, 'the moved items reached the catalog under Checkout').toBe(true);
        const checkout = (await catalog()).Checkout ?? {};
        expect(checkout['Buy now']).toBe('Comprá ya');
        expect(checkout['Sign in']).toBe('Ingresá');
        expect(checkout['Plain buy']).toBe('Compra simple');
        expect(checkout[CHECKOUT_BLOCK]).toMatchObject({ 'Moved block': 'Bloque movido', 'Second paragraph': 'Segundo párrafo' });
        // Control: registered under Checkout with no move, so the API had nothing to copy.
        expect(Object.prototype.hasOwnProperty.call(checkout, 'Not moved')).toBe(true);
        expect(checkout['Not moved'] || null).toBeNull();
    });
});

describe('MOVE-3: once the catalog holds the moved content, it is neither filled from Header nor registered again', () => {
    it('renders the moved content from Checkout, its hosts unmarked, and sends no registration', async () => {
        items = [];
        const again = await request();
        expect(again).toMatch(/<p(?![^>]*data-ls-previous)[^>]*>Comprá ya<\/p>/);
        expect(again).toContain('<p id="call">Ingresá</p>');
        expect(again).toMatch(/<div(?![^>]*data-ls-previous)[^>]*><p>Bloque movido<\/p>\s*<p>Segundo párrafo<\/p><\/div>/);
        expect(again).toMatch(/<p(?![^>]*data-ls-previous)[^>]*>Compra simple<\/p>/);
        await sleep(3000);
        expect(items).toEqual([]);
    });
});
