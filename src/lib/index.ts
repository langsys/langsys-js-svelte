/**
 * langsys-js-svelte — idiomatic Svelte binding over `langsys-js-typescript`.
 *
 * Public API:
 *   - `LangsysApp` (init accepts a Svelte `Writable<string>` for userLocale)
 *   - `t` — `Signal<TFunction>`; read it, never write it. Its `subscribe` fires
 *     immediately, so use `{$t('Phrase', 'Cat', { name })}` in templates.
 *   - `currentlyLoadedLocale`, `sTranslations` — `Signal<T>`, which satisfies
 *     Svelte's `Readable` contract, so read them with `$store` syntax. They are
 *     also WRITABLE (`.set()`), and the SSR guide's server-rendering pattern
 *     depends on that: seeding them in a layout component body is what makes
 *     `$t()` resolve during SSR. They are process-global — see README-SSR.md
 *     before writing to them.
 *   - `Translate` — content-block component; tokenizes each translatable run
 *     in its subtree (text nodes + translatable attributes).
 *   - `Phrase` — keeps ONE markup-bearing run as a single translatable phrase,
 *     so a count stays in the same catalog entry as the noun it inflects.
 *     Required for correct ICU pluralization; `Translate` alone would split at
 *     the tag boundary.
 *   - `DontTranslate` — marks a region as never-translated, preserved verbatim.
 *
 * In markup, placeholders are written `%name%`, not `{name}` — Svelte would
 * compile a bare `{name}` as its own expression tag. `$t()` keeps `{name}`.
 */

import {
    LangsysApp as _LangsysApp,
    type ExtractParamKeys,
    type ParamsFor,
    type ParamPrimitive,
    type TArgs,
    type TFunction,
    type TranslationParams,
    type iCategories,
    type iContentBlock,
    type iCountry,
    type iCountryDialCode,
    type iCountryList,
    type iCurrency,
    type iCurrencyList,
    type WriteGrant,
    type iLangsysInitConfig as iVanillaInitConfig,
    type iLangsysResponse,
    type iLanguageName,
    type iLocaleData,
    type iLocaleDefault,
    type iLocaleFlat,
    type iProject,
    type iTranslations,
} from 'langsys-js-typescript';
import type { Readable, Writable } from 'svelte/store';
import { adaptStore, adaptWriteGrant, type WriteGrantSource } from './adapters.js';

// Stores — re-exported unchanged. They are `Signal<T>`, which is what an IDE
// hover shows; `Signal` structurally satisfies Svelte's `Readable` contract, so
// `$store` syntax works with no adapter. Two of them are also writable — see the
// JSDoc above and README-SSR.md before writing to them.
export { currentlyLoadedLocale, sTranslations, tSignal as t } from 'langsys-js-typescript';

// `writeEnabled` is the one store we do NOT re-export by reference — reading the
// live signal during hydration is a mismatch hazard in SvelteKit. See stores.ts.
export { writeEnabled } from './stores.js';

// API client (vanilla — no Svelte concerns)
export { LangsysAppAPI } from 'langsys-js-typescript';

// Locale canonicalization (vanilla). Canonicalizes via `Intl.getCanonicalLocales`
// and then LOWERCASES: 'en_us', 'en-US' and 'EN-us' all become 'en-us'. Lowercase
// is the wire form the spec requires (WIRE-3) and the form used internally for
// cache keys and equality, so 'en-US' from a host app's locale store resolves to
// the same entry rather than fetching twice.
export { canonicalizeLocale } from 'langsys-js-typescript';

// Components
export { default as Translate } from './components/Translate.svelte';
export { default as Phrase } from './components/Phrase.svelte';
export { default as DontTranslate } from './components/DontTranslate.svelte';

// Type re-exports — these are all framework-agnostic so consumers can rely on
// them directly without reaching into langsys-js-typescript.
export type { WriteGrantSource } from './adapters.js';

export type {
    ExtractParamKeys,
    ParamPrimitive,
    ParamsFor,
    TArgs,
    TFunction,
    TranslationParams,
    WriteGrant,
    iCategories,
    iContentBlock,
    iCountry,
    iCountryDialCode,
    iCountryList,
    iCurrency,
    iCurrencyList,
    iLangsysResponse,
    iLanguageName,
    iLocaleData,
    iLocaleDefault,
    iLocaleFlat,
    iProject,
    iTranslations,
};

/**
 * Svelte-flavored init config. The only difference from the base SDK's config
 * is that `UserLocaleStore` is a `Writable<string>` (the standard Svelte
 * store shape) — the wrapper adapts it to the base SDK's `Signal<string>`
 * automatically.
 */
