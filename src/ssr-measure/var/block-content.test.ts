import { createRequestScope, generateCustomId, type iCategories, type iContentBlock, type RenderedNode } from 'langsys-js-typescript';
import RenderedNodes from '$lib/components/RenderedNodes.svelte';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import VarContent from './VarContent.svelte';

/**
 * VAR-1, VAR-3 and MARK-4 for the `content` a transformed block registers with, inside the core's request
 * scope: what the post-response flush sends. The scope's block record is read directly.
 */
async function blocksSent(name: string): Promise<iContentBlock[]> {
    const scope = await createRequestScope({ locale: 'it-it', catalog: {} as iCategories });
    // `.body` inside run(): Svelte renders when the body is read.
    scope.run(() => render(VarContent, { props: { name } }).body);
    return [...(scope as unknown as { blockMisses: Map<string, iContentBlock> }).blockMisses.values()];
}

const byToken = (blocks: iContentBlock[], token: string) => blocks.find((b) => b.tokens.includes(token))?.content ?? '';

describe("a block's registered content", () => {
    it('holds each value as its placeholder, the marker removed, the outer block and the nested one', async () => {
        const blocks = await blocksSent('Ana');
        expect(byToken(blocks, 'Welcome back, {name}')).toContain('<p>Welcome back, {name}</p>');
        expect(byToken(blocks, 'Taken by {name}')).toBe('<p>Taken by {name}</p> <p>Last week</p>');
        expect(blocks.map((b) => b.content).join('')).not.toMatch(/Ana|<!--ls:/);
    });

    it('holds a name written by hand as its placeholder too, in the text and in an attribute', async () => {
        expect(byToken(await blocksSent('Ana'), 'Written by hand')).toBe('<p title="To {name}">Hello {name}, again</p> <p>Written by hand</p>');
    });

    it("keeps a nested block or phrase host's element and none of its content", async () => {
        const outer = byToken(await blocksSent('Ana'), 'Welcome back, {name}');
        expect(outer).toMatch(/<section data-ls-contentblock[^>]*><\/section>/);
        expect(outer).toMatch(/<p data-ls-phrase[^>]*><\/p>/);
        expect(outer).not.toMatch(/Taken by|Last week|Signed in as/);
    });

    it('control: an opted-out element is the outer block’s content, and the content shows it', async () => {
        expect(byToken(await blocksSent('Ana'), 'Opted out below')).toContain('Kept with the outer block');
    });
});

