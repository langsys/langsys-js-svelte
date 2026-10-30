import type { RequestEvent } from '@sveltejs/kit';
import { LangsysApp as CoreApp, type iCategories } from 'langsys-js-typescript';
import { writable } from 'svelte/store';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LangsysApp } from '$lib/index.js';
import { createLangsysHandle } from '$lib/kit/server.js';
import { startClone, type Case, type Clone } from './clone.js';

/**
 * REF-1 in a binding: the reference lists are the core's calls, forwarded (BIND-6). A list call
 * through the binding answers the list the core holds with no further request, a list not held
 * goes out as the core's own read, and the binding sends nothing of its own. Through
 * `createLangsysHandle` a call with no locale names its list in the request's locale (SRV-6).
 *
 * Against an SDK test clone through the contract fixture's forwarder (CONF-2), whose crafted
 * reference lists (`/__fixture/setup`'s `reference`) answer the list routes once the clone has
 * accepted the request, each named in the display locale through ICU, so each locale answers a list
 * of its own. A call that must not send is shown twice: at the fetch seam, and by giving the case
 * other tables, so that a read would answer a different list. The case is
 * `_dev_/contract/cases.mjs`'s suite 7.
 */
const REFERENCE = {
    locales: ['fr-fr', 'es-es', 'en-us', 'de-de'],
    countries: [{ code: 'ES' }, { code: 'CR' }, { code: 'US' }],
    dial_codes: [
        { country_code: 'ES', dial_code: '34' },
        { country_code: 'CR', dial_code: '506' },
    ],
    currencies: [
        { code: 'EUR', name: 'Euro', symbol: '€' },
        { code: 'CRC', name: 'Costa Rican Colón', symbol: '₡' },
    ],
};
/** Other tables, so that a read made after the case is given them answers a different list. */
const OTHER = {
    locales: ['it-it', 'es-es', 'en-us', 'fr-fr', 'de-de'],
    countries: [{ code: 'IT' }],
    dial_codes: [{ country_code: 'IT', dial_code: '39' }],
    currencies: [{ code: 'CHF', name: 'Swiss Franc', symbol: 'CHF' }],
};
/** The case's organisation's locale code format, beside its tables, as the forwarder takes them. */
const tables = (reference: object) => ({ ...reference, locale_code_format: 'lowercase-hyphen' });

type App = Pick<typeof CoreApp, 'getLocales' | 'getLocalesFlat' | 'getLocalesData' | 'getCurrencies' | 'getCountries' | 'getDialCodes'>;
const LISTS: { name: keyof App; route: string }[] = [
    { name: 'getLocales', route: 'locales' },
    { name: 'getLocalesFlat', route: 'locales/flat' },
    { name: 'getLocalesData', route: 'locales/data' },
    { name: 'getCurrencies', route: 'currencies' },
    { name: 'getCountries', route: 'countries' },
    { name: 'getDialCodes', route: 'countries/dial-codes' },
];
const call = (app: App, name: keyof App, locale?: string) => (app[name] as (locale?: string) => Promise<unknown>)(locale);

let clone: Clone;
let c: Case;
const give = (reference: object) => clone.update(c, { reference: tables(reference) });
/** Every request sent to the API, as its route and the display locale a locale form asks for. */
let sent: string[] = [];
/** The request the core sends for one list in one display locale, in the form `sent` records it. */
const read = (route: string, locale: string) => (route.startsWith('locales') ? `${route} ${locale}` : `${route}/${locale}`);

beforeAll(async () => {
    clone = await startClone();
    c = clone.caseOf(7, 1);
    await give(REFERENCE);
    for (const m of ['log', 'info', 'warn', 'error', 'group', 'groupCollapsed', 'groupEnd'] as const) vi.spyOn(console, m).mockImplementation(() => {});
    const realFetch = globalThis.fetch;
    const api = new URL(clone.base);
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (url.origin === api.origin && url.pathname.startsWith(`${api.pathname}/`)) {
            const route = url.pathname.slice(api.pathname.length + 1);
            const locales = url.searchParams.getAll('locales[]');
            sent.push(locales.length ? `${route} ${locales.join(',')}` : route);
        }
        return realFetch(input, init);
    });
    await LangsysApp.init({ projectid: c.projects.app.id, key: c.keys.read.key, UserLocaleStore: writable('fr-fr'), baseLocale: 'en', apiUrl: clone.base });
    // init() reads the current locale's locale data ahead of getLocaleName; let that read land first.
    await LangsysApp.getLocalesData();
});
afterAll(() => {
    vi.restoreAllMocks();
    clone?.stop();
});
beforeEach(async () => {
    await give(REFERENCE);
    sent = [];
});

describe('REF-1: the binding forwards the core’s reference lists', () => {
    it.each(LISTS)('$name answers the list the core holds with no request, and a list not held is the core’s own read', async ({ name, route }) => {
        const held = await call(CoreApp, name, 'es-es');
        expect(sent).toEqual([read(route, 'es-es')]);
        // Control: es-es's list is a list of its own, not an empty answer.
        expect(held).not.toEqual(await call(CoreApp, name, 'en-us'));
        expect(JSON.stringify(held)).not.toMatch(/^(\[\]|\{\})$/);

        await give(OTHER);
        sent = [];
        // The binding answers the core's held list: nothing is sent, and a read would now answer another list.
        expect(await call(LangsysApp, name, 'es-es')).toEqual(held);
        expect(sent).toEqual([]);
        // A display locale not held goes out once, as the core's read, and nothing else is sent.
        const de = await call(LangsysApp, name, 'de-de');
        expect(sent).toEqual([read(route, 'de-de')]);
        expect(de).toEqual(await call(CoreApp, name, 'de-de'));
        expect(sent).toEqual([read(route, 'de-de')]);
    });
});

describe('REF-1 through createLangsysHandle: a call with no locale names its list in the request’s locale', () => {
    // The catalog is handed over, so the scope reads none and the lists are all a request sends.
    const handle = createLangsysHandle({ locale: (event) => event.url.searchParams.get('locale') ?? 'en', catalog: () => ({}) as iCategories, seed: false });
    /** One request through the handle, whose page is the countries list read inside it. */
    async function countriesIn(query: string): Promise<unknown> {
        const event = { url: new URL(`http://app.test/?${query}`) } as unknown as RequestEvent;
        const resolve = async () => new Response(JSON.stringify(await LangsysApp.getCountries()));
        return (await handle({ event, resolve } as unknown as Parameters<typeof handle>[0])).json();
    }

    it('the request’s locale, not the store’s, and a later request answers the held list with no request', async () => {
        // The store's locale is fr-fr: outside a request, that is the display locale.
        const fr = await LangsysApp.getCountries();
        expect(fr).toEqual(await CoreApp.getCountries('fr-fr'));
        sent = [];
        const italian = await countriesIn('locale=it-it');
        expect(sent).toEqual([read('countries', 'it-it')]);
        expect(italian).toEqual(await CoreApp.getCountries('it-it'));
        expect(italian).not.toEqual(fr);
        // A second request in that locale, with other tables given: the held list, nothing sent.
        await give(OTHER);
        sent = [];
        expect(await countriesIn('locale=it-it')).toEqual(italian);
        expect(sent).toEqual([]);
    });
});
