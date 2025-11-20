// Reexport your entry components here
import { get, type Writable } from 'svelte/store';
import type { ResponseObject } from './interface/api.js';
import type { iLangsysConfig } from './interface/config.js';
import type { iCountryDialCode, iCountryList } from './interface/countries.js';
import type { iLocaleData, iLocaleDefault, iLocaleFlat } from './interface/locales.js';
import echo from './js/echo.js';
import Translations from './js/Translations.js';
import LangsysAppAPI from './service/LangsysAppAPI.js';
import config from './store/config.js';
export type { ResponseObject as iLangsysResponse } from './interface/api.js';
export type { iCountryDialCode, iCountryList } from './interface/countries.js';
export type { iProject } from './interface/iProject.js';
export type { iLanguageName, iLocaleData, iLocaleDefault, iLocaleFlat } from './interface/locales.js';

class LangsysAppClass {
    private config: iLangsysConfig;

    public Translations: Translations;
    public translationsLoadingPromise: Promise<any> = Promise.resolve();

    private locales: Record<string, iLocaleData[]>;

    private countries: iCountryList = [];
    private countriesLocale: string = '';

    private dialCodes: iCountryDialCode[] = [];
    private dialCodesLocale: string = '';

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
     * Must be called once during app initialization before anything else!
     * @param projectid The ID (UUID) of the project created in Langsys for this app
     * @param key The API key associated to the configured projectid
     * @param UserLocaleStore A svelte-store Writable string with the user-selected locale
     * @param [baseLocale='en'] The base language/locale this app uses. ie: what language is put into the code?
     * @param [debug=false] {boolean} Set true to enable console messages
     * @param [emulateFailureToLoad=false] {boolean} Set true to emulate Langsys failure to load
     */
    public async init(
        projectid: string,
        key: string,
        UserLocaleStore: Writable<string>,
        baseLocale = 'en',
        debug = false,
        emulateFailureToLoad = false
    ): Promise<ResponseObject> {
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

        if (!emulateFailureToLoad)
            this.config = {
                projectid,
                key,
                sUserLocale: UserLocaleStore,
                baseLocale: baseLocale,
                debug,
            };
        // config.projectid = projectid;
        // config.key = key;
        // config.sUserLocale = UserLocaleStore;
        // config.baseLocale = baseLocale;
        // config.debug = debug;


        // validate api key & projectid config
        const validateResponse = await LangsysAppAPI.validate(this.config);

        // Store the key_type from the authorization response
        if (validateResponse.status && validateResponse.data) {
            const authData = validateResponse.data as any;
            if (authData.key_type) {
                this.config.key_type = authData.key_type;
                config.key_type = authData.key_type;
                this.debug.log('API Key Type:', this.config.key_type);
                echo.log(`API Key Type:`, this.config.key_type);
            }
        }

        // initialize Translation methods
        this.Translations.setup(this.config);

        // prefetch locale data for the user's current locale
        this.config.sUserLocale.subscribe((locale) => {
            if (validateResponse.status) {
                this.getLocalesData(locale);
                // subscribe to the user locale store so we can listen for change of locale
                this.debug.log('SUBSCRIBING TO USER LOCALE STORE');
                this.translationsLoadingPromise = this.Translations.change(locale);
            }
        });

        // if (validateResponse.status) this.getLocalesData();

        return validateResponse;
    }

    /**
     * Get localized list of all country dialCodes
     * @param inLocale define which language to translate the results to
     *
     */
    public async getDialCodes(inLocale?: string) {
        const locale = inLocale || get(this.config.sUserLocale) || this.config.baseLocale;

        if (this.dialCodes.length && this.dialCodesLocale === locale) return this.dialCodes;

        const route = `countries/dial-code/${locale}`;
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
