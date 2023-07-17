import { derived, get, type Readable } from 'svelte/store';
import sTranslations from '../store/translations.js';
import type { tidbStore } from './idbStore.js';
import LangsysAppAPI from '../service/LangsysAppAPI.js';
import type { iLangsysConfig } from '../interface/config.js';
import type { iTranslations } from '../interface/translations.js';
import type { ResponseObject } from '../interface/api.js';

interface iTokenUpdate {
    projectid: number;
    category: string;
    token: string;
}

function in_array(array, selector) {
    if (typeof selector === 'string') return array.indexOf(selector) > -1 ? true : false;
    return (
        array.filter(function (e) {
            for (const p in selector) if (e[p] !== selector[p]) return false;
            return true;
        }).length > 0
    );
}

class Translations {
    private config: iLangsysConfig;

    public data: tidbStore<iTranslations> = sTranslations;
    public _: Readable<tidbStore<iTranslations>>;

    private locale: string;
    private lastLoaded: Record<string, number> = {}; // remember time when a local => wasLastLoaded
    private missingTokens: iTokenUpdate[] = [];
    private timer;

    private debug = {
        debugEnabled: false,
        log: (msg: any, context?: any) => {
            if (this.config?.debug) window.console.log(msg, context);
        },
        warn: (msg: any, context?: any) => {
            if (this.config?.debug) window.console.warn(msg, context);
        },
        error: (msg: any, context?: any) => {
            if (this.config?.debug) window.console.error(msg, context);
        },
    };

    constructor(config: iLangsysConfig) {
        this.config = config;
        this.debug.debugEnabled = this.config?.debug || false;
        this.locale = this.config.baseLocale;

        // this magic tidbit here makes a readonly copy of translations and combines it with a magic get Proxy method
        // enables us to use $_[token] in the code while handling tokens that do not exist as well
        this._ = derived(sTranslations, ($trans) => {
            const handler = {
                get: (target: iTranslations, fulltoken: string) => {
                    let category = '';
                    let token = fulltoken;
                    const match = fulltoken.match(/{\[([a-z0-9\s_\-.]*)\]}\s?/i);
                    let missingToken: iTokenUpdate;
                    if (match) {
                        category = match[1];
                        token = token.replace(match[0], '');
                        missingToken = { category, token, projectid: this.config.projectid };
                    } else missingToken = { category: '', token, projectid: this.config.projectid };

                    // if translation exists, return it
                    if (Object.keys(target).indexOf(fulltoken) >= 0) return target[fulltoken] === null ? token : target[fulltoken];

                    if (!in_array(this.missingTokens, missingToken)) this.missingTokens.push(missingToken);
                    // if (this.missingTokens.indexOf(missingToken) === -1) this.missingTokens.push(missingToken);

                    this.debug.log('TOKEN MISSING', `${fulltoken}`);
                    this.debug.log('CURRENT DATA', { ...get(this.data) });

                    // no translation exists, return the token
                    return token;
                },
            };

            return new Proxy($trans, handler);
        });

        if (!this.config.projectid || !this.config.key) return;

        // post missing tokens back to translation server so they can become translatable tokens
        this.debug.log('LANG CONSTRUCTOR INITIATED');

        // here we run an update on the missingTokens every 3 seconds
        this.timer = setInterval(this.updateTokens.bind(self), 3000);

        // subscribe to the user locale store so we can listen for change of locale
        this.config.sUserLocale.subscribe((locale) => {
            this.change(locale);
        });
    }

    /**
     * Listener for the sUser.locale change, fires getTranslations if needed
     * @param locale
     * @returns boolean
     */
    private async change(locale: string) {
        if (!locale) return false;
        const currentTime = new Date().getTime() / 1000;

        // if we've loaded this locale in the last 60 seconds don't do it again
        if (locale === this.locale && this.lastLoaded[locale] && Math.abs(this.lastLoaded[locale] - currentTime) < 60) return false;

        this.debug.log('Locale change detected!', locale);

        this.locale = locale;
        await this.getTranslations();
        return true;
    }

    /**
     * Update langsys api with app tokens
     * Any tokens used by this app, that do not yet have a match in the translations returned
     * by api server, will get put into this.missingTokens as they are called upon by the app.
     * This method posts those missing tokens to the langsys api so that they may be added to the
     * list of things that need translated.
     * @returns boolean true if token response was sent, false if not
     */
    private async updateTokens() {
        if (!this.missingTokens.length) return false;

        this.debug.warn('MISSINGTOK', this.missingTokens);
        LangsysAppAPI.post('projects/[projectid]/tokens', this.missingTokens)
            .then((response: ResponseObject) => {
                if (!response.status) {
                    if (response.errors) {
                        this.debug.log('TOKEN UPDATE FAIL', this.missingTokens);
                        this.debug.error('Error updating project tokens', response.errors);
                    }
                }

                this.missingTokens.map((tokenObj) => {
                    this.data[tokenObj.token] = tokenObj.token;
                });
                this.missingTokens = [];
                return true;
            })
            .catch(() => {
                this.debug.log('catch TOKEN UPDATE FAIL', this.missingTokens);
                this.debug.error('Error updating project tokens');
            });
    }

    /**
     * Get Translations for current locale from remote API
     * @returns boolean true on success, false on error
     */
    private async getTranslations() {
        return await LangsysAppAPI.getTranslations(this.locale).then((response: ResponseObject) => {
            this.debug.log('TOKENS', response);
            if (response.errors) {
                this.debug.error('Error', response.errors[0]);
                return;
            }
            const trans = response.data as iTranslations;

            this.debug.log('getTranslations', trans);

            sTranslations.set(trans);
            this.lastLoaded[this.locale] = new Date().getTime() / 1000;
        });
    }
}

// const _ = instance.data.trans;

export default Translations;
