import type { RequestEvent } from '@sveltejs/kit';
import { render } from 'svelte/server';
import { writable } from 'svelte/store';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LangsysApp } from '$lib/index.js';
import { createLangsysHandle } from '$lib/kit/server.js';
import { startClone, type Case, type Clone } from './clone.js';
import Creds from './Creds.svelte';

/**
 * SRV-2, credentials, through SvelteKit's handle: a request whose `credentials` names its own
 * project and key renders and sends under them, never under another request's, however the renders
 * interleave, and a request given none sends under the ones `init()` set. Which key a request went
 * out under is a transport fact, read at the fetch seam; what each project accepted is read back
 * through the catalog of an SDK test clone (CONF-2), whose API refuses a key for another project.
 * Each test is a case of its own (`_dev_/contract/cases.mjs`, suite 4), its projects seeded with
 * `Hello` in German and Italian.
 */
let clone: Clone | undefined;
let base = '';
/** Case 1: projects zero, one and two, each with a write key. Case 2: project two, with a write and a read key. */
let three: Case;
let pair: Case;
let AS: Record<string, { projectid: string; key: string }> = {};

interface Sent {
    method: string;
    project: string | null;
    key: string | null;
}
let sent: Sent[] = [];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
/** The phrases a project's catalog serves, read with its own key: `one`, `two` or `zero` of case 1, or `pair` for case 2's project. */
const phrasesOf = (label: string): Promise<string[]> => {
    const [c, at]: [Case, string] = label === 'pair' ? [pair, 'write'] : [three, label];
    return clone!.phrases(c.keys[at].key, c.keys[at].project, 'de-de');
};
async function until(check: () => Promise<boolean>, ms = 30_000): Promise<void> {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(500)) if (await check()) return;
}

const handle = createLangsysHandle({
    locale: (event) => event.url.searchParams.get('locale') ?? 'en-us',
    credentials: (event) => AS[event.url.searchParams.get('as') ?? ''],
});
/**
 * One request through the handle: its render waits `delay` ms first, so concurrent renders
 * interleave, and the page goes through the handle's own chunk transform, which writes the seed.
 */
async function request(query: string, miss: string, delay: number): Promise<string> {
    const event = { url: new URL(`http://app.test/?${query}`) } as unknown as RequestEvent;
    type Chunk = (input: { html: string; done: boolean }) => string | undefined | Promise<string | undefined>;
    const resolve = async (_event: RequestEvent, opts?: { transformPageChunk?: Chunk }) => {
        await sleep(delay);
        const html = `<html><head></head><body>${render(Creds, { props: { miss } }).body}</body></html>`;
        return new Response((await opts?.transformPageChunk?.({ html, done: true })) ?? html);
    };
    return (await handle({ event, resolve } as unknown as Parameters<typeof handle>[0])).text();
}

beforeAll(async () => {
    clone = await startClone();
    base = clone.base;
    three = clone.caseOf(4, 1);
    pair = clone.caseOf(4, 2);
    const as = (c: Case, label: string) => ({ projectid: c.keys[label].project, key: c.keys[label].key });
    AS = { one: as(three, 'one'), two: as(three, 'two'), 'two-read': as(pair, 'read'), 'two-write': as(pair, 'write') };
    for (const m of ['log', 'info', 'warn', 'group', 'groupCollapsed', 'groupEnd'] as const) vi.spyOn(console, m).mockImplementation(() => {});
    const zero = as(three, 'zero');
    await LangsysApp.init({ ...zero, UserLocaleStore: writable('en-us'), baseLocale: 'en-us', apiUrl: base, ssrTokenStrategy: 'server' });
    const realFetch = globalThis.fetch;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (url.href.startsWith(base)) {
            const body = typeof init?.body === 'string' ? init.body : '';
            const authorize = url.pathname.match(/authorize-project\/([^/]+)$/);
            sent.push({
                method: init?.method ?? 'GET',
                project:
                    url.searchParams.get('project_id') ??
                    (body ? (JSON.parse(body) as { project_id?: string }).project_id : undefined) ??
                    (authorize ? decodeURIComponent(authorize[1]) : null),
                key: new Headers(init?.headers).get('x-authorization'),
            });
        }
        return realFetch(input, init);
    });
});
afterAll(() => {
    vi.restoreAllMocks();
    clone?.stop();
});

describe('SRV-2: a request sends under the credentials its handle gives it', () => {
    it('two concurrent requests, each under its own key and none under the other’s; one given none, under init()’s', async () => {
        sent = [];
        const [one, two, zero] = await Promise.all([
            request('as=one&locale=it-it', 'Missing one', 30),
            request('as=two&locale=de-de', 'Missing two', 10),
            request('locale=it-it', 'Missing zero', 20),
        ]);
        // Each renders its own project's catalog.
        expect(one).toContain('Ciao one');
        expect(two).toContain('Hallo two');
        expect(zero).toContain('Ciao zero');
        // The seed is written into each page, and no key with it.
        const keys = Object.values(three.keys).map((k) => k.key);
        for (const page of [one, two, zero]) {
            expect(page).toContain('<script>window.');
            expect(keys.filter((key) => page.includes(key))).toEqual([]);
        }
        // Each sends its misses after the response, to its own project.
        await until(
            async () =>
                (await phrasesOf('one')).includes('Missing one') &&
                (await phrasesOf('two')).includes('Missing two') &&
                (await phrasesOf('zero')).includes('Missing zero')
        );
        expect(await phrasesOf('one')).toEqual(expect.arrayContaining(['Missing one']));
        expect(await phrasesOf('two')).toEqual(expect.arrayContaining(['Missing two']));
        expect(await phrasesOf('zero')).toEqual(expect.arrayContaining(['Missing zero']));
        for (const project of ['one', 'two', 'zero']) {
            const others = ['one', 'two', 'zero'].filter((p) => p !== project).map((p) => `Missing ${p}`);
            expect((await phrasesOf(project)).filter((p) => others.includes(p))).toEqual([]);
        }
        // At the fetch seam: every request for a project went out under that project's key.
        for (const label of ['one', 'two', 'zero']) {
            const theirs = sent.filter((r) => r.project === three.keys[label].project);
            expect(theirs.some((r) => r.method === 'GET')).toBe(true);
            expect(theirs.some((r) => r.method === 'POST')).toBe(true);
            expect([...new Set(theirs.map((r) => r.key))]).toEqual([three.keys[label].key]);
        }
    });

    it('a read key renders under its own project and sends nothing after the response: the write gate is the scope’s', async () => {
        sent = [];
        const [read] = await Promise.all([
            request('as=two-read&locale=de-de', 'Missing read', 10),
            request('as=two-write&locale=de-de', 'Missing control', 20),
        ]);
        expect(read).toContain('Hallo two');
        // Control: the write key's miss arrives, so the read key's had its chance.
        await until(async () => (await phrasesOf('pair')).includes('Missing control'));
        await sleep(300);
        expect(await phrasesOf('pair')).toEqual(expect.arrayContaining(['Missing control']));
        expect(await phrasesOf('pair')).not.toContain('Missing read');
        // Control at the same seam: it sees what a scope sends, the write key's miss going out as a POST.
        expect(sent.some((r) => r.key === pair.keys.write.key && r.project === pair.keys.write.project && r.method === 'POST')).toBe(true);
        const readKey = pair.keys.read.key;
        expect(sent.filter((r) => r.key === readKey).every((r) => r.project === pair.keys.read.project && r.method === 'GET')).toBe(true);
        expect(sent.some((r) => r.key === readKey)).toBe(true);
    });
});
