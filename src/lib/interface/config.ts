import type { Writable } from 'svelte/store';

export interface iLangsysConfig {
    /**
     * The ID of the project created in Langsys for this app
     */
    projectid: number;
    /**
     * The API key associated with the configured projectid
     */
    key: string;

    /**
     * A svelte-store Writable string with the user-selected locale
     * Automatically switches translations when this store changes locales.
     */
    sUserLocale: Writable<string>;

    /**
     * This project's base locale (the language used in code)
     */
    baseLocale: string;

    /**
     * Enable debug console messages
     */
    debug?: boolean;
}
