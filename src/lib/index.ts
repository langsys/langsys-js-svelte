// Reexport your entry components here
import { get, type Writable } from 'svelte/store';
import type { ResponseObject } from './interface/api.js';
import type { iLangsysConfig, iLangsysInitConfig } from './interface/config.js';
import type { iCountryDialCode, iCountryList } from './interface/countries.js';
import type { iCurrencyList } from './interface/currencies.js';
import type { iLocaleData, iLocaleDefault, iLocaleFlat } from './interface/locales.js';
import echo from './js/echo.js';
import Translations from './js/Translations.js';
import LangsysAppAPI from './service/LangsysAppAPI.js';
import config from './store/config.js';
import currentlyLoadedLocale from './store/currentlyLoadedLocale.js';
import sTranslations from './store/translations.js';
export type { ResponseObject as iLangsysResponse } from './interface/api.js';
export type { iLangsysInitConfig } from './interface/config.js';
export type { iCountryDialCode, iCountryList } from './interface/countries.js';
export type { iCurrency, iCurrencyList } from './interface/currencies.js';
export type { iProject } from './interface/iProject.js';
export type { iLanguageName, iLocaleData, iLocaleDefault, iLocaleFlat } from './interface/locales.js';
export type { iCategories, iTranslations } from './interface/translations.js';

class LangsysAppClass {
    private config: iLangsysConfig;

    public Translations: Translations;
    public translationsLoadingPromise: Promise<any> = Promise.resolve();

    private locales: Record<string, iLocaleData[]>;

    private countries: iCountryList = [];
    private countriesLocale: string = '';

    private dialCodes: iCountryDialCode[] = [];
    private dialCodesLocale: string = '';

    private currencies: iCurrencyList = [];
    private currenciesLocale: string = '';

    constructor() {
        this.config = config;
        this.debug.debugEnabled = this.config.debug ?? false;
        this.Translations = new Translations(this.config);
        this.locales = {};
    }

    public debug = {
        debugEnabled: true,
        log(...args: any[]) {
            if (!this.debugEnabled) return;
            echo.group(echo.asLog('Langsys Debug'));
            echo.log(...args);
            echo.groupEnd();
        },
        warn(...args: any[]) {
            // if (!this.debugEnabled) return;
            echo.group(echo.asWarning('Langsys Warning'));
            echo.warn(...args);
            echo.groupEnd();
        },
        error(...args: any[]) {
            // always show errors
            echo.group(echo.asAlert('Langsys Error'));
            echo.error(...args);
            echo.groupEnd();
            // window.console.error(...args);
        },
    };

    public async refresh() {
        const locale = get(this.config.sUserLocale);
        this.locales = {};
        return this.Translations.change(locale, true);
    }

    /**
     * Initialize Langsys - Modern config object approach
     * @param config Configuration object for initialization
     */
    public async init(config: iLangsysInitConfig): Promise<ResponseObject>;

    /**
     * Initialize Langsys - Legacy parameter approach
     * @deprecated This method signature is deprecated and will be removed in a future version. Use the config object approach instead.
     * @param projectid The ID (UUID) of the project created in Langsys for this app
     * @param key The API key associated to the configured projectid
     * @param UserLocaleStore A svelte-store Writable string with the user-selected locale
     * @param [baseLocale='en'] The base language/locale this app uses
     * @param [debug=false] Set true to enable console messages
     * @param [emulateFailureToLoad=false] Set true to emulate Langsys failure to load
     * @param [extraConfig] Additional configuration options
     */
    public async init(
        projectid: string,
        key: string,
        UserLocaleStore: Writable<string>,
        baseLocale?: string,
        debug?: boolean,
        emulateFailureToLoad?: boolean,
        extraConfig?: Partial<iLangsysConfig>
    ): Promise<ResponseObject>;

