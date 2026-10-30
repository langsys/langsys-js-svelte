import type { Readable } from 'svelte/store';
import { writeEnabled as vanillaWriteEnabled } from 'langsys-js-typescript';

/**
 * `writeEnabled`, made safe to read during hydration.
 *
 * The base SDK's signal is browser-authoritative: it is never written under
 * SSR, so the server always renders from `undefined`. On the client it becomes
 * concrete as soon as authorization resolves — and in SvelteKit that can happen
 * BEFORE the first client render, because universal `load` functions
 * (`+page.ts` / `+layout.ts`) run again on the client during hydration
 * bootstrap and SvelteKit awaits them before mounting. A consumer who does
 * `await LangsysApp.init(...)` in a load therefore hydrates holding a concrete
 * value while the server sent markup built from `undefined`, and anything
 * branching on it mismatches.
 *
 * So we publish `undefined` for the whole hydration pass and adopt the real
 * value on the first macrotask after it — the Svelte-shaped equivalent of
 * React's pinned server snapshot. Components that mount later (client-side
 * navigation, conditional blocks) subscribe straight through, so the deferral
 * costs one tick per page load and nothing on navigation.
 *
 * Deliberately NOT defaulted to `false`. Telling a write-enabled session it is
 * read-only is a worse failure than reporting an honest "not known yet", and it
 * is unrecoverable without a reload — the tri-state is load-bearing upstream,
 * where `undefined` means "hold these misses" rather than "drop them".
 */

const isBrowser = typeof window !== 'undefined';

/**
 * Flips on the first macrotask after the first render that reads the store
 * (`endHydrationSoon`).
 *
 * Deliberately keyed on a render, not on module init. Timing from module init is
 * wrong precisely in the case this store exists for: an awaited universal `load`
 * runs several macrotasks' worth of network work between importing this module
 * and mounting the app, so a timer started at import has long since fired by the
 * time hydration renders, and the guard would be off exactly when it was needed.
 * A render's subscription, by contrast, is made *during* the hydration render —
 * so a macrotask scheduled from it lands after hydration completes, whatever
 * delayed the mount.
 *
 * A render is a subscription still held once the task that made it has run. A
 * one-shot read — `get(writeEnabled)`, which subscribes and unsubscribes at once —
 * is not one: the same read in a universal `load` happens before hydration, so it
 * reports "unknown" and leaves the guard on for the render that follows. A
 * subscription a `load` holds is indistinguishable from a render, so the README
 * tells a `load` to use `get()`. `syncNavigation()` also ends the pass, once
 * SvelteKit has mounted the first page.
 */
let pastHydration = false;

let hydrationEnding = false;
/** Ends the hydration pass a macrotask from now. `syncNavigation()` calls it once the first page has mounted. */
export function endHydrationSoon(): void {
    if (hydrationEnding) return;
    hydrationEnding = true;
    setTimeout(() => {
        pastHydration = true;
    }, 0);
}

export const writeEnabled: Readable<boolean | undefined> = {
    subscribe(run) {
        // Under SSR the signal is never written, so report the "unknown" the
        // server should render and skip subscribing to a process-wide singleton
        // that would outlive this request.
        if (!isBrowser) {
            run(undefined);
            return () => {};
        }

        // Past hydration there is nothing to protect against — mirror directly
        // so mounts after a client-side navigation see the real value at once.
        if (pastHydration) return vanillaWriteEnabled.subscribe(run);

        // Hydration pass: publish the same "unknown" the server rendered, so the
        // hydrated markup matches, then adopt the real value immediately after.
        run(undefined);

        let stopLive: (() => void) | undefined;
        let cancelled = false;

        // Still held once this task has run: a render, so the pass ends a macrotask later.
        void Promise.resolve().then(() => {
            if (!cancelled) endHydrationSoon();
        });

        // This subscriber's hand-over to the live signal, on the same tick, unless it unsubscribed.
        const timer = setTimeout(() => {
            if (cancelled) return;
            stopLive = vanillaWriteEnabled.subscribe(run);
        }, 0);

        return () => {
            cancelled = true;
            clearTimeout(timer);
            stopLive?.();
        };
    },
};
