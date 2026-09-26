import type { Signal } from 'langsys-js-typescript';
import { render } from 'svelte/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// Wrapped through the binding's own exports — the objects a component actually subscribes to,
// which are the core's signals by reference (surface.test.ts).
import { currentlyLoadedLocale, sTranslations, t as tSignal } from '$lib/index.js';
import SubscriptionProbe from './SubscriptionProbe.svelte';

/**
 * Does a server render leave subscriptions open on the core's process-wide signals?
 *
 * A server process renders for every visitor, and the core's signals live for the life of the
 * process, so a subscription a render opens and never releases is held forever — one more per
 * request. Counted at the source: each signal's `subscribe` is wrapped to count what it hands out
 * and what is released.
 */
const counts = new Map<string, { opened: number; released: number }>();
const originals = new Map<Signal<unknown>, Signal<unknown>['subscribe']>();

function count(name: string, signal: Signal<unknown>) {
    const tally = { opened: 0, released: 0 };
    counts.set(name, tally);
    const original = signal.subscribe;
    originals.set(signal, original);
    signal.subscribe = ((run: (v: unknown) => void) => {
        tally.opened += 1;
        const stop = original.call(signal, run);
        let done = false;
        return () => {
            if (!done) tally.released += 1;
            done = true;
            stop();
        };
    }) as Signal<unknown>['subscribe'];
}

/**
 * `render()` from `svelte/server` does no work until its output is read — it returns a
 * `RenderOutput` whose `body` getter renders. A loop of bare `render(...)` calls renders nothing
 * and opens nothing, which reads exactly like "no leak". Every render here reads `body`.
 */
const serve = (props: Record<string, unknown>) => render(SubscriptionProbe, { props }).body;

const reset = () => counts.forEach((c) => ((c.opened = 0), (c.released = 0)));
const open = (name: string) => counts.get(name)!.opened - counts.get(name)!.released;

beforeAll(() => {
    count('tSignal', tSignal as Signal<unknown>);
    count('currentlyLoadedLocale', currentlyLoadedLocale as Signal<unknown>);
    count('sTranslations', sTranslations as Signal<unknown>);
});
afterAll(() => originals.forEach((subscribe, signal) => (signal.subscribe = subscribe)));

describe('server renders release every subscription they open', () => {
    it('50 renders of every exported store and component leave nothing open on any signal', () => {
        reset();
        for (let i = 0; i < 50; i++) serve({});
        // Premise: the renders really subscribed, on every signal — measured at 100 / 50 / 50 opened.
        for (const name of counts.keys()) expect(counts.get(name)!.opened, name).toBeGreaterThan(0);
        expect({ t: open('tSignal'), locale: open('currentlyLoadedLocale'), catalog: open('sTranslations') }).toEqual({ t: 0, locale: 0, catalog: 0 });
    });

    it('control: a subscription released in onDestroy reads opened = released', () => {
        reset();
        serve({ control: 'released' });
        const c = counts.get('tSignal')!;
        // The fixture's stores open some too; the control adds exactly one, released at teardown.
        expect(open('tSignal')).toBe(0);
        expect(c.opened).toBeGreaterThan(0);
    });

    it('control: a subscription never released is counted as open, once per render', () => {
        reset();
        for (let i = 0; i < 50; i++) serve({ control: 'leaked' });
        expect(open('tSignal')).toBe(50);
    });
});