    public async init(
        configOrProjectid: iLangsysInitConfig | string,
        keyParam?: string,
        UserLocaleStoreParam?: Writable<string>,
        baseLocaleParam = 'en',
        debugParam = false,
        emulateFailureToLoadParam = false,
        extraConfig?: Partial<iLangsysConfig>
    ): Promise<ResponseObject> {
        // Handle both new config object and legacy parameters
        let initConfig: iLangsysInitConfig;

        if (typeof configOrProjectid === 'object') {
            // New way: config object
            initConfig = configOrProjectid;
        } else {
            // Legacy way: individual parameters (deprecated)
            console.warn(
                'LangsysApp.init(): Using deprecated parameter-based initialization. ' +
                'Please migrate to the config object approach. ' +
                'The legacy method will be removed in a future version.'
            );

            if (!keyParam || !UserLocaleStoreParam) {
                this.debug.error('Missing required parameters for legacy init');
                return { status: false, errors: ['Missing required parameters'] };
            }

            initConfig = {
                projectid: configOrProjectid,
                key: keyParam,
                UserLocaleStore: UserLocaleStoreParam,
                baseLocale: baseLocaleParam,
                debug: debugParam,
                emulateFailureToLoad: emulateFailureToLoadParam,
                ...extraConfig
            };
        }

        // Extract config with defaults
        const projectid = initConfig.projectid;
        const key = initConfig.key;
        const UserLocaleStore = initConfig.UserLocaleStore;
        let baseLocale = initConfig.baseLocale || 'en';
        const debug = initConfig.debug || false;
        const emulateFailureToLoad = initConfig.emulateFailureToLoad || false;
        const ssrTokenStrategy = initConfig.ssrTokenStrategy || 'client';
        const initialTranslations = initConfig.initialTranslations;
        const initialTranslationsLocale = initConfig.initialTranslationsLocale;

        // Set debug mode immediately so all subsequent debug messages work
        this.debug.debugEnabled = debug;

        // Log initial translations if provided and debug is enabled
        if (debug && initialTranslations) {
            this.debug.log('SSR initial translations config:', {
                hasInitialTranslations: !!initialTranslations,
                initialTranslationsLocale: initialTranslationsLocale,
                categoriesProvided: initialTranslations ? Object.keys(initialTranslations).length : 0,
                categories: initialTranslations ? Object.keys(initialTranslations) : []
            });
        }

        if (!projectid) {
            this.debug.error('LangsysApp.init missing projectid in configuration object!');
            return { status: false, errors: ['Missing projectid'] };
        }
        if (!key) {
            this.debug.error('LangsysApp.init missing API key in configuration object!');
            return { status: false, errors: ['Missing API key'] };
        }
        if (!UserLocaleStore?.subscribe) {
            this.debug.error("LangsysApp.init missing UserLocaleStore, a svelte-store for the user's selected locale.");
            return { status: false, errors: ['Missing UserLocaleStore'] };
        }

        // make sure baselocale is lowercase
        baseLocale = baseLocale.toLowerCase();

        if (!emulateFailureToLoad) {
            this.config = {
                projectid,
                key,
                sUserLocale: UserLocaleStore,
                baseLocale: baseLocale,
                debug,
                ssrTokenStrategy
            };
        }


        // validate api key & projectid config
        const validateResponse = await LangsysAppAPI.validate(this.config);

        // Store the key_type from the authorization response
        if (validateResponse.status && validateResponse.data) {
            const authData = validateResponse.data as any;
            if (authData.key_type) {
                this.config.key_type = authData.key_type;
                config.key_type = authData.key_type;
                this.debug.log('API Key Type:', this.config.key_type);
            }
        }

        // If initial translations provided, populate sTranslations store directly (same as normal API flow)
        if (initialTranslations && initialTranslationsLocale) {
            // Ensure __uncategorized__ exists
            if (!initialTranslations['__uncategorized__']) {
                initialTranslations['__uncategorized__'] = {
                    __category__: '__uncategorized__',
                    __symbol__: '__uncategorized__'
                } as any;
            }
            // Add __category__ to each category (same as getTranslations does)
            Object.keys(initialTranslations).forEach((cat) => {
                initialTranslations[cat]['__category__'] = cat;
            });
            sTranslations.set(initialTranslations);
            currentlyLoadedLocale.set(initialTranslationsLocale);
            this.debug.log('Populated sTranslations with initial data for locale:', initialTranslationsLocale);
        }

        // initialize Translation methods
        this.Translations.setup(this.config);

        // prefetch locale data for the user's current locale
        this.config.sUserLocale.subscribe((locale) => {
            if (validateResponse.status) {
                this.getLocalesData(locale);
                // subscribe to the user locale store so we can listen for change of locale
                this.debug.log('SUBSCRIBING TO USER LOCALE STORE');

                // Skip the fetch only if sTranslations already holds this locale.
                // Use the live currentlyLoadedLocale store (updated after each
                // successful fetch) rather than the static initialTranslationsLocale
                // capture - otherwise switching back to the initial locale after
                // a different one was loaded leaves the wrong translations in place.
                const loaded = get(currentlyLoadedLocale);
                const skipFetch = !!loaded && loaded === locale;

                this.translationsLoadingPromise = this.Translations.change(locale, false, skipFetch);
            }
        });

        // if (validateResponse.status) this.getLocalesData();

        return validateResponse;
    }

