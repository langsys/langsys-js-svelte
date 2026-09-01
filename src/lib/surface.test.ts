import { describe, expect, it } from 'vitest';
import * as core from 'langsys-js-typescript';
import * as binding from './index.js';

/**
 * Pins the SHAPE of this binding's surface: what is re-exported by reference,
 * and the one thing that deliberately is not.
 *
 * BIND-6 says wrap the narrowest surface possible, and the payoff is concrete:
 * because `t` is the core's own signal object, no code here sits in the
 * catalog-miss path, and this package can be *excluded* from an investigation
 * rather than merely defended. That claim is only worth anything if something
 * checks it, so this file checks it by object identity rather than by behaviour
 * — two different objects can behave identically right up until one of them
 * caches.
 *
 * The core's side of the same contract is pinned upstream at `cd07df1` ("pin
 * the TFunction identity contract at both enforcing sites"): `Signal.set` drops
 * a value that is `Object.is`-equal to the current one, so a fresh `TFunction`
 * per emit is the only thing that tells subscribers anything happened.
 * Memoizing there would make every `set` a no-op — correct values, no
 * re-render, green suite. Our reactivity rests on that, hence the citation.
 */
describe('surface — re-exported by reference', () => {
    it('t IS the core signal object, not a wrapper', () => {
        expect(binding.t).toBe(core.tSignal);
    });

    it('currentlyLoadedLocale and sTranslations are also the core objects', () => {
        expect(binding.currentlyLoadedLocale).toBe(core.currentlyLoadedLocale);
        expect(binding.sTranslations).toBe(core.sTranslations);
    });

    it('LangsysAppAPI and canonicalizeLocale pass through unchanged', () => {
        expect(binding.LangsysAppAPI).toBe(core.LangsysAppAPI);
        expect(binding.canonicalizeLocale).toBe(core.canonicalizeLocale);
    });
});

describe('surface — the one deliberate non-re-export', () => {
    /**
     * `writeEnabled` is wrapped on purpose (see stores.ts): reading the live
     * signal during hydration is a SvelteKit-specific mismatch hazard, because a
     * universal `load` re-runs on the client and is awaited BEFORE mount. The
     * wrapper changes only WHEN the value is observable, never what it is.
     *
     * An absence assertion is worthless without a control proving the same
     * comparison can find a match — the three `toBe` assertions above are that
     * control, run against the same objects by the same operator.
     */
    it('writeEnabled is NOT the core signal — it is the hydration-safe wrapper', () => {
        expect(binding.writeEnabled).not.toBe(core.writeEnabled);
    });

    it('but it is still a readable store, not something structurally different', () => {
        expect(typeof binding.writeEnabled.subscribe).toBe('function');
        expect(typeof core.writeEnabled.subscribe).toBe('function');
    });

    it('and the core signal it wraps is genuinely present to have been re-exported', () => {
        // Guards against the assertion passing because `core.writeEnabled` is
        // undefined — in which case `not.toBe` would be trivially true and the
        // pin would prove nothing.
        expect(core.writeEnabled).toBeDefined();
        expect(core.writeEnabled).not.toBeNull();
    });
});

/**
 * Forwarding completeness for the `LangsysApp` proxy.
 *
 * **A correction is embedded here, because the first version of this file got the
 * finding wrong.** A runtime scan of the core's prototype reports 33 members, and
 * the old hand-enumerated wrapper exposed 20 — which looked like thirteen dropped
 * methods, five of them matching names another binding had reported missing.
 *
 * All thirteen are declared `private` in the core's `.d.ts`. TypeScript's
 * `private` is erased at runtime, so `getOwnPropertyNames` sees implementation
 * detail and cannot tell it from API. The old wrapper covered **every public
 * member**; it dropped no public surface at all.
 *
 * The proxy is still the right shape, for a forward-looking reason rather than a
 * present defect: a public member the core adds tomorrow is exposed automatically,
 * where the enumerated version would have silently omitted it and nothing would
 * have failed. That is the property these assertions pin.
 *
 * They are GENERATED from the core's prototype rather than written against a list,
 * because a hand-written list is the same mistake one layer up.
 */
function coreMembers(obj: object): string[] {
    const seen = new Set<string>();
    let o: object | null = obj;
    while (o && o !== Object.prototype) {
        for (const k of Object.getOwnPropertyNames(o)) if (k !== 'constructor') seen.add(k);
        o = Object.getPrototypeOf(o);
    }
    return [...seen].sort();
}

