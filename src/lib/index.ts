/**
 * langsys-js-svelte — idiomatic Svelte binding over `langsys-js-typescript`.
 *
 * Public API:
 *   - `LangsysApp` (init accepts a Svelte `Writable<string>` for userLocale)
 *   - `t` — `Readable<TFunction>`. Use `{$t('Phrase', 'Cat', { name })}` in templates.
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

// Stores — the underlying Signals already satisfy Svelte's Readable contract.
// We re-export them under Svelte-native types so IDE hovers and consumers see
// the familiar shape.
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
 * Svelte SDK entry point. Delegates everything to the underlying `langsys-js-typescript`
 * singleton; the only behavior change is that `init` accepts a Svelte
 * `Writable<string>` for the user locale and adapts it before passing through.
 */
class LangsysAppSvelte {
    /** Initialize Langsys. Pass a Svelte `writable<string>` as `UserLocaleStore`. */
    public init(config: iLangsysInitConfig): Promise<iLangsysResponse> {
        return _LangsysApp.init({
            ...config,
            UserLocaleStore: adaptStore(config.UserLocaleStore),
            writeGrant: adaptWriteGrant(config.writeGrant),
        });
    }

    /**
     * Supply the write grant after `init()` — for apps whose token only exists
     * once the user has logged in. Re-authorizes so the server re-evaluates the
     * session with the new grant, so `await` it if you need `writeEnabled`
     * settled before the next assertion.
     */
    public setWriteGrant(grant: WriteGrantSource | undefined): Promise<void> {
        return _LangsysApp.setWriteGrant(adaptWriteGrant(grant));
    }

    public get Translations() {
        return _LangsysApp.Translations;
    }

    public get translationsLoadingPromise() {
        return _LangsysApp.translationsLoadingPromise;
    }

    /** Current translation function. Reads fresh state on every call (not reactive on its own — use `$t` in templates). */
    public get t(): TFunction {
        return _LangsysApp.t;
    }

    public get debug() {
        return _LangsysApp.debug;
    }

    public refresh() {
        return _LangsysApp.refresh();
    }

    public getCountries(inLocale?: string) {
        return _LangsysApp.getCountries(inLocale);
    }
    public getCountryName(forCountryCode: string, inLocale?: string) {
        return _LangsysApp.getCountryName(forCountryCode, inLocale);
    }
    public getCurrencies(inLocale?: string) {
        return _LangsysApp.getCurrencies(inLocale);
    }
    public getCurrencyName(forCurrencyCode: string, inLocale?: string) {
        return _LangsysApp.getCurrencyName(forCurrencyCode, inLocale);
    }
    public getDialCodes(inLocale?: string) {
        return _LangsysApp.getDialCodes(inLocale);
    }

    public getLocales(inLocale?: string) {
        return _LangsysApp.getLocales(inLocale);
    }
    public getLocalesFlat(inLocale?: string) {
        return _LangsysApp.getLocalesFlat(inLocale);
    }
    public getLocalesData(inLocale?: string, forceRefresh?: boolean) {
        return _LangsysApp.getLocalesData(inLocale, forceRefresh);
    }
    public getLocalesFormat(format: '' | 'flat' | 'data' = '', inLocale?: string) {
        return _LangsysApp.getLocalesFormat(format, inLocale);
    }
    public getLocaleName(forLocale: string, shortName?: boolean, inLocale?: string) {
        return _LangsysApp.getLocaleName(forLocale, shortName, inLocale);
    }
    public getLocaleNameWithLookup(forLocale: string, shortName?: boolean, inLocale?: string) {
        return _LangsysApp.getLocaleNameWithLookup(forLocale, shortName, inLocale);
    }

    /** @deprecated use `getLocaleNameWithLookup` or `getLocaleName` */
    public getLanguageName(forLocale: string, shortName?: boolean, inLocale?: string) {
        return _LangsysApp.getLanguageName(forLocale, shortName, inLocale);
    }

    public detectPreferredLocale(acceptLanguageHeader?: string | null, supportedLocales?: string[]) {
        return _LangsysApp.detectPreferredLocale(acceptLanguageHeader, supportedLocales);
    }
}

export const LangsysApp = new LangsysAppSvelte();

// Narrow type for the `t` re-export so consumers see it as a Svelte Readable.
// (The Signal implementation under the hood is structurally compatible.)
export type TStore = Readable<TFunction>;