    /**
     * Get localized list of all country dial codes
     * @param inLocale define which language to translate the results to
     * @returns Promise<iCountryDialCode[]> Array of dial code objects with country code, dial code, and localized name
     */
    public async getDialCodes(inLocale?: string): Promise<iCountryDialCode[]> {
        const locale = inLocale || get(this.config.sUserLocale) || this.config.baseLocale;

        if (this.dialCodes.length && this.dialCodesLocale === locale) return this.dialCodes;

        const route = `countries/dial-codes/${locale}`;
        const response = await LangsysAppAPI.get(route);

        if (response.errors || !response.status) {
            this.debug.error('LangsysApp.getCountries failed: ' + route);
            return [];
        }

        this.dialCodes = response.data as iCountryDialCode[];
        this.dialCodesLocale = locale;

        return this.dialCodes;
    }

    /**
     * Get list of all currencies localized to inLocale or if not defined, sUserLocale, or if not defined, baseLocale
     * @param inLocale define which language to translate the results to
     * @returns iCurrencyList
     */
    public async getCurrencies(inLocale?: string): Promise<iCurrencyList> {
        const locale = inLocale || get(this.config.sUserLocale) || this.config.baseLocale;

        if (this.currencies.length && this.currenciesLocale === locale) return this.currencies;

        const route = `currencies/${locale}`;
        const response = await LangsysAppAPI.get(route);

        if (response.errors || !response.status) {
            this.debug.error('LangsysApp.getCurrencies failed: ' + route);
            return [];
        }

        this.currencies = response.data as iCurrencyList;
        this.currenciesLocale = locale;

        return this.currencies;
    }

    /**
     * Get list of all countries localized to inLocale or if not defined, sUserLocale, or if not defined, baseLocale
     * sUserLocale and baseLocale are both defined during LangsysApp.init()
     * @param inLocale define which language to translate the results to
     * @returns iCountryList
     */
    public async getCountries(inLocale?: string) {
        const locale = inLocale || get(this.config.sUserLocale) || this.config.baseLocale;

        if (this.countries.length && this.countriesLocale === locale) return this.countries;

        const route = `countries/${locale}`;
        const response = await LangsysAppAPI.get(route);

        if (response.errors || !response.status) {
            this.debug.error('LangsysApp.getCountries failed: ' + route);
            return [];
        }

        this.countries = response.data as iCountryList;
        this.countriesLocale = locale;

        return this.countries;
    }

    public async getCountryName(forCountryCode: string, inLocale?: string) {
        if (!forCountryCode) return '';

        const locale = inLocale || get(this.config.sUserLocale) || this.config.baseLocale;

        if (!this.countries.length || this.countriesLocale !== locale) await this.getCountries(inLocale);

        const country = this.countries.find((c) => c.code.toLowerCase() === forCountryCode.toLowerCase())?.label;
        if (!country) window.console.warn('getCountryName failed to match', forCountryCode);

        return country || forCountryCode;
    }

    public async getCurrencyName(forCurrencyCode: string, inLocale?: string) {
        if (!forCurrencyCode) return '';

        const locale = inLocale || get(this.config.sUserLocale) || this.config.baseLocale;

        if (!this.currencies.length || this.currenciesLocale !== locale) await this.getCurrencies(inLocale);

        const currency = this.currencies.find((c) => c.code?.toLowerCase() === forCurrencyCode.toLowerCase())?.name;
        if (!currency) window.console.warn('getCurrencyName failed to match', forCurrencyCode);

        return currency || forCurrencyCode;
    }

    /**
     * Get list of all locale codes and names localized to inLocale or if not defined, sUserLocale, or if not defined, baseLocale
     * sUserLocale and baseLocale are both defined during LangsysApp.init()
     * @param [format='categorized'] 'categorized'|'flat'|'data' different data formats as documented
     * @param inLocale define which language to translate the results to
     * @returns iLocaleDefault | iLocaleFlat[] | iLocaleData[]
     */
    public async getLocalesFormat(format: '' | 'flat' | 'data' = '', inLocale?: string) {
        const locale = inLocale || get(this.config.sUserLocale) || this.config.baseLocale;
        const route = `locales/${locale}` + (format ? `/${format}` : '');
        const response = await LangsysAppAPI.get(route);

        if (response.errors || !response.status) {
            this.debug.error(response.errors, response.status, response);
            this.debug.error('LangsysApp.getLocales failed: ' + route);
            return format === 'flat' ? [] : format === 'data' ? [] : {};
        }

        switch (format) {
            case 'flat':
                return response.data as iLocaleFlat[];
            case 'data':
                return response.data as iLocaleData[];
            default:
                return response.data as iLocaleDefault;
        }
    }

