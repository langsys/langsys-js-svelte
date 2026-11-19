import type { RequestEvent } from '@sveltejs/kit';
import { generateCustomId } from 'langsys-js-typescript';
import { render } from 'svelte/server';
import { writable } from 'svelte/store';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LangsysApp } from '$lib/index.js';
import { createLangsysHandle } from '$lib/kit/server.js';
import { startClone, type Case, type Clone, type DataRow } from '../../srv-scope/clone.js';
import VarMoveClone from './VarMoveClone.svelte';

/**
 * MOVE-1, MOVE-3 and MOVE-4 against an SDK test clone (CONF-2), through SvelteKit's handle under a
 * write key and the `server` strategy, so the request scope sends a render's misses after the
 * response. The case (`_dev_/contract/cases.mjs`, suite 8) holds `Buy now`, `Sign in`, `Not moved`
 * and a two-paragraph block under `Header`, and `Plain buy` with no category, each translated into
 * es-es; nothing under `Checkout`, where the page (`VarMoveClone.svelte`) now writes them.
 *
 * What the binding sent is read at the fetch seam; what the API did with it, through the catalog's
 * data form, which tells an item's own translation from a translation-memory match of the same text
 * in another category (`memory_translated`). The API copies a translation onto an item only when it
 * is registered with that previous category; the control, `Not moved` registered under `Checkout`
 * naming none, is served `Header`'s text as a memory match and holds no translation of its own.
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
/** What the data form serves under `category` at es-es. */
const served = async (category: string): Promise<DataRow[]> => (await clone!.data(c.keys.write.key, c.keys.write.project, 'es-es'))[category] ?? [];
const phraseRow = (rows: DataRow[], phrase: string) => rows.find((r) => r.type === 'phrase' && r.phrase === phrase);
const blockRow = (rows: DataRow[], id: string) => rows.find((r) => r.type === 'content_block' && r.custom_id === id);
/** The translation an item holds itself: a memory match from the same text in another category is none. */
const own = (row: DataRow | undefined) =>
    !row || row.memory_translated ? null : typeof row.translation === 'string' && row.translation !== '' ? row.translation : null;
const MOVED = ['Buy now', 'Sign in', 'Plain buy', 'Not moved'];
/** The core shares a fetched catalog across request scopes for this long (`SHARE_MS` in its request scope). */
const SHARE_MS = 60_000;
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
let firstAt = 0;

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
            items.push(...((JSON.parse(init.body) as { translatable_items?: Array<Record<string, unknown>> }).translatable_items ?? []));
        }
        return realFetch(input, init);
    });
    firstAt = Date.now();
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
        expect(await until(async () => items.length >= 5, 15_000), `the scope's registrations reached the seam: ${JSON.stringify(items)}`).toBe(true);
        const of = (phrase: string) => items.filter((i) => i.type === 'phrase' && i.phrase === phrase);
        expect(of('Buy now')).toEqual([expect.objectContaining({ category: 'Checkout', previous_category: 'Header' })]);
        expect(of('Sign in')).toEqual([expect.objectContaining({ category: 'Checkout', previous_category: 'Header' })]);
        expect(of('Plain buy')).toEqual([expect.objectContaining({ category: 'Checkout', previous_category: '' })]);
        expect(of('Not moved')).toHaveLength(1);
        expect(of('Not moved')[0]).not.toHaveProperty('previous_category');
        const blocks = items.filter((i) => i.type === 'content_block');
        expect(blocks).toEqual([expect.objectContaining({ custom_id: CHECKOUT_BLOCK, category: 'Checkout', previous_category: 'Header' })]);
    });

    it("lands each moved item under Checkout holding its previous category's translation as its own, and the control none", async () => {
        let checkout: DataRow[] = [];
        const landed = await until(async () => {
            checkout = await served('Checkout');
            return MOVED.every((p) => phraseRow(checkout, p)) && !!blockRow(checkout, CHECKOUT_BLOCK);
        }, 15_000);
        expect(landed, `Checkout serves every registered item: ${JSON.stringify(checkout)}`).toBe(true);
        expect(own(phraseRow(checkout, 'Buy now'))).toBe('Comprá ya');
        expect(own(phraseRow(checkout, 'Sign in'))).toBe('Ingresá');
        expect(own(phraseRow(checkout, 'Plain buy')), "'' moved it from the entries with no category").toBe('Compra simple');
        const block = blockRow(checkout, CHECKOUT_BLOCK)!;
        expect(Object.fromEntries((block.translations ?? []).map((r) => [r.phrase, own(r)]))).toEqual({
            'Moved block': 'Bloque movido',
            'Second paragraph': 'Segundo párrafo',
        });
        // Control: the same API, given no previous category, copies nothing. It fills the text from
        // translation memory instead, which the data form flags, so `own` is shown telling the two apart.
        expect(phraseRow(checkout, 'Not moved')).toMatchObject({ translation: 'No movido', memory_translated: true });
        expect(own(phraseRow(checkout, 'Not moved'))).toBeNull();
    });
});

describe('MOVE-3: once the catalog holds the moved content, it is neither filled from Header nor registered again', () => {
    it('renders the moved content from Checkout, its hosts unmarked, and sends no registration', async () => {
        // A new request fetches the catalog once the one the first request fetched is no longer shared.
        await sleep(Math.max(0, firstAt + SHARE_MS + 1_000 - Date.now()));
        items = [];
        const again = await request();
        expect(again).toMatch(/<p(?![^>]*data-ls-previous)[^>]*>Comprá ya<\/p>/);
        expect(again).toContain('<p id="call">Ingresá</p>');
        expect(again).toMatch(/<div(?![^>]*data-ls-previous)[^>]*><p>Bloque movido<\/p>\s*<p>Segundo párrafo<\/p><\/div>/);
        expect(again).toMatch(/<p(?![^>]*data-ls-previous)[^>]*>Compra simple<\/p>/);
        await sleep(3000);
        expect(items).toEqual([]);
    }, 90_000);
});
