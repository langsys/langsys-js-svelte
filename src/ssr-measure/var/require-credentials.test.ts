import { render } from 'svelte/server';
import { createRequestScope, registerBlock, type iCategories } from 'langsys-js-typescript';
import { writable } from 'svelte/store';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LangsysApp, LangsysConfigurationError } from '$lib/index.js';
import VarCredentials from './VarCredentials.svelte';

/**
 * WIRE-4 under `requireCredentials`, on the server: `init()` without a key leaves the client
 * unconfigured. The core never rejects a server registration, inside a request scope or outside
 * one, so no block surfaces anything during SSR and the served bytes carry the text as written.
 * In the browser the page's blocks surface the error, left unhandled (`_dev_/e2e/credentials.mjs`).
 * Its own file: a second `init()` in one process is a no-op.
 *
 * The runner's own unhandled-rejection listeners are set aside for the render and restored after,
 * so a rejection would be collected here rather than failing the run.
 */

// Node's process, typed here: the project carries no Node type definitions.
type Listener = (reason: unknown) => void;
const proc = (
    globalThis as unknown as {
        process: {
            listeners(e: string): Listener[];
            removeAllListeners(e: string): void;
            on(e: string, l: Listener): void;
            removeListener(e: string, l: Listener): void;
        };
    }
).process;

const rejections: unknown[] = [];
const collect: Listener = (reason) => void rejections.push(reason);
let runnerListeners: Listener[] = [];
let body = '';
let scoped = '';

beforeAll(async () => {
    runnerListeners = proc.listeners('unhandledRejection');
    proc.removeAllListeners('unhandledRejection');
    proc.on('unhandledRejection', collect);

    const res = await LangsysApp.init({ projectid: 'p1', key: '', UserLocaleStore: writable('it-it'), requireCredentials: true });
    expect(res.status, 'control: the client is unconfigured').toBe(false);
    expect(LangsysApp.isConfigured()).toBe(false);

    body = render(VarCredentials, { props: { name: 'Ana' } }).body;
    const scope = await createRequestScope({ locale: 'it-it', catalog: {} as iCategories });
    scoped = scope.run(() => render(VarCredentials, { props: { name: 'Ana' } }).body);
    await scope.close();
    // Let the rejected promises reach the process's unhandled-rejection hook.
    await new Promise((resolve) => setTimeout(resolve, 50));
});

afterAll(() => {
    proc.removeListener('unhandledRejection', collect);
    for (const listener of runnerListeners) proc.on('unhandledRejection', listener);
});

describe('requireCredentials with no credentials — a server render', () => {
    it('surfaces nothing from its blocks, outside a request scope or in one', () => {
        expect(rejections).toEqual([]);
    });

    it('the served bytes carry the text as written, both ways', () => {
        for (const html of [body, scoped]) {
            const text = html.replace(/<!--[^]*?-->/g, '').replace(/<[^>]+>/g, '');
            expect(text).toContain('Hello Ana, welcome back');
            expect(text).toContain('A static sentence');
            expect(text).toContain('Signed in as Ana');
        }
    });

    it('the core resolves a server registration made outside a scope, and never rejects it', async () => {
        const before = rejections.length;
        await expect(registerBlock([{ tag: 'p', attrs: {}, children: [{ text: 'Direct' }] }], { category: 'CRED' })).resolves.toBeUndefined();
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(rejections.length).toBe(before);
    });

    it('control: an unhandled rejection raised here is collected', async () => {
        const before = rejections.length;
        void Promise.reject(new LangsysConfigurationError('probe'));
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(rejections.length - before).toBe(1);
        rejections.splice(before);
    });
});