    /**
     * Returns translated locale list as array of objects with code and name
     * @param inLocale
     * @returns iLocaleFlat[]
     */
    public async getLocalesFlat(inLocale?: string) {
        return (await this.getLocalesFormat('flat', inLocale)) as iLocaleFlat[];
    }

    /**
     * Returns translated locale list as array of objects with code, locale_name, and lang_name
     * @param inLocale
     * @returns iLocaleData[]
     */
    public async getLocalesData(inLocale?: string, forceRefresh = false) {
        // get locale from inLocale, sUserLocale, or baseLocale
        const locale = inLocale || get(this.config.sUserLocale) || this.config.baseLocale;

        // return cached data if available and forceRefresh is not true
        if (this.locales?.[locale]?.length && !forceRefresh) return this.locales[locale];

        // otherwise, get the data from the api
        this.locales[locale] = (await this.getLocalesFormat('data', inLocale)) as iLocaleData[];

        return this.locales[locale];
    }
    /**
     * Get list of all locale codes, locale name, and language name
     * Sorted alphabetically, grouped by language name
     * good for optgroup in select dropdowns
     * @param inLocale get list in this locale, default is sUserLocale
     * @returns iLocalDefault
     */
    public async getLocales(inLocale?: string) {
        return (await this.getLocalesFormat('', inLocale)) as iLocaleDefault;
    }

    public async getLocaleNameWithLookup(forLocale: string, shortName = false, inLocale?: string) {
        if (!forLocale) return '';

        const locale = inLocale || get(this.config.sUserLocale) || this.config.baseLocale;

        await this.getLocalesData(locale);

        return this.getLocaleName(forLocale, shortName, locale);
    }

    public getLocaleName(forLocale: string, shortName = false, inLocale?: string) {
        // assume the locale data is already loaded
        // get locale from inLocale, sUserLocale, or baseLocale
        const locale = inLocale || get(this.config.sUserLocale) || this.config.baseLocale;

        let name = '';
        this.locales[locale]?.every((loc) => {
            // window.console.log(`checking ${forLocale} against ${loc.code}`, locale);
            if (loc.code === forLocale) {
                // window.console.log('found', { locale, loc });
                name = shortName ? loc.lang_name : loc.locale_name;
                return false;
            }
            return true;
        });

        if (!name) window.console.warn('getLocaleNameWithLookup failed to match', forLocale);

        return name;
    }

    /**
     * @deprecated - use getLocaleNameWithLookup instead or getLocaleName for synchronous lookup on cached data from getLocalesData
     */
    public async getLanguageName(forLocale: string, shortName = false, inLocale?: string) {
        return this.getLocaleNameWithLookup(forLocale, shortName, inLocale);
    }

    /**
     * Detects the end-user's preferred locale.
     *
     * In browser environments, uses `navigator.languages` (full preference array) falling back to `navigator.language`.
     * In SSR environments, parses the `Accept-Language` header.
     *
     * @param acceptLanguageHeader - The Accept-Language header string (for SSR)
     * @param supportedLocales - Optional array of supported locale codes to match against
     * @returns The detected locale code (e.g., 'en-US', 'fr') or `false` if not detected
     *
     * @example
     * // Browser usage - returns user's top preference
     * const locale = LangsysApp.detectPreferredLocale();
     *
     * @example
     * // Browser usage with locale matching - returns best supported match
     * const supported = await LangsysApp.getLocalesFlat();
     * const locale = LangsysApp.detectPreferredLocale(undefined, supported);
     *
     * @example
     * // SSR usage (SvelteKit +page.server.ts or hooks.server.ts)
     * const locale = LangsysApp.detectPreferredLocale(request.headers.get('Accept-Language'));
     */
    public detectPreferredLocale(acceptLanguageHeader?: string | null, supportedLocales?: string[]): string | false {
        // Get user's language preferences in priority order
        const userLocales = this.getUserLanguagePreferences(acceptLanguageHeader);

        if (userLocales.length === 0) {
            return false;
        }

        // If supported locales provided, find best match
        if (supportedLocales && supportedLocales.length > 0) {
            const bestMatch = this.findBestLocaleMatch(userLocales, supportedLocales);
            if (bestMatch) {
                return bestMatch;
            }
        }

        // Return user's top preference (normalized)
        return this.normalizeLocale(userLocales[0]);
    }