const asRecord = (v: unknown) => v as Record<string, unknown>;

describe('LangsysApp — the proxy forwards every core member', () => {
    const members = coreMembers(core.LangsysApp);

    it('positive control: the core actually exposes a surface to miss', () => {
        // Without this, a core that enumerated to zero would make every
        // generated assertion below vacuously true.
        expect(members.length).toBeGreaterThan(20);
        expect(members).toContain('refresh');
    });

    it.each(members)('`%s` is reachable through the binding', (name) => {
        expect(name in binding.LangsysApp).toBe(true);
        expect(asRecord(binding.LangsysApp)[name]).toBeDefined();
    });

    /**
     * These five are the names the fleet reported as "dropped methods". They are
     * private core implementation, not API — asserted here only to pin that the
     * proxy forwards uniformly, and named so the next person who meets the fleet
     * report finds the correction rather than repeating it.
     */
    it.each(['applyAuthorization', 'getUserLanguagePreferences', 'parseAcceptLanguageHeader', 'findBestLocaleMatch', 'resolveLocale'])(
        '`%s` forwards at runtime (core-PRIVATE, not recovered API)',
        (name) => {
            expect(typeof asRecord(binding.LangsysApp)[name]).toBe('function');
            // The public type must NOT expose it: that is the core's boundary, and
            // widening it here would be the binding adding surface the core withholds.
            expect(Object.prototype.hasOwnProperty.call(binding.LangsysApp, name)).toBe(false);
        }
    );
});

describe('LangsysApp — overrides are exactly the two that need adaptation', () => {
    it('the override set is exactly init + setWriteGrant', () => {
        expect([...binding.OVERRIDDEN_MEMBERS].sort()).toEqual(['init', 'setWriteGrant']);
    });

    it('an overridden member is NOT the core function', () => {
        expect(binding.LangsysApp.init).not.toBe(core.LangsysApp.init);
        expect(binding.LangsysApp.setWriteGrant).not.toBe(core.LangsysApp.setWriteGrant);
    });

    it('a non-overridden member forwards through, callable unbound', () => {
        // Destructuring must keep working — the proxy binds before handing out.
        const { detectPreferredLocale } = binding.LangsysApp;
        expect(typeof detectPreferredLocale).toBe('function');
        expect(() => detectPreferredLocale('en-US,en;q=0.9')).not.toThrow();
    });

    it('behavioural through-the-receiver call: forwarding binds to the CORE', () => {
        // Structural scan says the core class has no `#private` fields today; this
        // is the behavioural half. If forwarding ever passed the PROXY as receiver,
        // a private-field read would throw here rather than being caught by a grep.
        expect(() => binding.LangsysApp.detectPreferredLocale(null)).not.toThrow();
        expect(binding.LangsysApp.debug).toBeDefined();
    });
});

/**
 * The surface a Svelte consumer actually reaches.
 *
 * This binding exposes no `setContext`/`getContext` — verified, not assumed — so
 * the module's exports ARE the reach surface, and a class-only identity test
 * would miss most of it. These assertions are generated from the module object
 * rather than a list, for the same reason the core enumeration is: a list covers
 * exactly what someone remembered on the day.
 */
describe('module surface — what a consumer imports', () => {
    const exported = Object.keys(binding).sort();

    it('positive control: the module exports a surface worth checking', () => {
        expect(exported.length).toBeGreaterThan(8);
        expect(exported).toContain('LangsysApp');
        expect(exported).toContain('t');
    });

    it.each(Object.keys(binding).sort())('export `%s` is defined', (name) => {
        expect((binding as Record<string, unknown>)[name]).toBeDefined();
    });

    /**
     * Store-shaped exports must satisfy Svelte's Readable contract, because `$x`
     * in a template is a compile-time contract — a value that looks right but
     * lacks `subscribe` fails at the consumer's build, not here.
     */
    it.each(['t', 'currentlyLoadedLocale', 'sTranslations', 'writeEnabled'])('`%s` satisfies the Readable contract consumers rely on for `$store`', (name) => {
        const store = (binding as Record<string, { subscribe?: unknown }>)[name];
        expect(typeof store.subscribe).toBe('function');
    });

    it('components are exported as component constructors', () => {
        for (const c of ['Translate', 'Phrase', 'DontTranslate']) {
            expect((binding as Record<string, unknown>)[c]).toBeTruthy();
        }
    });
});
