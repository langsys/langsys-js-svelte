import type { RequestEvent } from '@sveltejs/kit';
import { render } from 'svelte/server';
import { writable } from 'svelte/store';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LangsysApp } from '$lib/index.js';
import { createLangsysHandle } from '$lib/kit/server.js';
import Creds from './Creds.svelte';

/**
 * SRV-2, credentials, through SvelteKit's handle: a request whose `credentials` names its own
 * project and key renders and sends under them, never under another request's, however the renders
 * interleave, and a request given none sends under the ones `init()` set. Which key a request went
 * out under is a transport fact, read at the fetch seam; what each project accepted is read from
 * the contract double, which refuses a key for another project.
 */
/** The contract double's process. This repo carries no Node types, so its shape is stated here. */
interface Child {
    stdout: { on(event: 'data', listener: (chunk: Uint8Array) => void): void };
    kill(): void;
}
let double: Child | undefined;
let base = '';
let fixture = '';

const PROJECT = (id: string) => ({
    id,
    base_locale: 'en',
    target_locales: ['de', 'it'],
    website_url: `https://${id}.local`,
    phrases: [{ category: 'UI', phrase: 'Hello', translations: { de: `Hallo ${id}`, it: `Ciao ${id}` } }],
});
const SEED = {
    projects: [PROJECT('zero'), PROJECT('one'), PROJECT('two')],
    keys: [
        { key: 'key-zero', project: 'zero', type: 'write' },
        { key: 'key-one', project: 'one', type: 'write' },
        { key: 'key-two', project: 'two', type: 'write' },
        { key: 'key-two-read', project: 'two', type: 'read' },
    ],
};
const AS: Record<string, { projectid: string; key: string }> = {
    one: { projectid: 'one', key: 'key-one' },
    two: { projectid: 'two', key: 'key-two' },
    'two-read': { projectid: 'two', key: 'key-two-read' },
};

interface Sent {
    method: string;
    project: string | null;
    key: string | null;
}
let sent: Sent[] = [];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const phrasesOf = async (project: string): Promise<string[]> =>
    ((await (await fetch(`${fixture}/state`)).json()) as { projects: Record<string, { phrases: Array<{ phrase: string }> }> }).projects[project].phrases.map(
        (p) => p.phrase
    );
async function until(check: () => Promise<boolean>, ms = 5000): Promise<void> {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) if (await check()) return;
}

const handle = createLangsysHandle({
    locale: (event) => event.url.searchParams.get('locale') ?? 'en',
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
    // Loaded at run time, as kit/server.ts loads node:async_hooks.
    const id = 'node:child_process';
    const { spawn } = (await import(/* @vite-ignore */ id)) as { spawn: (command: string, args: string[]) => Child };
    const { execPath } = (globalThis as unknown as { process: { execPath: string } }).process;
    const child = spawn(execPath, ['contract-fixture/server.mjs']);
    double = child;
    const line = await new Promise<string>((resolve) => {
        let out = '';
        child.stdout.on('data', (chunk) => {
            out += new TextDecoder().decode(chunk);
            if (out.includes('\n')) resolve(out.slice(0, out.indexOf('\n')));
        });
    });
    ({ base_url: base, fixture_url: fixture } = JSON.parse(line) as { base_url: string; fixture_url: string });
    await fetch(`${fixture}/seed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(SEED) });
    for (const m of ['log', 'info', 'warn', 'group', 'groupCollapsed', 'groupEnd'] as const) vi.spyOn(console, m).mockImplementation(() => {});
    await LangsysApp.init({ projectid: 'zero', key: 'key-zero', UserLocaleStore: writable('en'), baseLocale: 'en', apiUrl: base, ssrTokenStrategy: 'server' });
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
    double?.kill();
});

describe('SRV-2: a request sends under the credentials its handle gives it', () => {
    it('two concurrent requests, each under its own key and none under the other’s; one given none, under init()’s', async () => {
        sent = [];
        const [one, two, zero] = await Promise.all([
            request('as=one&locale=it', 'Missing one', 30),
            request('as=two&locale=de', 'Missing two', 10),
            request('locale=it', 'Missing zero', 20),
        ]);
        // Each renders its own project's catalog.
        expect(one).toContain('Ciao one');
        expect(two).toContain('Hallo two');
        expect(zero).toContain('Ciao zero');
        // The seed is written into each page, and no key with it.
        for (const page of [one, two, zero]) {
            expect(page).toContain('<script>window.');
            expect(page).not.toMatch(/key-(one|two|zero)/);
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
        for (const [project, key] of [
            ['one', 'key-one'],
            ['two', 'key-two'],
            ['zero', 'key-zero'],
        ]) {
            const theirs = sent.filter((r) => r.project === project);
            expect(theirs.some((r) => r.method === 'GET')).toBe(true);
            expect(theirs.some((r) => r.method === 'POST')).toBe(true);
            expect([...new Set(theirs.map((r) => r.key))]).toEqual([key]);
        }
    });

    it('a read key renders under its own project and sends nothing after the response: the write gate is the scope’s', async () => {
        sent = [];
        const [read] = await Promise.all([request('as=two-read&locale=de', 'Missing read', 10), request('as=two&locale=de', 'Missing control', 20)]);
        expect(read).toContain('Hallo two');
        // Control: the write key's miss arrives, so the read key's had its chance.
        await until(async () => (await phrasesOf('two')).includes('Missing control'));
        await sleep(300);
        expect(await phrasesOf('two')).toEqual(expect.arrayContaining(['Missing control']));
        expect(await phrasesOf('two')).not.toContain('Missing read');
        expect(sent.filter((r) => r.key === 'key-two-read').every((r) => r.project === 'two' && r.method === 'GET')).toBe(true);
        expect(sent.some((r) => r.key === 'key-two-read')).toBe(true);
    });
});