    /**
     * Gets user's language preferences in priority order.
     * Handles both browser and SSR environments.
     */
    private getUserLanguagePreferences(acceptLanguageHeader?: string | null): string[] {
        // SSR: Parse Accept-Language header if provided
        if (acceptLanguageHeader) {
            try {
                return this.parseAcceptLanguageHeader(acceptLanguageHeader);
            } catch (error) {
                this.debug.warn('Failed to parse Accept-Language header:', error);
            }
        }

        // Browser: Use navigator.languages (full preference array) or fallback to navigator.language
        if (typeof navigator !== 'undefined') {
            if (navigator.languages && navigator.languages.length > 0) {
                return Array.from(navigator.languages);
            }
            if (navigator.language) {
                return [navigator.language];
            }
        }

        return [];
    }

    /**
     * Parses Accept-Language header into prioritized locale array.
     * Handles malformed headers gracefully.
     */
    private parseAcceptLanguageHeader(header: string): string[] {
        if (!header || typeof header !== 'string' || header.trim() === '') {
            return [];
        }

        try {
            // Parse header: "en-US,en;q=0.9,fr;q=0.8,*;q=0.5"
            const locales = header
                .split(',')
                .map((part) => {
                    const trimmed = part.trim();
                    if (!trimmed || trimmed === '*') return null;

                    const [localePart, qPart] = trimmed.split(';q=');
                    const locale = localePart?.trim();
                    const q = qPart ? parseFloat(qPart) : 1.0;

                    // Validate locale and q-value
                    if (!locale || locale === '' || isNaN(q) || q <= 0 || q > 1) {
                        return null;
                    }

                    return { locale, q };
                })
                .filter((item): item is { locale: string; q: number } => item !== null)
                .sort((a, b) => b.q - a.q)
                .map(item => item.locale);

            return locales;
        } catch (error) {
            this.debug.warn('Error parsing Accept-Language header:', error);
            return [];
        }
    }

    /**
     * Finds the best matching locale from user preferences against supported locales.
     * Uses exact match first, then language-only match, then closest match.
     */
    private findBestLocaleMatch(userLocales: string[], supportedLocales: string[]): string | null {
        if (!userLocales.length || !supportedLocales.length) {
            return null;
        }

        // Normalize supported locales for comparison
        const normalizedSupported = supportedLocales.map(loc => this.normalizeLocale(loc));

        // Try exact matches first (highest priority)
        for (const userLocale of userLocales) {
            const normalizedUser = this.normalizeLocale(userLocale);
            if (normalizedSupported.includes(normalizedUser)) {
                return normalizedUser;
            }
        }

        // Try language-only matches (e.g., 'en' matches 'en-US', 'en-GB', etc.)
        for (const userLocale of userLocales) {
            const userLang = this.getLanguageCode(userLocale);
            for (const supported of normalizedSupported) {
                if (this.getLanguageCode(supported) === userLang) {
                    return supported;
                }
            }
        }

        // No match found - return null so caller can use user's preference
        return null;
    }

    /**
     * Normalizes locale format to lowercase language with uppercase region/country.
     * e.g., 'en-us' -> 'en-US', 'EN_US' -> 'en-US', 'fr' -> 'fr'
     */
    private normalizeLocale(locale: string): string {
        if (!locale || typeof locale !== 'string') return locale;

        const parts = locale.split(/[-_]/);
        if (parts.length === 1) {
            return parts[0].toLowerCase();
        }

        const language = parts[0].toLowerCase();
        const region = parts[1].toUpperCase();

        return `${language}-${region}`;
    }

    /**
     * Extracts language code from locale (e.g., 'en-US' -> 'en', 'fr-CA' -> 'fr')
     */
    private getLanguageCode(locale: string): string {
        if (!locale || typeof locale !== 'string') return '';
        return locale.split(/[-_]/)[0].toLowerCase();
    }
}

export const LangsysApp = new LangsysAppClass();

/**
 * Reactive svelte store for all translations.
 * Responsible for both translating in-app and for creating tokens in Translation Manager for translation.
 *
 * usage: <title>{$\_['This is my page title']}</title>
 * usage with categorization: <NavItem>{$_['{[UI]} This is my page title']}</NavItem>
 *
 * Categorization is useful specifically when wanting to keep things like UI translations separate from
 *  content translations. This may be because the word 'Home' should be translated differently for a
 *  main menu button than from a page talking about a person's home. By simply adding {[CATEGORY]} to your
 *  string intended for translation, you will give context to the translator.
 *
 * Every matching content string & category will only ever be translated once.
 */
export const { _ } = LangsysApp.Translations;

// export default Translate__SvelteComponent_;

export { default as Translate } from './components/Translate.svelte';
