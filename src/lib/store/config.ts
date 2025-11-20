import type { iLangsysConfig } from '$lib/interface/config.js';
import { writable } from 'svelte/store';

export const config: iLangsysConfig = {
    projectid: '',
    key: '',
    sUserLocale: writable(''),
    baseLocale: 'en',
    debug: false,
    key_type: 'read',
};

export default config;
