import { get as svelteGet, type Readable, type Writable } from 'svelte/store';
import type { Signal, WriteGrant } from 'langsys-js-typescript';

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

/**
 * The Svelte-flavored write grant. Everything the base SDK accepts, plus a
 * Svelte store — so refresh is `grantStore.set(nextToken)` rather than an
 * imperative call.
 */
export type WriteGrantSource = WriteGrant | Readable<string | null | undefined>;

function isReadable(v: unknown): v is Readable<string | null | undefined> {
    return (
        typeof v === 'object' &&
        v !== null &&
        typeof (v as Readable<unknown>).subscribe === 'function'
    );
}

/**
 * Normalize the Svelte grant option down to the base SDK's `WriteGrant`.
 *
 * A store becomes a provider *function*, never a snapshot. The base SDK
 * deliberately resolves the grant per request and caches it nowhere, so reading
 * through on every call is what makes a later `grantStore.set(token)` take
 * effect on the very next request instead of the next `init()`.
 */
export function adaptWriteGrant(grant: WriteGrantSource | undefined): WriteGrant | undefined {
    if (grant === undefined) return undefined;
    if (isReadable(grant)) return () => svelteGet(grant);
    return grant;
}
