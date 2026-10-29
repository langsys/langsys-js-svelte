import type { iCategories } from 'langsys-js-typescript';
import { describe, expect, it } from 'vitest';
import { SEED_GLOBAL } from './seed.js';
import { createLangsysHandle } from './server.js';

/**
 * The seed is written into the page as data. Catalog text is whatever translators and visitors
 * typed, so the `$` sequences a string replacement expands (`$'`, `` $` ``, `$&`, `$$`) must reach
 * the page as written: the seed script parses back to the catalog, and the page around it is the
 * page SvelteKit rendered, byte for byte.
 */
const catalog = {
    FX: {
        __category__: 'FX',
        "Prices in '$'": "Prix en '$'",
        'Tier $$$': 'Niveau $$$',
        'Matched: $&': 'Trouvé : $&',
        'Before: $`': 'Avant : $`',
        'Group $1': 'Groupe $1',
    },
} as unknown as iCategories;

const page = '<html><head><title>T</title></head><body><p>"+quoted+"</p><script>start()</script></body></html>';
const SCRIPT = new RegExp(`<script>window\\.${SEED_GLOBAL}=(.*?)</script>`);

async function served(html: string): Promise<string> {
    const handle = createLangsysHandle({ locale: () => 'fr-fr', catalog: () => catalog });
    let out = '';
    await handle({
        event: { url: new URL('http://localhost/') } as never,
        resolve: (async (_event: unknown, opts?: { transformPageChunk?: (input: { html: string; done: boolean }) => string }) => {
            out = opts?.transformPageChunk ? opts.transformPageChunk({ html, done: true }) : html;
            return new Response(out);
        }) as never,
    });
    return out;
}

describe('createLangsysHandle writes the seed as data', () => {
    it('the seed parses back to the catalog, with every $ sequence as written', async () => {
        const out = await served(page);
        const json = out.match(SCRIPT)?.[1];
        expect(json).toBeDefined();
        // The core adds its own `__uncategorized__` category; the one written here comes back as written.
        expect(JSON.parse(json as string).catalog.FX).toEqual((catalog as unknown as { FX: object }).FX);
    });

    it('the page around the seed is the page as rendered, once', async () => {
        const out = await served(page);
        expect(out.replace(SCRIPT, '')).toBe(page);
        expect(out.split('<body>').length).toBe(2);
    });

    it('control: the seed goes in before </head>', async () => {
        const out = await served(page);
        expect(out.indexOf(`window.${SEED_GLOBAL}=`)).toBeLessThan(out.indexOf('</head>'));
        expect(out.indexOf(`window.${SEED_GLOBAL}=`)).toBeGreaterThan(out.indexOf('<title>'));
    });
});
