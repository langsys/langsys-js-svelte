import { describe, expect, it, vi } from 'vitest';
import { get, readable, writable } from 'svelte/store';
import { adaptStore, adaptWriteGrant } from './adapters.js';

describe('adaptStore', () => {
    it('exposes the writable as a Signal, with .get() synthesized', () => {
        const w = writable('en-US');
        const signal = adaptStore(w);

        expect(signal.get()).toBe('en-US');
        signal.set('fr-FR');
        expect(get(w)).toBe('fr-FR');
        expect(signal.get()).toBe('fr-FR');
    });

    it('reads through on every .get() rather than snapshotting at adapt time', () => {
        const w = writable('a');
        const signal = adaptStore(w);
        signal.get();
        w.set('b');
        expect(signal.get()).toBe('b');
    });

    it('forwards update() and subscribe()', () => {
        const w = writable(1);
        const signal = adaptStore(w);
        const seen: number[] = [];
        const stop = signal.subscribe((v) => seen.push(v));

        signal.update((n) => n + 1);
        stop();
        w.set(99); // after unsubscribe — must not be observed

        expect(seen).toEqual([1, 2]);
    });
});

describe('adaptWriteGrant', () => {
    it('passes undefined through, so "no grant" stays no grant', () => {
        expect(adaptWriteGrant(undefined)).toBeUndefined();
    });

    it('passes a plain string through unchanged', () => {
        expect(adaptWriteGrant('jwt-token')).toBe('jwt-token');
    });

    it('passes a provider function through unchanged', () => {
        const provider = () => 'from-provider';
        expect(adaptWriteGrant(provider)).toBe(provider);
    });

    /**
     * The load-bearing one. A store must become a PROVIDER, never a snapshot: the
     * base SDK resolves the grant per request and caches it nowhere, so reading
     * through on each call is what makes `grantStore.set(next)` take effect on the
     * very next request. Snapshotting here would look like a pure adapter while
     * silently producing a grant that can never refresh — which is the failure this
     * test exists to catch.
     */
    it('turns a store into a provider that re-reads on every call', () => {
        const store = writable('first');
        const grant = adaptWriteGrant(store);

        expect(typeof grant).toBe('function');
        expect((grant as () => string)()).toBe('first');

        store.set('second');
        expect((grant as () => string)()).toBe('second');

        store.set('third');
        expect((grant as () => string)()).toBe('third');
    });

    it('accepts a read-only store, not just a writable', () => {
        const ro = readable<string | null>('ro-token');
        const grant = adaptWriteGrant(ro);
        expect((grant as () => string | null)()).toBe('ro-token');
    });

    it('propagates a store holding null/undefined as a valid "no grant yet"', () => {
        const store = writable<string | null | undefined>(undefined);
        const grant = adaptWriteGrant(store) as () => string | null | undefined;

        expect(grant()).toBeUndefined();
        store.set(null);
        expect(grant()).toBeNull();
        store.set('now-logged-in');
        expect(grant()).toBe('now-logged-in');
    });

    it('does not subscribe eagerly — the store is only read when the provider is called', () => {
        const subscribe = vi.fn(writable('x').subscribe);
        const fake = { subscribe } as unknown as Parameters<typeof adaptWriteGrant>[0];

        const grant = adaptWriteGrant(fake);
        expect(subscribe).not.toHaveBeenCalled();

        (grant as () => unknown)();
        expect(subscribe).toHaveBeenCalledTimes(1);
    });
});
