import { LangsysApp, sTranslations, type iCategories, type ServerMessage } from 'langsys-js-typescript';
import { render } from 'svelte/server';
import { get } from 'svelte/store';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveServerMessages, serverMessage } from '$lib/index.js';
import vectors from '../../vectors/server-message-vectors.json';
import InertiaErrors from './InertiaErrors.svelte';

/**
 * MSG-5 and MSG-12, through this binding. The fallback decision is the core's; these rows prove
 * the Svelte wrapper hands every entry to it unchanged, reacts to catalog changes, and that a
 * page given entries as a prop renders them through it.
 *
 * `vectors/server-message-vectors.json` is vendored byte-exact from langsys-js-typescript and
 * cited by git blob in CONFORMANCE.md. Its `render` rows are run here, through `$serverMessage`.
 */

type RenderRow = { id: string; locale: string; category: string; catalog: iCategories | null; entry: ServerMessage; expected: string };

const seed = (catalog: iCategories | null, locale: string) => LangsysApp.seedCatalog(structuredClone(catalog ?? {}) as iCategories, locale);

afterEach(() => sTranslations.set({} as iCategories));

describe('MSG-5 — $serverMessage renders every shared vector the core defines', () => {
    const rows = (vectors as unknown as { render: RenderRow[] }).render;

    it('control: the vendored file carries render rows to run', () => {
        expect(rows.length).toBeGreaterThanOrEqual(10);
    });

    it.each(rows.map((r) => [r.id, r] as const))('%s', (_id, row) => {
        seed(row.catalog, row.locale);
        expect(get(serverMessage)(row.entry, row.category)).toBe(row.expected);
    });
});

describe('MSG-5 — the wrapper is reactive, which is all it adds', () => {
    const entry: ServerMessage = {
        field: 'password',
        code: 'mismatch',
        message: 'The password confirmation does not match.',
        template: 'The password confirmation does not match.',
    };

    it('re-emits when the catalog changes, so a mounted message re-renders in the new language', () => {
        const seen: string[] = [];
        seed(null, 'es-es');
        const stop = serverMessage.subscribe((render) => seen.push(render(entry)));
        seed({ Errors: { [entry.template as string]: 'La confirmación de la contraseña no coincide.' } } as unknown as iCategories, 'es-es');
        stop();
        expect(seen[0]).toBe(entry.message);
        expect(seen.at(-1)).toBe('La confirmación de la contraseña no coincide.');
    });
});

describe('MSG-12 — the client half of an Inertia hand-off', () => {
    // As a server SDK shares them after a failed form's redirect: entries under an app-chosen prop.
    const pageProps = {
        auth: { user: null },
        // The framework's own prop, left untouched; the entries travel beside it.
        errors: { password: 'The password must be at least 12 characters.' },
        langsys_errors: [
            {
                field: 'password',
                code: 'too_short',
                message: 'The password must be at least 12 characters.',
                template: 'The password must be at least {min} characters.',
                params: { min: 12 },
            },
            {
                field: 'password',
                code: 'mismatch',
                message: 'The password confirmation does not match.',
                template: 'The password confirmation does not match.',
            },
        ],
    };
    const items = (body: string) => [...body.matchAll(/<li[^>]*>([^<]*)<\/li>/g)].map((m) => m[1]);

    it('with no translation, the page renders each entry’s message', () => {
        seed(null, 'es-es');
        const { body } = render(InertiaErrors, { props: { pageProps, messagesKey: 'langsys_errors' } });
        expect(items(body)).toEqual(['The password must be at least 12 characters.', 'The password confirmation does not match.']);
    });

    it('with the templates translated, the page renders the translations, filled from params', () => {
        seed(
            {
                Errors: {
                    'The password must be at least {min} characters.': 'La contraseña debe tener al menos {min} caracteres.',
                    'The password confirmation does not match.': 'La confirmación de la contraseña no coincide.',
                },
            } as unknown as iCategories,
            'es-es'
        );
        const { body } = render(InertiaErrors, { props: { pageProps, messagesKey: 'langsys_errors' } });
        expect(items(body)).toEqual(['La contraseña debe tener al menos 12 caracteres.', 'La confirmación de la contraseña no coincide.']);
    });

    it("control: the framework's own `errors` prop is not read as entries", () => {
        const { body } = render(InertiaErrors, { props: { pageProps, messagesKey: 'errors' } });
        expect(items(body)).toEqual([]);
    });

    it('with no key and no resolver, resolution refuses rather than searching the body', () => {
        expect(() => resolveServerMessages(pageProps, {} as never)).toThrow(TypeError);
    });
});
