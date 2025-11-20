import currentlyLoadedLocale from '$lib/store/currentlyLoadedLocale.js';
// import structuredClone from '@ungap/structured-clone';
import { derived, get, type Readable } from 'svelte/store';
import type { ResponseObject } from '../interface/api.js';
import type { iLangsysConfig } from '../interface/config.js';
import type { iCategories, iTranslations } from '../interface/translations.js';
import LangsysAppAPI from '../service/LangsysAppAPI.js';
import sTranslations from '../store/translations.js';
import echo from './echo.js';
import type { PersistentStore } from './store.js';

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
function in_array(array: any[], selector: string | Record<string, any>) {
    if (typeof selector === 'string') return array.indexOf(selector) > -1 ? true : false;
    return (
        array.filter(function (e) {
            for (const p in selector) if (e[p] !== selector[p]) return false;
            return true;
        }).length > 0
    );
}

function structuredCloneShim<T>(obj: T): T {
    if (typeof structuredClone === 'function') {
        return (structuredClone as any)(obj);
    }

    // Fallback implementation if native structuredClone is not available
    function deepClone<T>(o: T): T {
        if (typeof o !== 'object' || o === null) {
            return o;
        }

        if (Array.isArray(o)) {
            return o.map((item) => (typeof item === 'object' && item !== null ? deepClone(item) : item)) as T;
        }

        const newO: Record<string, any> = {};
        for (const key in o) {
            if (Object.prototype.hasOwnProperty.call(o, key)) {
                const value = o[key];
                newO[key] = typeof value === 'object' && value !== null ? deepClone(value) : value;
            }
        }
        return newO as T;
    }

    return deepClone(obj);
}

class Translations {
    private config: iLangsysConfig;

    public data!: PersistentStore<iCategories>; // Note: This property appears to be unused
    public _: Readable<iCategories>;

    private locale: string;
    private lastLoaded: Record<string, number> = {}; // remember time when a local => wasLastLoaded
    private missingTokens: iTokenUpdate[];
    private timer: any;

    public debug = {
        debugEnabled: false,
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

                    // const target = structuredClone(targetx);
                    const target = structuredCloneShim(targetx);

                    // don't handle invalid tokens
                    if (cat === undefined || cat === '') {
                        this.debug.warn(`Received empty category`, cat);
                        return cat;
                    }

                    // this gets called when its the end of the line: ie: $_['Menu'] with no 2nd tier
                    // allows for uncategorized tokens
                    if (typeof cat === 'symbol' || cat === '__symbol__' || cat === 'constructor' || cat.indexOf('Symbol(Symbol') > -1) {
                        const token = target.__symbol__.toString().trim();
                        this.debug.log('cat symbol call', [cat, target]);

                        const newtarget = $trans.__uncategorized__;

                        let translation: string;
                        if (!isset(newtarget[token])) {
                            this.missingToken('', token);
                            translation = token;
                        } else {
                            translation = newtarget[token] || token;
                        }

                        // return translation;
                        return () => {
                            return translation;
                        };
                    }

                    // if the category does not yet exist, create it
                    cat = cat.trim();
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
                    // let target = structuredClone(targetx);
                    let target = structuredCloneShim(targetx);

                    // don't handle invalid tokens
                    if (token === undefined || token === '') {
                        this.debug.warn(`Received empty token`, token);
                        return token;
                    }

                    // 2nd tier end of the line
                    // enables cases where a category and uncategorized token may be the same string ie:  $_['Menu']['Whatever'] & $_['Menu']
                    if (typeof token === 'symbol' || token === '__symbol__' || token === 'constructor' || token.indexOf('Symbol(Symbol') > -1) {
                        token = target.__symbol__ || target.__category__; // if this is 2nd tier, target will have a __symbol__ set by handlerCat
                        // this.debug.log('trans symbol call', [token, target, $trans]);
                        target = $trans.__uncategorized__;
                        token = token.trim();
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

                    token = token.trim();
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

    private missingToken(category: string, token: string | undefined | null) {
        // Check if token is undefined or null
        if (token === undefined || token === null) {
            return this.debug.warn(`Received undefined or null token for category: ${category}`);
        }

        // Don't collect missing tokens if API key is read-only
        if (this.config.key_type !== 'write') {
            this.debug.log(`Skipping missing token collection (API key is ${this.config.key_type || 'unknown'}):`, { category, token });
            return;
        }

        // ignore content id tokens (strings looking like 7a77d7a0d8a62a20984057e1cac8503e)
        // these end up here because Translate component is looking for a content block id that doesn't exist
        if (token.match(/^[0-9a-f]{32}$/)) return;
        // ignore toJSON tokens
        if (token === 'toJSON') return this.debug.error(`Received toJSON as token ${category}:${token}`, token);
        // ignore empty tokens
        if (token === '') return this.debug.warn(`Received empty token`, token);

        // ignore if already in the array
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
        
        // Don't send missing tokens if API key is read-only
        if (this.config.key_type !== 'write') {
            this.debug.log(`Skipping token updates (API key is ${this.config.key_type || 'unknown'})`);
            return false;
        }

        // Update missing tokens with project ID and remove any that already exist in translations
        const currentData = get(sTranslations);
        this.missingTokens = this.missingTokens.filter(tokenObj => {
            tokenObj.projectid = this.config.projectid;

            if (tokenObj.category in currentData && tokenObj.token in currentData[tokenObj.category]) {
                this.debug.log('Missing token already exists! Skipping:', {
                    category: tokenObj.category,
                    token: tokenObj.token,
                    existing: currentData[tokenObj.category][tokenObj.token]
                });
                return false;
            }
            return true;
        });

        if (!this.missingTokens.length) return false;

        this.debug.log('CREATE MISSING TOKENS', this.missingTokens);
        LangsysAppAPI.post('projects/[projectid]/tokens', { tokens: this.missingTokens })
            .then((response: ResponseObject) => {
                if (!response.status) {
                    if (response.errors) {
                        this.debug.log('TOKEN UPDATE FAIL', this.missingTokens);
                        this.debug.error('Error updating project tokens', response.errors);
                        return false;
                    }
                    return false;
                }

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

            const trans = response.data as iCategories;

            if (!is_object(trans['__uncategorized__'])) {
                trans['__uncategorized__'] = {
                    __category__: '__uncategorized__',
                    __symbol__: '__uncategorized__'
                } as iTranslations;
            }

            Object.keys(trans).forEach((cat) => {
                // console.log('Category', cat, trans);
                // if (!trans[cat]) trans[cat] = {};
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
            setTimeout(() => {
                currentlyLoadedLocale.set(this.locale);
            }, 100);
            this.lastLoaded[this.locale] = new Date().getTime() / 1000;
        });
    }
}

// const _ = instance.data.trans;

export default Translations;
