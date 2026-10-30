import { createRequestScope, registerBlock, type iCategories } from 'langsys-js-typescript';
import { writable } from 'svelte/store';
import { render } from 'svelte/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LangsysApp } from '$lib/index.js';
import VarServed from './VarServed.svelte';

/**
 * Where a server render registers. Inside the core's request scope a block's registration is
 * recorded on the scope, which sends it after the response (SRV-3). Outside one — README-SSR's
 * component-body seed, or a route `createLangsysHandle` does not match — there is nothing to send
 * it, and the block registers from the client after hydration instead. So a server render calls
 * `registerBlock` only inside a scope.
 *
 * Counted on what the core says: a `registerBlock` on a server outside a scope registers nothing
 * and, with debug on, reports the call as misplaced. The notice is held until `init()` says
 * whether debug is on, and said once per process, so the binding's renders run first and the
 * control, a direct call, after them.
 */
const props = { catalog: {} as iCategories, locale: 'en-us', name: 'Ana', count: 2, vip: false };
const MISPLACED = 'registerBlock() was called on a server outside a request scope';
const spyOutput = () => [vi.spyOn(console, 'warn').mockImplementation(() => {}), vi.spyOn(console, 'log').mockImplementation(() => {})];
const notices = (spies: Array<{ mock: { calls: unknown[][] } }>) => spies.flatMap((s) => s.mock.calls).filter((c) => c.join(' ').includes(MISPLACED)).length;

/** The API is unreachable on purpose; init never throws (WIRE-4). */
const initWithDebug = () =>
    void LangsysApp.init({ projectid: 'p', key: 'k', UserLocaleStore: writable('en-us'), debug: true, apiUrl: 'http://127.0.0.1:9/api' });

afterEach(() => {
    vi.restoreAllMocks();
});

describe('server renders register only inside a request scope', () => {
    it('50 renders outside a scope make no registration the core reports as misplaced', () => {
        const spies = spyOutput();
        for (let i = 0; i < 50; i++) void render(VarServed, { props }).body;
        initWithDebug(); // debug on, so a held notice is said now
        expect(notices(spies)).toBe(0);
    });

    it('control: a registerBlock call outside a scope is reported', async () => {
        const spies = spyOutput();
        await registerBlock([{ text: 'Hello' }], { category: 'VAR' });
        expect(notices(spies)).toBe(1);
    });

    it('control: inside a scope the same render registers, on the scope', async () => {
        const scope = await createRequestScope({ locale: 'en-us', catalog: {} as iCategories });
        scope.run(() => render(VarServed, { props }).body);
        const misses = scope as unknown as { phraseMisses: Map<string, unknown>; blockMisses: Map<string, unknown> };
        expect(misses.phraseMisses.size + misses.blockMisses.size).toBeGreaterThan(0);
        await scope.close();
    });
});
