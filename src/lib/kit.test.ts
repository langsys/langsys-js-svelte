import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `syncNavigation()` and the `writeEnabled` hydration guard. SvelteKit runs `afterNavigate` with
 * `type: 'enter'` once the first page has mounted, which is after hydration: from then on a
 * one-shot read is the live value, in an app that never renders the store as in one that does.
 */
const { navigation, signal } = vi.hoisted(() => {
    const callbacks: Array<(n: { type: string }) => void> = [];
    let value: boolean | undefined;
    return {
        navigation: { callbacks, afterNavigate: (cb: (n: { type: string }) => void) => void callbacks.push(cb) },
        signal: {
            subscribe(run: (v: boolean | undefined) => void) {
                run(value);
                return () => {};
            },
            set(v: boolean | undefined) {
                value = v;
            },
        },
    };
});

vi.mock('$app/navigation', () => ({ afterNavigate: navigation.afterNavigate }));
vi.mock('langsys-js-typescript', () => ({ writeEnabled: signal, notifyNavigation: vi.fn(), LangsysApp: {} }));

beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    navigation.callbacks.length = 0;
    (globalThis as Record<string, unknown>).window = {};
    signal.set(true);
});
afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).window;
});

describe('syncNavigation ends the writeEnabled hydration pass', () => {
    it('once the first page has mounted, a one-shot read is the live value', async () => {
        const { syncNavigation } = await import('./kit.js');
        const { writeEnabled } = await import('./stores.js');
        syncNavigation();

        expect(get(writeEnabled)).toBeUndefined(); // before the mount: the server's "unknown"
        for (const cb of navigation.callbacks) cb({ type: 'enter' });
        await vi.runAllTimersAsync();
        expect(get(writeEnabled)).toBe(true);
    });

    it('control: without the mount, a one-shot read stays "unknown"', async () => {
        const { syncNavigation } = await import('./kit.js');
        const { writeEnabled } = await import('./stores.js');
        syncNavigation();

        await vi.runAllTimersAsync();
        expect(get(writeEnabled)).toBeUndefined();
    });
});
