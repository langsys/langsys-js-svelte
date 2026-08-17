import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Controllable stand-in for the base SDK's `writeEnabled` signal, so these tests
 * exercise the deferral logic rather than the SDK.
 */
const { signal } = vi.hoisted(() => {
    let value: boolean | undefined;
    const subs = new Set<(v: boolean | undefined) => void>();
    return {
        signal: {
            subscribe(run: (v: boolean | undefined) => void) {
                subs.add(run);
                run(value);
                return () => subs.delete(run);
            },
            set(v: boolean | undefined) {
                value = v;
                subs.forEach((r) => r(v));
            },
            get: () => value,
            subscriberCount: () => subs.size,
            reset(v: boolean | undefined) {
                subs.clear();
                value = v;
            },
        },
    };
});

vi.mock('langsys-js-typescript', () => ({ writeEnabled: signal }));

/**
 * `stores.ts` reads `typeof window` and latches `pastHydration` at module scope,
 * so every case needs a fresh module instance with the environment already set.
 */
async function loadStore({ browser }: { browser: boolean }) {
    vi.resetModules();
    if (browser) (globalThis as Record<string, unknown>).window = {};
    else delete (globalThis as Record<string, unknown>).window;
    return (await import('./stores.js')).writeEnabled;
}

beforeEach(() => {
    vi.useFakeTimers();
    signal.reset(undefined);
});

afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).window;
});

describe('writeEnabled — SSR', () => {
    it('reports undefined and never subscribes to the process-wide signal', async () => {
        signal.set(true); // as if some other request had resolved
        const writeEnabled = await loadStore({ browser: false });

        const seen: (boolean | undefined)[] = [];
        const stop = writeEnabled.subscribe((v) => seen.push(v));

        expect(seen).toEqual([undefined]);
        expect(signal.subscriberCount()).toBe(0);
        expect(() => stop()).not.toThrow();
    });
});

describe('writeEnabled — hydration pass', () => {
    it('publishes undefined even when the signal is already concrete', async () => {
        // The hazard: an awaited universal `load` resolves authorization BEFORE the
        // first client render, so the raw signal is true while the server rendered
        // from undefined. Reading through here is the mismatch.
        signal.set(true);
        const writeEnabled = await loadStore({ browser: true });

        const seen: (boolean | undefined)[] = [];
        writeEnabled.subscribe((v) => seen.push(v));

        expect(seen).toEqual([undefined]);
    });

    it('adopts the real value on the first macrotask after hydration', async () => {
        signal.set(true);
        const writeEnabled = await loadStore({ browser: true });

        const seen: (boolean | undefined)[] = [];
        writeEnabled.subscribe((v) => seen.push(v));
        expect(seen).toEqual([undefined]);

        await vi.runAllTimersAsync();
        expect(seen).toEqual([undefined, true]);
    });

    it('never substitutes false for "not known yet"', async () => {
        const writeEnabled = await loadStore({ browser: true });

        const seen: (boolean | undefined)[] = [];
        writeEnabled.subscribe((v) => seen.push(v));
        await vi.runAllTimersAsync();

        expect(seen).not.toContain(false);
        expect(seen.every((v) => v === undefined)).toBe(true);
    });

    it('keeps tracking the signal after handover', async () => {
        const writeEnabled = await loadStore({ browser: true });
        const seen: (boolean | undefined)[] = [];
        writeEnabled.subscribe((v) => seen.push(v));

        await vi.runAllTimersAsync();
        signal.set(true);
        signal.set(false);

        expect(seen).toEqual([undefined, undefined, true, false]);
    });
});

describe('writeEnabled — after hydration', () => {
    it('later subscribers read through immediately, with no undefined flash', async () => {
        signal.set(true);
        const writeEnabled = await loadStore({ browser: true });

        // First subscription completes the handover, latching pastHydration.
        writeEnabled.subscribe(() => {});
        await vi.runAllTimersAsync();

        const seen: (boolean | undefined)[] = [];
        writeEnabled.subscribe((v) => seen.push(v));

        expect(seen).toEqual([true]);
    });
});

describe('writeEnabled — teardown', () => {
    it('unsubscribing before handover cancels it and leaks no subscription', async () => {
        const writeEnabled = await loadStore({ browser: true });

        const seen: (boolean | undefined)[] = [];
        const stop = writeEnabled.subscribe((v) => seen.push(v));
        stop(); // component destroyed inside the deferral window

        await vi.runAllTimersAsync();
        signal.set(true);

        expect(seen).toEqual([undefined]);
        expect(signal.subscriberCount()).toBe(0);
    });

    it('unsubscribing after handover detaches from the signal', async () => {
        const writeEnabled = await loadStore({ browser: true });

        const seen: (boolean | undefined)[] = [];
        const stop = writeEnabled.subscribe((v) => seen.push(v));
        await vi.runAllTimersAsync();
        expect(signal.subscriberCount()).toBe(1);

        stop();
        signal.set(true);

        expect(signal.subscriberCount()).toBe(0);
        expect(seen).not.toContain(true);
    });
});
