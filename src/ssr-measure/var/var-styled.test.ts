import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import VarStyled from './VarStyled.svelte';

/**
 * A transformed block renders its elements in the component it is written in, so they take that
 * component's scoped styles as the ones written outside it do, and a value inside an attribute's
 * text prints as Svelte prints it. Served bytes; `_dev_/e2e/svelte-dom.mjs` reads the same
 * component in the browser, hydrated and mounted there.
 */
/** Served bytes, Svelte's hydration comments removed. */
const serve = (uid?: string | number | null) => render(VarStyled, { props: { name: 'Ana', uid } }).body.replace(/<!--[^]*?-->/g, '');

/** The component's scoped-style class, read off the element written outside its blocks. */
function scopeClass(body: string): string {
    const cls = body.match(/<p class="([^"]*\boutside\b[^"]*)"/)?.[1] ?? '';
    return cls.split(/\s+/).find((c) => c.startsWith('svelte-')) ?? '';
}

describe('a transformed block renders its elements in the component it is written in', () => {
    it('premise: the component has a scoped-style class, and both blocks render as trees', () => {
        const body = serve();
        expect(scopeClass(body)).toMatch(/^svelte-[a-z0-9]+$/);
        expect(body).toMatch(/data-ls-contentblock="[^"]+"/);
        expect(body).toMatch(/data-ls-phrase/);
    });

    it('an element inside <Translate> carries that class', () => {
        const body = serve();
        expect(body).toMatch(new RegExp(`<h1 class="title ${scopeClass(body)}">Hi Ana</h1>`));
        expect(body).toMatch(new RegExp(`<a class="link ${scopeClass(body)}"`));
    });

    it('an element inside <Phrase> carries that class', () => {
        const body = serve();
        expect(body).toMatch(new RegExp(`<b class="em ${scopeClass(body)}">Ana</b>`));
    });
});

describe('a value inside an attribute written with text prints as Svelte prints it', () => {
    it('unset or null, it prints nothing', () => {
        expect(serve(undefined)).toContain('href="/u/"');
        expect(serve(null)).toContain('href="/u/"');
        expect(serve(undefined)).not.toMatch(/undefined|null/);
    });

    it('control: set, it prints its value', () => {
        expect(serve(7)).toContain('href="/u/7"');
        expect(serve('ana')).toContain('href="/u/ana"');
    });
});
