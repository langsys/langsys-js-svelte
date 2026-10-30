import type { RequestEvent } from '@sveltejs/kit';
import { render } from 'svelte/server';
import { writable } from 'svelte/store';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LangsysApp } from '$lib/index.js';
import { createLangsysHandle } from '$lib/kit/server.js';
import VarCredentials from './VarCredentials.svelte';

/**
 * VAR-1 at the transport seam: two users' requests through SvelteKit's handle render the same
 * transformed blocks, each with its own name, and what the core sends after each response is read
 * at the fetch seam, where the API is answered in-process. Every registration carries the
 * placeholder phrase, and no request carries either name. Its own file: a second `init()` in one
 * process is a no-op.
 */
const BASE = 'http://api.seam.test/api';
const PROJECT = {
    id: 'p1',
    base_locale: 'en-us',
    target_locales: ['it-it'],
    default_locales: { it: 'it-it' },
    key_type: 'write',
    write_enabled: true,
    auto_discovery: false,
    discovery_base_locale_only: false,
    langsys_settings: { translatable_items: { batch_limit: 200 } },
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Every request the core made to the API: its URL and its body. */
const sent: Array<{ url: string; body: string }> = [];
const registrations = () => sent.filter((r) => new URL(r.url).pathname.endsWith('/translatable-items')).map((r) => r.body);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, ms = 5000): Promise<void> {
    for (const end = Date.now() + ms; Date.now() < end && !check(); ) await sleep(20);
}

const handle = createLangsysHandle({ locale: () => 'en-us' });
/** One request through the handle, which sends the scope's misses after the response. */
async function request(name: string): Promise<string> {
    const event = { url: new URL(`http://app.test/?user=${name}`) } as unknown as RequestEvent;
    const resolve = async () => new Response(`<html><head></head><body>${render(VarCredentials, { props: { name } }).body}</body></html>`);
    return (await handle({ event, resolve } as unknown as Parameters<typeof handle>[0])).text();
}

let pages: string[] = [];

beforeAll(async () => {
    for (const m of ['log', 'info', 'warn', 'group', 'groupCollapsed', 'groupEnd'] as const) vi.spyOn(console, m).mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        sent.push({ url: url.href, body: typeof init?.body === 'string' ? init.body : '' });
        const path = url.pathname.slice(new URL(BASE).pathname.length);
        if (/^\/authorize-project\/[^/]+$/.test(path)) return json(200, { status: true, data: PROJECT });
        if (path === '/translations' || path === '/translations/data')
            return json(200, { status: true, write_enabled: true, discovery_base_locale_only: false, data: [] });
        if (path === '/translatable-items') return json(200, { status: true, data: { human_translations_saved: 0, human_translations_skipped: 0 } });
        return json(200, { status: true, data: [] });
    });
    const res = await LangsysApp.init({
        projectid: 'p1',
        key: 'k-write',
        UserLocaleStore: writable('en-us'),
        baseLocale: 'en-us',
        apiUrl: BASE,
        ssrTokenStrategy: 'server',
    });
    expect(res.status, 'premise: the write session initialised').toBe(true);
    pages = [await request('Ana'), await request('Luis')];
    await until(() => registrations().filter((b) => b.includes('welcome back')).length >= 2);
});

afterAll(() => vi.restoreAllMocks());

describe('VAR-1 — what two users’ renders send, at the fetch seam', () => {
    it('premise: each page shows its own name', () => {
        const text = pages.map((html) => html.replace(/<!--[^]*?-->/g, '').replace(/<[^>]+>/g, ''));
        expect(text[0]).toContain('Hello Ana, welcome back');
        expect(text[1]).toContain('Hello Luis, welcome back');
        expect(text[0]).toContain('Signed in as Ana');
        expect(text[1]).toContain('Signed in as Luis');
    });

    it('each request registers the one placeholder phrase, and nothing else for the sentence', () => {
        const bodies = registrations();
        const greets = bodies.filter((b) => b.includes('welcome back'));
        expect(greets).toHaveLength(2);
        for (const body of greets) expect(body).toContain('"Hello {name}, welcome back"');
        const phrases = new Set(bodies.flatMap((b) => [...b.matchAll(/"([^"]*welcome back[^"]*)"/g)].map((m) => m[1])));
        expect([...phrases]).toEqual(['Hello {name}, welcome back']);
        expect(bodies.some((b) => b.includes('"Signed in as {m0o}{name}{m0c}"'))).toBe(true);
    });

    it('no request carries either name', () => {
        expect(sent.length).toBeGreaterThan(2);
        expect(sent.filter((r) => /Ana|Luis/.test(r.url) || /Ana|Luis/.test(r.body))).toEqual([]);
    });
});
