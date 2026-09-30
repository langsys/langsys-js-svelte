import { render } from 'svelte/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ServedBytes from './ServedBytes.svelte';
import { logger, type iCategories } from 'langsys-js-typescript';

/**
 * SRV-1's fallback notice. Every `<Translate>` and `<Phrase>` rendered on the server is served as
 * source, and the core says why once per process per reason — `string-path-deferred`. Counted on
 * the logger's output, with debug on: the notice is debug-level. The control runs first, because
 * the core remembers a reason it has reported.
 */
const props = { catalog: {} as iCategories, locale: 'it-it' };
type Spy = { mock: { calls: unknown[][] } };
const notices = (...spies: Spy[]) => spies.flatMap((s) => s.mock.calls).filter((c: unknown[]) => c.join(' ').includes('string-path-deferred')).length;
const spyOutput = () => [vi.spyOn(console, 'warn').mockImplementation(() => {}), vi.spyOn(console, 'log').mockImplementation(() => {})];

/** `render()` renders only when its output is read, so every call reads `body`. */
const serve = () => render(ServedBytes, { props }).body;

beforeEach(() => {
    logger.debugEnabled = true;
});

afterEach(() => {
    logger.debugEnabled = false;
    vi.restoreAllMocks();
    delete (globalThis as Record<string, unknown>).window;
});

describe('the server fallback is reported once, and only on the server', () => {
    it('control: with a window present — the client path — rendering emits no notice', () => {
        (globalThis as Record<string, unknown>).window = globalThis;
        const spies = spyOutput();
        serve();
        expect(notices(...spies)).toBe(0);
    });

    it('50 server renders of <Translate> and <Phrase> emit the notice exactly once, naming the reason', () => {
        const spies = spyOutput();
        for (let i = 0; i < 50; i++) serve();
        expect(notices(...spies)).toBe(1);
    });
});
