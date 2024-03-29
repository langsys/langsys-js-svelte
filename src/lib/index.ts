// Reexport your entry components here
import type { iLangsysConfig } from './interface/config.js';
import type { ResponseObject } from './interface/api.js';
import LangsysAppAPI from './service/LangsysAppAPI.js';
import Translations from './js/Translations.js';
// import Translate from '../components/Translate.svelte';
// import { ComponentType, SvelteComponent } from 'svelte';
import { get, writable, type Writable } from 'svelte/store';
import type { iLocaleFlat, iLocaleData, iLocaleDefault } from './interface/locales.js';

export type { iLocaleFlat, iLocaleData, iLocaleDefault, iLanguageName } from './interface/locales.js';

class LangsysAppClass {
    private config: iLangsysConfig;

    public Translations: Translations;

    private locales: iLocaleData[];

    constructor() {
        this.config = {
            projectid: '',
            key: '',
            sUserLocale: writable(''),
            baseLocale: 'en',
        };
        this.Translations = new Translations(this.config);
        this.locales = [];
    }

    public async refresh() {
        const locale = get(this.config.sUserLocale);
        this.locales = [];
        return this.Translations.change(locale, true);
    }

    /**
     * Must be called once during app initialization before anything else!
     * @param projectid The ID (UUID) of the project created in Langsys for this app
     * @param key The API key associated to the configured projectid
     * @param UserLocaleStore A svelte-store Writable string with the user-selected locale
     * @param [baseLocale='en'] The base language/locale this app uses. ie: what language is put into the code?
     * @param [debug=false] {boolean} Set true to enable console messages
     */
    public async init(projectid: string, key: string, UserLocaleStore: Writable<string>, baseLocale = 'en', debug = false): Promise<ResponseObject> {
        if (!projectid) alert('LangsysApp.init missing projectid in configuration object!');
        else if (!key) alert('LangsysApp.init missing API key in configuration object!');
        else if (!UserLocaleStore?.subscribe) alert("LangsysApp.init missing UserLocaleStore, a svelte-store for the user's selected locale.");
        else {
            this.config = {
                projectid,
                key,
                sUserLocale: UserLocaleStore,
                baseLocale: baseLocale,
                debug,
            };

            // initialize Translation methods
            this.Translations.setup(this.config);
        }

        // validate api key & projectid config
        return await LangsysAppAPI.validate(this.config);
    }

    /**
     * Get list of all locale codes and names localized to inLocale or if not defined, sUserLocale, or if not defined, baseLocale
     * sUserLocale and baseLocale are both defined during LangsysApp.init()
     * @param [format='categorized'] 'categorized'|'flat'|'data' different data formats as documented
     * @param inLocale define which language to translate the results to
     * @returns iLocaleDefault | iLocaleFlat[] | iLocaleData[]
     */
    public async getLocales(format: '' | 'flat' | 'data' = '', inLocale?: string) {
        const locale = inLocale || get(this.config.sUserLocale) || this.config.baseLocale;
        const route = `locales/${locale}` + (format ? `/${format}` : '');
        const response = await LangsysAppAPI.get(route);

        if (response.errors || !response.status) alert('LangsysApp.getLocales failed: ' + route);

        switch (format) {
            case 'flat':
                return response.data as iLocaleFlat[];
            case 'data':
                return response.data as iLocaleData[];
            default:
                return response.data as iLocaleDefault;
        }
    }

    public async getLanguageName(forLocale: string, shortName = false, inLocale?: string) {
        if (!forLocale) return '';
        if (!this.locales.length) this.locales = (await this.getLocales('data', inLocale)) as iLocaleData[];

        let name = '';
        this.locales.every((locale) => {
            // window.console.log(`checking ${forLocale} in ${locale.code}`, locale);
            if (locale.code === forLocale) {
                name = shortName ? locale.lang_name : locale.locale_name;
                return false;
            }
            return true;
        });

        if (!name) window.console.warn('getLanguageName failed to match', forLocale);

        return name;
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