export interface iLangsysInitConfig extends Omit<iVanillaInitConfig, 'UserLocaleStore' | 'writeGrant'> {
    UserLocaleStore: Writable<string>;
    /**
     * Short-lived write grant for login-walled apps. Accepts everything the base
     * SDK does, plus a Svelte store — refresh by writing to the store.
     */
    writeGrant?: WriteGrantSource;
}

/**
 * Svelte SDK entry point.
 *
 * A **Proxy over the core singleton**, not a hand-written wrapper class. Only the
 * two methods that genuinely need Svelte adaptation are overridden; everything
 * else forwards.
 *
 * **The reason is forward-looking, not a present defect — and the first version of
 * this note got that wrong.** A runtime scan of the core's prototype reports 33
 * members against the old wrapper's 20, which looks like thirteen dropped methods,
 * five of them matching names another binding had reported missing. All thirteen
 * are declared `private` in the core's `.d.ts`. TypeScript's `private` is erased at
 * runtime, so `getOwnPropertyNames` surfaces implementation detail and cannot tell
 * it from API. The old wrapper covered **every public member**; nothing public was
 * ever unreachable.
 *
 * What the proxy actually buys: a public member the core adds tomorrow is exposed
 * automatically. The enumerated version would have omitted it silently, and no test
 * would have failed — which is a real hazard, just not one that had already fired.
 *
 * Forwarding rules that matter:
 * - `Reflect.get(target, prop, target)` — the receiver is the CORE, never the
 *   proxy, so getters resolve against the real instance and any future `#private`
 *   field keeps working. Passing the proxy as receiver is the standard way this
 *   breaks.
 * - Functions are bound to the core before being handed out, so a destructured
 *   `const { refresh } = LangsysApp` still works.
 */
type LangsysAppSvelte = Omit<typeof _LangsysApp, 'init' | 'setWriteGrant'> & {
    /** Initialize Langsys. Pass a Svelte `writable<string>` as `UserLocaleStore`. */
    init(config: iLangsysInitConfig): Promise<iLangsysResponse>;
    /**
     * Supply the write grant after `init()` — for apps whose token only exists
     * once the user has logged in. Re-authorizes so the server re-evaluates the
     * session with the new grant, so `await` it if you need `writeEnabled`
     * settled before the next assertion.
     */
    setWriteGrant(grant: WriteGrantSource | undefined): Promise<void>;
};

/**
 * The only members this binding overrides. Kept as a named set so a test can
 * assert set-equality against it: an override that quietly stops being one, or a
 * new one added without thought, both show up as a failing count rather than as
 * nothing at all.
 */
const SVELTE_OVERRIDES = {
    init(config: iLangsysInitConfig): Promise<iLangsysResponse> {
        return _LangsysApp.init({
            ...config,
            UserLocaleStore: adaptStore(config.UserLocaleStore),
            writeGrant: adaptWriteGrant(config.writeGrant),
        });
    },
    setWriteGrant(grant: WriteGrantSource | undefined): Promise<void> {
        return _LangsysApp.setWriteGrant(adaptWriteGrant(grant));
    },
} as const;

/** Names this binding overrides — exported for the surface test, not for consumers. */
export const OVERRIDDEN_MEMBERS = Object.keys(SVELTE_OVERRIDES) as ReadonlyArray<string>;

export const LangsysApp = new Proxy(_LangsysApp, {
    get(target, prop) {
        if (typeof prop === 'string' && prop in SVELTE_OVERRIDES) {
            return SVELTE_OVERRIDES[prop as keyof typeof SVELTE_OVERRIDES];
        }
        // Receiver is the CORE, deliberately — see the note above.
        const value = Reflect.get(target, prop, target);
        return typeof value === 'function' ? value.bind(target) : value;
    },
    has(target, prop) {
        return (typeof prop === 'string' && prop in SVELTE_OVERRIDES) || Reflect.has(target, prop);
    },
}) as unknown as LangsysAppSvelte;

/**
 * Read-only Svelte view of the `t` store.
 *
 * Note this is NOT the type of the `t` export — `t` is `Signal<TFunction>`, and
 * that is what an IDE hover shows. `Signal` is structurally assignable to
 * `Readable`, so this alias is a convenience for consumers who want to accept
 * `t` under a Svelte-native type. Prefer `Signal<TFunction>` when you mean `t`.
 */
export type TStore = Readable<TFunction>;

// `Signal<T>` is the actual type of the three store exports. Re-exported so
// consumers can name it without reaching into `langsys-js-typescript`.
export type { Signal } from 'langsys-js-typescript';
