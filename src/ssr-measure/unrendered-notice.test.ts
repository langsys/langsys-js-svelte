import { render } from 'svelte/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ServedBytes from './ServedBytes.svelte';
import type { iCategories } from 'langsys-js-typescript';

/**
 * SRV-1's fallback notice. Every `<Translate>` and `<Phrase>` rendered on the server is served as
 * source, and the core says why once per process per reason — `string-path-deferred`. Counted on
 * the logger's output. The control runs first, because the core remembers a reason it has reported.
 */
const props = { catalog: {} as iCategories, locale: 'it-it' };
const notices = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.filter((c: unknown[]) => c.join(' ').includes('string-path-deferred')).length;

/** `render()` renders only when its output is read, so every call reads `body`. */
const serve = () => render(ServedBytes, { props }).body;

afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as Record<string, unknown>).window;
});

describe('the server fallback is reported once, and only on the server', () => {
    it('control: with a window present — the client path — rendering emits no notice', () => {
        (globalThis as Record<string, unknown>).window = globalThis;
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        serve();
        expect(notices(warn)).toBe(0);
    });

    it('50 server renders of <Translate> and <Phrase> emit the notice exactly once, naming the reason', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        for (let i = 0; i < 50; i++) serve();
        expect(notices(warn)).toBe(1);
    });
});
