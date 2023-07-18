// Reexport your entry components here
import type { iLangsysConfig } from './interface/config.js';
import type { ResponseObject } from './interface/api.js';
import LangsysAppAPI from './service/LangsysAppAPI.js';
import Translations from './js/Translations.js';
import { writable, type Writable } from 'svelte/store';

class LangsysAppClass {
    private config: iLangsysConfig;

    public Translations: Translations;

    constructor() {
        this.config = {
            projectid: '',
            key: '',
            sUserLocale: writable(''),
            baseLocale: 'en',
        };
        this.Translations = new Translations(this.config);
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
