import { derived, get, writable, type Readable } from 'svelte/store';
import sTranslations from '../store/translations.js';
import type { tidbStore } from './idbStore.js';
import LangsysAppAPI from '../service/LangsysAppAPI.js';
import type { iLangsysConfig } from '../interface/config.js';
import type { iCategories, iTranslations } from '../interface/translations.js';
import type { ResponseObject } from '../interface/api.js';

interface iTokenUpdate {
    projectid: string;
    category: string;
    token: string;
}

function isset(test: any) {
    return test !== undefined;
}
function is_object(test: any) {
    return typeof test === 'object' && !Array.isArray(test) && test !== null;
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

    public data: tidbStore<iCategories>;
    public _: Readable<iCategories>;

    private locale: string;
    private lastLoaded: Record<string, number> = {}; // remember time when a local => wasLastLoaded
    private missingTokens: iTokenUpdate[];
    private timer;

    private debug = {
        debugEnabled: false,
        log(msg: any, context?: any) {
            if (this.debugEnabled) window.console.log(...arguments);
        },
        warn(msg: any, context?: any) {
            if (this.debugEnabled) window.console.warn(...arguments);
        },
        error(msg: any, context?: any) {
            if (this.debugEnabled) window.console.error(...arguments);
        },
    };

    constructor(config: iLangsysConfig) {
        this.config = config;
        this.missingTokens = [];
        if (this.config?.debug) this.debug.debugEnabled = this.config.debug;
        this.locale = config.baseLocale || '';

        // this magic tidbit here makes a readonly copy of translations and combines it with a magic get Proxy method
        // enables us to use $_[token] in the code while handling tokens that do not exist as well
        this._ = derived(sTranslations, ($trans) => {
            // handler for the first tier call ie: $_['Menu']
            const handlerCat = {
                get: (targetx: iCategories, cat: string): any => {
                    // this.debug.log('CATEGORY LOOKUP', [cat, targetx]);

                    let target = structuredClone(targetx);

                    // don't handle invalid tokens
                    if (cat === undefined || cat === '') return cat;

                    // this gets called when its the end of the line: ie: $_['Menu'] with no 2nd tier
                    // allows for uncategorized tokens
                    if (typeof cat === 'symbol' || cat === '__symbol__' || cat === 'constructor' || cat.indexOf('Symbol(Symbol') > -1) {
                        const token = target.__symbol__;
                        this.debug.log('cat symbol call', [cat, target]);

                        target = $trans.__uncategorized__;

                        let translation: string;
                        if (!isset(target[token])) {
                            this.missingToken('', token);
                            translation = token;
                        } else {
                            translation = target[token] || token;
                        }

                        // return translation;
                        return () => {
                            return translation;
                        };
                    }

                    // if the category does not yet exist, create it
                    if (!is_object(target[cat])) {
                        target[cat] = {
                            __category__: cat, // reference to the key of this object
                            __symbol__: cat, // reference to the token in the case this is a 1 tier call, is used by symbol logic above
                        } as iTranslations;
                    }

                    return new Proxy(target[cat], handlerTrans);
                },
            };

            // handler for the 2nd tier call ie: $_['Menu']['Dashboard']
            const handlerTrans = {
                get: (targetx: iTranslations, token: string) => {
                    this.debug.log('TRANSLATION LOOKUP', [token, targetx]);
                    let target = structuredClone(targetx);

                    // 2nd tier end of the line
                    // enables cases where a category and uncategorized token may be the same string ie:  $_['Menu']['Whatever'] & $_['Menu']
                    if (typeof token === 'symbol' || token === '__symbol__' || token === 'constructor' || token.indexOf('Symbol(Symbol') > -1) {
                        token = target.__symbol__ || target.__category__; // if this is 2nd tier, target will have a __symbol__ set by handlerCat
                        // this.debug.log('trans symbol call', [token, target, $trans]);
                        target = $trans.__uncategorized__;
                        this.debug.log('trans symbol call', [token, target, $trans]);

                        let translation: string;
                        const category: string = target.__category__ || '';
                        if (!isset(target[token])) {
                            this.missingToken(category, token);
                            translation = token;
                        } else {
                            translation = (target[token] as string) || token;
                            this.debug.log('translation found', translation);
                        }

                        // return translation;
                        return () => {
                            return translation;
                        };
                    }

                    if (isset(target[token])) {
                        this.debug.log('Token final lookup');
                        const translation = (target[token] as string) || token;
                        if (target[token] !== null) this.debug.log('TRANSLATION FOUND', translation);

                        return translation;
                    } else {
                        this.missingToken(target.__category__ || '', token);
                        return token;
                    }
                },
            };

            return new Proxy($trans, handlerCat);
        });

        if (config.key && config.projectid) this.setup(config);
    }

    private missingToken(category: string, token: string) {
        if (token === 'toJSON') return this.debug.error(`Received toJSON as token {category}:{token}`);
        const missingToken = { category, token, projectid: this.config.projectid } as iTokenUpdate;
        if (!in_array(this.missingTokens, missingToken)) {
            this.debug.log('MISSING TOKEN LOOKUP FAILED', [missingToken, [...this.missingTokens], { ...get(sTranslations) }]);
            this.missingTokens.push(missingToken);
        }
    }

    public setup(config: iLangsysConfig) {
        this.config = config;

        if (!this.config.projectid || !this.config.key) return;

        if (this.config?.debug) this.debug.debugEnabled = this.config.debug;
        if (config.baseLocale) this.locale = config.baseLocale;

        // post missing tokens back to translation server so they can become translatable tokens
        this.debug.log('TRANSLATION SETUP INITIATED', this.config);

        // here we run an update on the missingTokens every 3 seconds
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(this.updateTokens.bind(this), 3000);
        this.debug.log('UPDATE TOKEN INTERVAL', this.timer);

        // subscribe to the user locale store so we can listen for change of locale
        this.debug.log('SUBSCRIBING TO USER LOCALE STORE');
        this.config.sUserLocale.subscribe((locale) => {
            this.change(locale);
        });
    }

    /**
     * Listener for the sUser.locale change, fires getTranslations if needed
     * @param locale
     * @returns boolean
     */
    public async change(locale: string, force = false) {
        if (!locale) return false;
        if (!this.config.projectid || !this.config.key) return false;
        const currentTime = new Date().getTime() / 1000;

        // if we've loaded this locale in the last 60 seconds don't do it again
        if (!force && locale === this.locale && this.lastLoaded[locale] && Math.abs(this.lastLoaded[locale] - currentTime) < 60) return false;

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
        if (!Object.keys(this.missingTokens).length) return false;
        if (!this.config.projectid || !this.config.key) return false;

        this.debug.log('CREATE MISSING TOKENS', this.missingTokens);
        LangsysAppAPI.post('tokens/[projectid]', { tokens: this.missingTokens })
            .then((response: ResponseObject) => {
                if (!response.status) {
                    if (response.errors) {
                        this.debug.log('TOKEN UPDATE FAIL', this.missingTokens);
                        this.debug.error('Error updating project tokens', response.errors);
                        return false;
                    }
                    return false;
                }

                const currentData = get(sTranslations);
                this.missingTokens.map((tokenObj) => {
                    if (!currentData[tokenObj.category]) currentData[tokenObj.category] = {};
                    currentData[tokenObj.category][tokenObj.token] = tokenObj.token;
                    currentData[tokenObj.category]['__category__'] = tokenObj.category;
                    // const tokenKey = tokenObj.category ? `{[${tokenObj.category}]} ${tokenObj.token}` : tokenObj.token;
                    // currentData[tokenKey] = null;
                });
                sTranslations.set(currentData);
                this.missingTokens = [];
                return true;
            })
            .catch((error) => {
                this.debug.log('CREATE MISSING TOKEN FAILURE', this.missingTokens);
                this.debug.error('Error updating project tokens', error);
            });
    }

    /**
     * Get Translations for current locale from remote API
     * @returns boolean true on success, false on error
     */
    private async getTranslations() {
        if (!LangsysAppAPI.config.projectid && this.config.projectid) LangsysAppAPI.setup(this.config);

        return await LangsysAppAPI.getTranslations(this.locale).then((response: ResponseObject) => {
            this.debug.log('GET TRANSLATIONS API RESPONSE', response);
            if (response.errors) {
                this.debug.error('Error', response.errors[0]);
                return;
            }

            const trans = response.data as iTranslations;

            if (!is_object(trans['__uncategorized__'])) trans['__uncategorized__'] = {};

            Object.keys(trans).forEach((cat) => {
                trans[cat]['__category__'] = cat;
                // if (isset(trans['__uncategorized__'][cat])) trans[cat]['__DirectToken__'] = { token: cat, trans: trans['__uncategorized__'][cat] };

                // const match = token.match(/^{\[([a-z0-9\s_\-.]*)\]}\s?/i);
                // if (match) {
                //     const category = match[1];
                //     token = token.replace(match[0], '');
                //     const existing = (typeof trans[category] === 'string' || trans[category] === null) ? trans[category] : undefined;
                //     this.debug.log(existing, category);
                //     if (trans[category] === null || typeof trans[category] !== 'object') trans[category] = {} as iTranslations;
                //     trans[category][token] = val;
                //     if (existing !== undefined && trans[category]['__DirectToken__'] === undefined)
                //         trans[category]['__DirectToken__'] = {token: category, trans: existing};
                // }
            });

            this.debug.log('GET TRANSLATIONS ' + this.locale, trans);

            sTranslations.set(trans);
            this.lastLoaded[this.locale] = new Date().getTime() / 1000;
        });
    }
}

// const _ = instance.data.trans;

export default Translations;
