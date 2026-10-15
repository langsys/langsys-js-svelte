import { createRequestScope, type iCategories } from 'langsys-js-typescript';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import VarDontTranslate from './VarDontTranslate.svelte';

/**
 * TOK-1 and VAR-3 for a `<DontTranslate>`, inside the core's request scope: what the post-response
 * flush sends, its phrases and its blocks. In a phrase the element is one empty markup pair whatever
 * it holds; in a block it produces no token, and a value inside it is stored as its placeholder.
 * Nothing inside a `<DontTranslate>` is read as a unit.
 */
async function inScope(run: () => void, catalog: iCategories = {} as iCategories, locale = 'en-us') {
    const scope = await createRequestScope({ locale, catalog });
    scope.run(run);
    const blocks = (scope as unknown as { blockMisses: Map<string, unknown> }).blockMisses;
    return JSON.stringify([...scope.misses(), ...blocks.values()]);
}
const props = { email: 'a@b.c', version: '1.2', items: ['x'] };

describe('a value inside <DontTranslate>', () => {
    it('is one empty markup pair in a phrase: in a <Phrase>, in one nested in a block, under a <Translate> nested in a <Phrase>', async () => {
        let body = '';
        // `.body` inside run(): Svelte renders when the body is read.
        const sent = await inScope(() => (body = render(VarDontTranslate, { props }).body));
        expect(sent).toContain('"Signed in as {m0o}{m0c} today"');
        expect(sent).toContain('"Mail goes to {m0o}{m0c} first"');
        expect(sent).toContain('"By {m0o}{m1o}{m1c}{m0c} now"');
        expect(sent).not.toContain('a@b.c');
        // Control: outside a <DontTranslate> the same value is the phrase's placeholder.
        expect(sent).toContain('"Hello {email}"');
        // The page shows the value, verbatim.
        expect(body.replace(/<!--[^]*?-->/g, '')).toMatch(/Signed in as <span translate="no"[^>]*>a@b\.c<\/span> today/);
    });

    it('is stored as its placeholder in a block, and produces no token', async () => {
        const sent = JSON.parse(await inScope(() => void render(VarDontTranslate, { props }).body)) as Array<{ tokens?: string[]; content?: string }>;
        const block = sent.find((b) => b.tokens?.includes('Thanks'));
        expect(block?.tokens).toEqual(['Write to', 'for help', 'Thanks']);
        expect(block?.content).toMatch(/<p>Write to <span translate="no"[^>]*>\{email\}<\/span> for help<\/p>/);
    });

    it("renders the element's own content whatever a translation holds in its pair", async () => {
        const catalog = { DT: { 'Signed in as {m0o}{m0c} today': 'Connesso come {m0o}XXX{m0c} oggi' } } as unknown as iCategories;
        let body = '';
        await inScope(() => (body = render(VarDontTranslate, { props }).body), catalog, 'it-it');
        expect(body.replace(/<!--[^]*?-->/g, '')).toMatch(/Connesso come <span translate="no"[^>]*>a@b\.c<\/span> oggi/);
    });

    it('renders a translation filed under the key the reader produced before, and registers only the current key', async () => {
        const catalog = {
            DT: { 'Welcome to {m0o}Langsys{m0c}, {m1o}friend{m1c}': 'Benvenuto su {m0o}Langsys{m0c}, {m1o}amico{m1c}' },
        } as unknown as iCategories;
        let body = '';
        const sent = await inScope(() => (body = render(VarDontTranslate, { props }).body), catalog, 'it-it');
        expect(body.replace(/<!--[^]*?-->/g, '')).toMatch(/Benvenuto su <span translate="no"[^>]*>Langsys<\/span>, <b>amico<\/b>/);
        expect(sent).toContain('"Welcome to {m0o}{m0c}, {m1o}friend{m1c}"');
        expect(sent).not.toContain('{m0o}Langsys{m0c}');
    });

    it("keeps the space between a unit's one token and an excluded element at the paragraph's edge, as source and translated", async () => {
        const strip = (body: string) => body.replace(/<!--[^]*?-->/g, '');
        let source = '';
        const sent = await inScope(() => (source = render(VarDontTranslate, { props }).body));
        // Premise: the unit is one token beside the exclusion, so it registers as a phrase.
        expect(sent).toContain('{"category":"DT","phrase":"Built with"}');
        expect(strip(source)).toMatch(/<p>Built with <span translate="no"[^>]*>Kangen<\/span><\/p>/);
        expect(strip(source)).toMatch(/<p><span translate="no"[^>]*>Kangen<\/span> is ours<\/p>/);
        const catalog = { DT: { 'Built with': 'Costruito con', 'is ours': 'è nostro' } } as unknown as iCategories;
        let translated = '';
        await inScope(() => (translated = render(VarDontTranslate, { props }).body), catalog, 'it-it');
        expect(strip(translated)).toMatch(/<p>Costruito con <span translate="no"[^>]*>Kangen<\/span><\/p>/);
        expect(strip(translated)).toMatch(/<p><span translate="no"[^>]*>Kangen<\/span> è nostro<\/p>/);
    });

    it("changes no name in a key for what the exclusion holds, and reads an author's own exclusion as a <DontTranslate>", async () => {
        let body = '';
        const sent = await inScope(() => (body = render(VarDontTranslate, { props }).body));
        expect(sent).toContain('"Hi {name}, as {m0o}{m0c}"');
        // The attribute is rendered with its value, and stored with none.
        expect(body).toMatch(/<img [^>]*alt="By a@b\.c"/);
        expect(sent).not.toMatch(/a@b\.c|By \{email\}/);
    });

    it('is one block whichever branch its <DontTranslate> shows: one id, the content differing only inside the element', async () => {
        const shown = async (ok: boolean) => {
            const sent = JSON.parse(await inScope(() => void render(VarDontTranslate, { props: { ...props, ok } }).body)) as Array<{
                custom_id?: string;
                tokens?: string[];
                content?: string;
            }>;
            return sent.find((b) => b.tokens?.includes('Status'))!;
        };
        const [yes, no] = [await shown(true), await shown(false)];
        expect(yes.tokens).toEqual(['Status', 'shown']);
        expect(no.tokens).toEqual(yes.tokens);
        expect(no.custom_id).toBe(yes.custom_id);
        expect(yes.content).toMatch(/^<p>Status <span translate="no"[^>]*>\{email\}<\/span> shown<\/p>$/);
        expect(no.content).toMatch(/^<p>Status <span translate="no"[^>]*>none<\/span> shown<\/p>$/);
    });

    it('a block reads nothing inside its <DontTranslate>, a nested <Phrase> included, and registers the rest', async () => {
        const sent = await inScope(() => void render(VarDontTranslate, { props }).body);
        expect(sent).toContain('"Hello {email}"');
        expect(sent).not.toMatch(/Version/);
    });

    it('a block that falls back reads its own units under its category, and none inside its <DontTranslate>', async () => {
        const sent = await inScope(() => void render(VarDontTranslate, { props }).body);
        expect(sent).toContain('{"category":"DT","phrase":"Plain {version}"}');
        expect(sent).not.toMatch(/Build|Top/);
    });
});
