import { PHRASE_MARKER_ATTR, generateCustomId, sTranslations, type iCategories } from 'langsys-js-typescript';
// Not on the core's main entry — only on `/pure`. Imported from the main entry it is
// `undefined`, and `not.toContain(undefined)` passes against any body at all: the first
// version of the stamp assertion below did exactly that, and only `svelte-check` noticed.
import { CONTENT_BLOCK_MARKER_ATTR } from 'langsys-js-typescript/pure';
import { render } from 'svelte/server';
import { afterEach, describe, expect, it } from 'vitest';
import ServedBytes from './ServedBytes.svelte';

/**
 * SRV-1, MEASURED — what a server render of this binding actually sends.
 *
 * This is a measurement, not a specification of behaviour to keep. Two of its
 * assertions pin GAPS: `<Translate>` and `<Phrase>` serve the base language however
 * complete the catalog is, because both construct their vanilla handler in `$effect`,
 * and effects never run during SSR. When server-side rendering of those two lands,
 * the gap assertions go red on purpose — that is the signal to re-grade SRV-1, not a
 * regression to silence.
 *
 * Served bytes are asserted, never a post-hydration DOM: a crawler reads the bytes.
 */

const ITALIAN = 'Prezzi';

/**
 * Carries the phrase under BOTH lookup shapes — the plain phrase key `$t()` and
 * `<Phrase>` read, and the content-block key `<Translate>` reads — so a base-language
 * result from any surface cannot be explained by the catalog lacking the entry.
 */
function italianCatalog(): iCategories {
    return {
        SRV: {
            __category__: 'SRV',
            Pricing: ITALIAN,
            [generateCustomId('SRV', ['Pricing'])]: { Pricing: ITALIAN },
        },
    } as unknown as iCategories;
}

const serve = (catalog: iCategories) => render(ServedBytes, { props: { catalog, locale: 'it-it' } }).body;

/** Text content of the first element carrying `attr`, markers and comments removed. */
function textAfter(body: string, attr: string): string {
    const at = body.indexOf(attr);
    if (at < 0) throw new Error(`no ${attr} in served bytes:\n${body}`);
    const open = body.indexOf('>', at);
    const close = body.indexOf('</', open);
    return body
        .slice(open + 1, close)
        .replace(/<!--.*?-->/g, '')
        .replace(/<[^>]+>/g, '')
        .trim();
}

afterEach(() => {
    // Process-global, exactly as README-SSR.md warns. Reset so a case cannot pass on
    // the previous case's seed.
    sTranslations.set({} as iCategories);
});

describe('SRV-1 — served bytes under the component-body seed', () => {
    it('control: with an EMPTY catalog, $t() serves the base language', () => {
        // Without this, the Italian below could be an artefact of a catalog left in
        // the process-global by something else rather than of this render's seed.
        expect(textAfter(serve({} as iCategories), 'id="t-hit"')).toBe('Pricing');
    });

    it('$t() serves the request locale when the catalog holds it', () => {
        expect(textAfter(serve(italianCatalog()), 'id="t-hit"')).toBe(ITALIAN);
    });

    it('$t() serves the base language for a genuine miss in the same render', () => {
        expect(textAfter(serve(italianCatalog()), 'id="t-miss"')).toBe('Control miss');
    });

    it('control: the stamp attribute this file checks for is a real attribute name', () => {
        expect(CONTENT_BLOCK_MARKER_ATTR).toMatch(/^data-[a-z-]+$/);
    });

    it('GAP: <Translate> serves the base language, and its host carries no identity stamp', () => {
        const body = serve(italianCatalog());
        expect(textAfter(body, 'id="translate-hit"')).toBe('Pricing');
        expect(body).not.toContain(CONTENT_BLOCK_MARKER_ATTR);
    });

    it('GAP: <Phrase> serves the base language, though its host is marked', () => {
        const body = serve(italianCatalog());
        expect(textAfter(body, PHRASE_MARKER_ATTR)).toBe('Pricing');
    });
});
