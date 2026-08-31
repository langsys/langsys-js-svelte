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
