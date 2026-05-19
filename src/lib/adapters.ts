import { get as svelteGet, type Writable } from 'svelte/store';
import type { Signal } from 'langsys-js-typescript';

/**
 * Wrap a Svelte `Writable<T>` as a `Signal<T>` for the base SDK.
 *
 * Svelte writables expose `subscribe`/`set`/`update`; the base SDK additionally
 * needs `.get()` to read the current value synchronously. We synthesize it via
 * `svelte/store`'s `get` helper — a single read-and-unsubscribe round trip.
 */
export function adaptStore<T>(w: Writable<T>): Signal<T> {
    return {
        subscribe: w.subscribe,
        set: w.set,
        update: w.update,
        get: () => svelteGet(w),
    };
}