describe('a nested unit inside a block (VAR-2)', () => {
    async function rendered(locale: string, catalog = {} as iCategories) {
        const scope = await createRequestScope({ locale, catalog });
        let body = '';
        scope.run(() => (body = render(VarContent, { props: { name: 'Ana' } }).body));
        const blocks = [...(scope as unknown as { blockMisses: Map<string, iContentBlock> }).blockMisses.values()];
        return { body: body.replace(/<!--[^]*?-->/g, ''), phrases: scope.misses().map((m) => m.phrase), blocks };
    }

    it('names its values on its own, so it keys as it does standing alone', async () => {
        const { phrases } = await rendered('en-us');
        expect(phrases).toContain('By {name}');
        expect(phrases).not.toContain('By {owner_name}');
        // The block's own one token, beside the nested host, registers as a phrase.
        expect(phrases).toContain('Hi {name}');
        expect(phrases).not.toContain('Hi {user_name}');
    });

    it('shows a value it leaves unset as empty, as it does standing alone, translated or not', async () => {
        const catalog = { NAMES: { 'For {nick}': 'Per {nick}' } } as unknown as iCategories;
        for (const [locale, text] of [
            ['en-us', 'For'],
            ['it-it', 'Per'],
        ] as const) {
            const { body } = await rendered(locale, locale === 'it-it' ? catalog : undefined);
            expect(body, locale).not.toContain('{nick}');
            expect(body.match(new RegExp(`<p data-ls-phrase[^>]*>${text}\\s*</p>`, 'g')), locale).toHaveLength(2);
        }
    });

    it("shows an attribute's value inside a phrase, standing alone and nested, translated or not", async () => {
        for (const locale of ['en-us', 'it-it']) {
            const { body } = await rendered(locale);
            expect(body, locale).toContain('title="Profile of Ana"');
            expect(body, locale).toContain('alt="Pic of Ana"');
            expect(body, locale).not.toMatch(/="[^"]*\{name\}/);
        }
    });

    it("registers a submit input's label with its value as a placeholder, and serves it translated", async () => {
        const { blocks, body } = await rendered('en-us');
        expect(blocks.find((b) => b.tokens.includes('Send it'))?.tokens).toEqual(['Send it', 'Send to {name}']);
        expect(body).toContain('value="Send to Ana"');
        const tokens = ['Send it', 'Send to {name}'];
        const catalog = {
            NAMES: { [generateCustomId('NAMES', tokens)]: { 'Send it': 'Invialo', 'Send to {name}': 'Invia a {name}' } },
        } as unknown as iCategories;
        expect((await rendered('it-it', catalog)).body).toMatch(/<p>Invialo<\/p>\s*<input type="submit" value="Invia a Ana"/);
    });

    it('renders an attribute written without a value empty, and a boolean one present', async () => {
        for (const locale of ['en-us', 'it-it']) {
            const { body } = await rendered(locale);
            expect(body, locale).toMatch(/<p hidden="">Valueless<\/p>\s*<button disabled="">Go<\/button>/);
            expect(body, locale).not.toContain('="true"');
        }
        // A label or a title written without a value, which a typed component cannot write, renders empty too.
        const nodes = [
            { tag: 'input', attrs: { type: 'submit', value: true }, children: [], source: 0 },
            { tag: 'p', attrs: { title: true }, children: [{ text: 'x' }], source: 1 },
        ] as unknown as RenderedNode[];
        expect(render(RenderedNodes, { props: { nodes, dyn: [] } }).body.replace(/<!--[^]*?-->/g, '')).toMatch(
            /<input type="submit" value=""\/?>\s*<p title="">x<\/p>/
        );
    });

    it("fills a name written in a phrase beside a value with the caller's params, as source and translated, standing alone and nested", async () => {
        const { body, phrases } = await rendered('en-us');
        expect(phrases).toContain('Hey {who}, from {name}');
        expect(body.match(/<p data-ls-phrase[^>]*>Hey NICK, from Ana<\/p>/g)).toHaveLength(2);
        expect(body).not.toContain('%who%');
        const catalog = { NAMES: { 'Hey {who}, from {name}': 'Ehi {who}, da {name}' } } as unknown as iCategories;
        expect((await rendered('it-it', catalog)).body.match(/<p data-ls-phrase[^>]*>Ehi NICK, da Ana<\/p>/g)).toHaveLength(2);
    });

    it('renders a plural written in a phrase beside a value, split by markup or by the value in a branch, as source as it does translated', async () => {
        const items = 'You have {n, plural, one {{m0o}#{m0c} item} other {{m1o}#{m1c} items}} from {name}';
        const files = '{n, plural, one {# file for {name}} other {# files for {name}}}';
        const source = await rendered('en-us');
        expect(source.phrases).toEqual(expect.arrayContaining([items, files]));
        expect(source.body).toMatch(/<p data-ls-phrase[^>]*>You have <b>3<\/b> items from Ana<\/p>/);
        expect(source.body).toMatch(/<p data-ls-phrase[^>]*>1 file for Ana<\/p>/);
        expect(source.body).not.toContain('plural');
        const catalog = {
            NAMES: {
                [items]: 'Hai {n, plural, one {{m0o}#{m0c} articolo} other {{m1o}#{m1c} articoli}} da {name}',
                [files]: '{n, plural, one {# file per {name}} other {# file per {name}}}',
            },
        } as unknown as iCategories;
        const translated = (await rendered('it-it', catalog)).body;
        expect(translated).toMatch(/<p data-ls-phrase[^>]*>Hai <b>3<\/b> articoli da Ana<\/p>/);
        expect(translated).toMatch(/<p data-ls-phrase[^>]*>1 file per Ana<\/p>/);
    });

    it('writes a Date beside a plural in a phrase, or as a whole branch of it, as a date for the locale, and a number as written unless it is a number argument, as source as it does translated', async () => {
        const changes = '{n, plural, one {# change} other {# changes}} since {since}';
        const edits = '{n, plural, =0 {{since}} other {# edits since {since}}}';
        const totals = '{n, plural, one {# file} other {# files}} totalling {total}, or {total, number}';
        const source = await rendered('en-us');
        expect(source.phrases).toEqual(expect.arrayContaining([changes, edits, totals]));
        expect(source.body).toMatch(/<p data-ls-phrase[^>]*>2 changes since Oct 18, 2026<\/p>/);
        expect(source.body).toMatch(/<p data-ls-phrase[^>]*>Oct 18, 2026<\/p>/);
        expect(source.body).toMatch(/<p data-ls-phrase[^>]*>2 files totalling 1234.5, or 1,234.5<\/p>/);
        const catalog = {
            NAMES: {
                [changes]: '{n, plural, one {# modifica} other {# modifiche}} dal {since}',
                [edits]: '{n, plural, =0 {{since}} other {# modifiche dal {since}}}',
                [totals]: '{n, plural, one {# file} other {# file}} per {total}, ovvero {total, number}',
            },
        } as unknown as iCategories;
        const translated = (await rendered('it-it', catalog)).body;
        expect(translated).toMatch(/<p data-ls-phrase[^>]*>2 modifiche dal 18 ott 2026<\/p>/);
        expect(translated).toMatch(/<p data-ls-phrase[^>]*>18 ott 2026<\/p>/);
        expect(translated).toMatch(/<p data-ls-phrase[^>]*>2 file per 1234.5, ovvero 1234,5<\/p>/);
    });

    it('quotes a value or an element an apostrophe opens in a phrase holding an ICU argument, as ICU does, as source as it does translated', async () => {
        const quoted = "Delete '{name}' and its {n, plural, one {# file} other {# files}}?";
        const doubled = "Remove ''{name}'' and its {n, plural, one {# file} other {# files}}?";
        const element = "Type '{m0o}DELETE{m0c}' to remove {n, plural, one {# file} other {# files}}";
        const priced = "Drop '{name}' for {price, number}";
        const source = await rendered('en-us');
        expect(source.phrases).toEqual(expect.arrayContaining([quoted, doubled, element, priced, "Rename '{name}' now"]));
        expect(source.body).toMatch(/<p data-ls-phrase[^>]*>Delete \{name\} and its 2 files\?<\/p>/);
        expect(source.body).toMatch(/<p data-ls-phrase[^>]*>Remove 'Atlas' and its 2 files\?<\/p>/);
        expect(source.body).toMatch(/<p data-ls-phrase[^>]*>Type <code>DELETE<\/code> to remove 2 files<\/p>/);
        expect(source.body).toMatch(/<p data-ls-phrase[^>]*>Drop \{name\} for 5<\/p>/);
        // Without an ICU argument the apostrophe is text.
        expect(source.body).toMatch(/<p data-ls-phrase[^>]*>Rename 'Atlas' now<\/p>/);
        expect(source.body).not.toMatch(/\{m\d+[oc]\}/);
        const catalog = {
            NAMES: {
                [quoted]: "Elimina '{name}' e i suoi {n, plural, one {# file} other {# file}}?",
                [doubled]: "Rimuovi ''{name}'' e i suoi {n, plural, one {# file} other {# file}}?",
                [element]: "Digita '{m0o}DELETE{m0c}' per rimuovere {n, plural, one {# file} other {# file}}",
                [priced]: "Togli '{name}' per {price, number}",
            },
        } as unknown as iCategories;
        const translated = (await rendered('it-it', catalog)).body;
        expect(translated).toMatch(/<p data-ls-phrase[^>]*>Elimina \{name\} e i suoi 2 file\?<\/p>/);
        expect(translated).toMatch(/<p data-ls-phrase[^>]*>Rimuovi 'Atlas' e i suoi 2 file\?<\/p>/);
        expect(translated).toMatch(/<p data-ls-phrase[^>]*>Digita <code>DELETE<\/code> per rimuovere 2 file<\/p>/);
        expect(translated).toMatch(/<p data-ls-phrase[^>]*>Togli \{name\} per 5<\/p>/);
        expect(translated).not.toMatch(/\{m\d+[oc]\}/);
    });

    it('renders with its own values, translated or not', async () => {
        expect((await rendered('en-us')).body).toMatch(/Hi Ana<\/p>\s*<p data-ls-phrase[^>]*>By Bo<\/p>/);
        const catalog = { NAMES: { 'By {name}': 'Di {name}', 'Hi {name}': 'Ciao {name}' } } as unknown as iCategories;
        expect((await rendered('it-it', catalog)).body).toMatch(/Ciao Ana<\/p>\s*<p data-ls-phrase[^>]*>Di Bo<\/p>/);
    });
});
