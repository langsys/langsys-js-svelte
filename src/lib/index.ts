/**
 * langsys-js-svelte — idiomatic Svelte binding over `langsys-js-typescript`.
 *
 * Public API:
 *   - `LangsysApp` (init accepts a Svelte `Writable<string>` for userLocale)
 *   - `t` — `Readable<TFunction>`. Use `{$t('Phrase', 'Cat', { name })}` in templates.
 *   - `currentlyLoadedLocale`, `sTranslations` — read with `$store` syntax.
 *   - `Translate` — Svelte component wrapping the vanilla DOM Translate class.
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
import { adaptStore } from './adapters.js';

// Stores — the underlying Signals already satisfy Svelte's Readable contract.
// We re-export them under Svelte-native types so IDE hovers and consumers see
// the familiar shape.
export {
    currentlyLoadedLocale,
    sTranslations,
    tSignal as t,
} from 'langsys-js-typescript';

// API client (vanilla — no Svelte concerns)
export { LangsysAppAPI } from 'langsys-js-typescript';

// Components
export { default as Translate } from './components/Translate.svelte';
export { default as Phrase } from './components/Phrase.svelte';
export { default as DontTranslate } from './components/DontTranslate.svelte';

// Type re-exports — these are all framework-agnostic so consumers can rely on
// them directly without reaching into langsys-js-typescript.
export type {
    ExtractParamKeys,
    ParamPrimitive,
    ParamsFor,
    TArgs,
    TFunction,
    TranslationParams,
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
export interface iLangsysInitConfig extends Omit<iVanillaInitConfig, 'UserLocaleStore'> {
    UserLocaleStore: Writable<string>;
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
        });
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
