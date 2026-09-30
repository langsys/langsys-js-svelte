import { render } from 'svelte/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ServedBytes from './ServedBytes.svelte';
import { writable } from 'svelte/store';
import type { iCategories } from 'langsys-js-typescript';
import { LangsysApp } from '$lib/index.js';

/**
 * SRV-1's fallback notice. Every `<Translate>` and `<Phrase>` rendered on the server is served as
 * source, and the core says why once per process per reason — `variable`: without the transform they register nothing. Counted on
 * the logger's output. The notice is debug-level, and one raised before `init()` is held until init
 * says whether debug is on — as in an app, where a server render can precede init. The control runs
 * first, because the core remembers a reason it has reported.
 */
const props = { catalog: {} as iCategories, locale: 'it-it' };
type Spy = { mock: { calls: unknown[][] } };
/** The core's server notice for the reason these blocks give, `variable`: without the transform they register nothing. */
const notices = (...spies: Spy[]) =>
    spies.flatMap((s) => s.mock.calls).filter((c: unknown[]) => c.join(' ').includes('registers nothing, on the server or the client')).length;
const spyOutput = () => [vi.spyOn(console, 'warn').mockImplementation(() => {}), vi.spyOn(console, 'log').mockImplementation(() => {})];

/** `render()` renders only when its output is read, so every call reads `body`. */
const serve = () => render(ServedBytes, { props }).body;

/** Settles the held notices with debug on. The API is unreachable on purpose; init never throws (WIRE-4). */
const initWithDebug = () =>
    void LangsysApp.init({ projectid: 'p', key: 'k', UserLocaleStore: writable('en-us'), debug: true, apiUrl: 'http://127.0.0.1:9/api' });

afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as Record<string, unknown>).window;
});

describe('the server fallback is reported once, and only on the server', () => {
    it('control: with a window present — the client path — rendering emits no notice', () => {
        (globalThis as Record<string, unknown>).window = globalThis;
        const spies = spyOutput();
        serve();
        initWithDebug(); // debug on, so a held notice would be said now
        expect(notices(...spies)).toBe(0);
    });

    it('50 server renders of <Translate> and <Phrase> emit the notice exactly once, naming the reason', () => {
        const spies = spyOutput();
        for (let i = 0; i < 50; i++) serve();
        expect(notices(...spies)).toBe(1);
    });
});
