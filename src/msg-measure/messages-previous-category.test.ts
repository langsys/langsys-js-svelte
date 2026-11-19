import { sTranslations, type iCategories, type ServerMessage } from 'langsys-js-typescript';
import { get, writable } from 'svelte/store';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LangsysApp, serverMessage, type iLangsysInitConfig } from '$lib/index.js';

/**
 * MSG-5 and MSG-6 with a renamed messages category: `messagesCategory` `Messages`, moved from
 * `Errors` (`messagesPreviousCategory`), set through this binding's typed `init`. The core's
 * `renderServerMessage` then calls `t()` with `inCategory('Messages', { previousCategory: 'Errors' })`;
 * what this proves is that the option reaches it through the Svelte `init` override and that
 * `$serverMessage` renders by it. Its own file: a second `init()` in one process is a no-op.
 */
const BASE = 'http://api.seam.test/api';
const PROJECT = {
    id: 'p1',
    base_locale: 'en-us',
    target_locales: ['es-es'],
    default_locales: { es: 'es-es' },
    key_type: 'read',
    write_enabled: false,
    auto_discovery: false,
    discovery_base_locale_only: false,
    langsys_settings: { translatable_items: { batch_limit: 200 } },
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const ONLY_OLD = 'The password must be at least {min} characters.';
const BOTH = 'The email has already been taken.';
const NEITHER = 'The name field is required.';
const CATALOG = {
    Errors: {
        [ONLY_OLD]: 'La contraseña debe tener al menos {min} caracteres.',
        [BOTH]: 'El correo ya está en uso (Errors).',
    },
    Messages: { [BOTH]: 'El correo ya está en uso.' },
} as unknown as iCategories;

const entry = (template: string, message: string, params?: Record<string, unknown>): ServerMessage => ({ field: 'f', code: 'c', message, template, params });

beforeAll(async () => {
    for (const m of ['log', 'info', 'warn', 'group', 'groupCollapsed', 'groupEnd'] as const) vi.spyOn(console, m).mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const path = new URL(input instanceof Request ? input.url : String(input)).pathname.slice(new URL(BASE).pathname.length);
        if (/^\/authorize-project\/[^/]+$/.test(path)) return json(200, { status: true, data: PROJECT });
        if (path === '/translations' || path === '/translations/data') return json(200, { status: true, write_enabled: false, data: [] });
        return json(200, { status: true, data: [] });
    });
    // Typed: the Svelte config type carries the core's option by inheritance.
    const config: iLangsysInitConfig = {
        projectid: 'p1',
        key: 'k-read',
        UserLocaleStore: writable('es-es'),
        baseLocale: 'en-us',
        apiUrl: BASE,
        messagesCategory: 'Messages',
        messagesPreviousCategory: 'Errors',
    };
    const res = await LangsysApp.init(config);
    expect(res.status, 'premise: the session initialised').toBe(true);
    // init's own catalog fetch publishes first, so the seed is what the lookups read.
    await LangsysApp.translationsLoadingPromise;
    LangsysApp.seedCatalog(structuredClone(CATALOG), 'es-es');
});

afterAll(() => {
    sTranslations.set({} as iCategories);
    vi.restoreAllMocks();
});

describe('MSG-6 — the messages category and its previous one, through the Svelte init', () => {
    it("renders a template translated only under the previous category from that category's entry", () => {
        expect(get(serverMessage)(entry(ONLY_OLD, 'The password must be at least 12 characters.', { min: 12 }))).toBe(
            'La contraseña debe tener al menos 12 caracteres.'
        );
    });

    it("renders the current category's entry once it holds one", () => {
        expect(get(serverMessage)(entry(BOTH, 'The email has already been taken.'))).toBe('El correo ya está en uso.');
    });

    it("shows the entry's message when neither category holds the template", () => {
        expect(get(serverMessage)(entry(NEITHER, 'The name field is required.'))).toBe('The name field is required.');
    });

    it('names no move for a category given at the call that is not the configured one', () => {
        expect(get(serverMessage)(entry(ONLY_OLD, 'The password must be at least 12 characters.', { min: 12 }), 'Other')).toBe(
            'The password must be at least 12 characters.'
        );
    });
});
