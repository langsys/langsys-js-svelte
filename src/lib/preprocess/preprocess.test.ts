import { compile, parse } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';
import { langsysPreprocess } from './index.js';

const IMPORT = `import { Translate, Phrase, DontTranslate, t } from 'langsys-js-svelte';`;

function run(markup: string, script = '') {
    const warnings: string[] = [];
    const content = `<script lang="ts">${IMPORT}${script}</script>\n${markup}`;
    const out = langsysPreprocess({ warn: (m) => warnings.push(m) }).markup({ content, filename: 'Test.svelte' });
    return { code: out?.code ?? content, warnings };
}

/** Evaluates the `__ls` each block was given, with `scope` as the component's variables. */
function blocks(code: string, scope: Record<string, unknown> = {}): unknown[] {
    const ast = parse(code, { modern: true }) as unknown as { fragment: { nodes: unknown[] } };
    const found: unknown[] = [];
    const walk = (nodes: unknown[]) => {
        for (const n of nodes as Array<Record<string, unknown>>) {
            const ls = (n.attributes as Array<Record<string, unknown>> | undefined)?.find((a) => a.name === '__ls');
            if (ls) {
                const expr = (ls.value as { expression: { start: number; end: number } }).expression;
                const body = code.slice(expr.start, expr.end);
                found.push(new Function(...Object.keys(scope), `return (${body});`)(...Object.values(scope)));
            }
            for (const k of ['fragment', 'consequent', 'alternate', 'body']) walk(((n[k] as { nodes?: unknown[] }) ?? {}).nodes ?? []);
        }
    };
    walk(ast.fragment.nodes);
    return found;
}

const v = (name: string, value: string) => [{ comment: `ls:${name}` }, { text: value }, { comment: '/ls' }];

describe('VAR-6 — the preprocessor', () => {
    it('turns an interpolation into a named marker pair, with the typed value as a param', () => {
        const { code } = run('<Translate category="UI"><p>Hello {name}, you have {items.length} items</p></Translate>');
        expect(blocks(code, { name: 'Ana', items: [1, 2, 3] })).toEqual([
            {
                tree: [{ tag: 'p', attrs: {}, children: [{ text: 'Hello ' }, ...v('name', 'Ana'), { text: ', you have ' }, ...v('items_count', '3'), { text: ' items' }] }],
                dyn: [null],
                params: { name: 'Ana', items_count: 3 },
            },
        ]);
    });

    it('names the same expression once, and a colliding one by its previous segment', () => {
        const { code } = run('<Translate><p>{a.name} and {b.name} and {a.name}</p></Translate>');
        const [block] = blocks(code, { a: { name: 'X' }, b: { name: 'Y' } }) as Array<{ params: unknown }>;
        expect(block.params).toEqual({ a_name: 'X', b_name: 'Y' });
    });

    it('keeps {#if} branches as conditional parts of the tree and of the params', () => {
        const markup = '<Translate><p>Hi {#if vip}dear {name}{:else if guest}guest{:else}there{/if}</p></Translate>';
        const { code } = run(markup);
        const at = (vip: boolean, guest: boolean) => (blocks(code, { vip, guest, name: 'Ana' })[0] as { tree: Array<{ children: unknown }>; params: unknown });
        expect(at(true, false).tree[0].children).toEqual([{ text: 'Hi ' }, { text: 'dear ' }, ...v('name', 'Ana')]);
        expect(at(true, false).params).toEqual({ name: 'Ana' });
        expect(at(false, true).tree[0].children).toEqual([{ text: 'Hi ' }, { text: 'guest' }]);
        expect(at(false, false).tree[0].children).toEqual([{ text: 'Hi ' }, { text: 'there' }]);
        expect(at(false, false).params).toEqual({});
    });

    it('carries handlers and non-text attributes beside the tree, by pre-order index', () => {
        const { code } = run('<Translate><p>A</p><button class="btn {kind}" onclick={go} title="Send to {name}">Go</button></Translate>');
        const go = () => {};
        const [block] = blocks(code, { go, kind: 'primary', name: 'Ana' }) as Array<{ tree: unknown[]; dyn: unknown[]; params: unknown }>;
        expect(block.dyn).toEqual([null, { class: 'btn primary', onclick: go }]);
        expect(block.tree[1]).toEqual({ tag: 'button', attrs: { title: 'Send to {name}' }, children: [{ text: 'Go' }] });
        expect(block.params).toEqual({ name: 'Ana' });
    });

    it('inlines a nested <Phrase> and <DontTranslate> as their marked elements', () => {
        const { code } = run('<Translate category="UI"><Phrase>Based on {n} <b>reviews</b></Phrase> <DontTranslate tag="code">{sku}</DontTranslate></Translate>');
        const [block] = blocks(code, { n: 4, sku: 'X-1' }) as Array<{ tree: unknown[]; params: unknown }>;
        expect(block.tree).toEqual([
            { tag: 'span', attrs: { 'data-ls-phrase': '' }, children: [{ text: 'Based on ' }, ...v('n', '4'), { text: ' ' }, { tag: 'b', attrs: {}, children: [{ text: 'reviews' }] }] },
            { text: ' ' },
            { tag: 'code', attrs: { translate: 'no', 'data-ls-dont-translate': '' }, children: [{ text: 'X-1' }] },
        ]);
        expect(block.params).toEqual({ n: 4 });
    });

    it('lets a name the developer wrote win', () => {
        const { code } = run('<Translate params={{ name: who }}><p>%name% met {user.name}</p></Translate>');
        const [block] = blocks(code, { who: 'Bo', user: { name: 'Ana' } }) as Array<{ params: unknown }>;
        expect(block.params).toEqual({ user_name: 'Ana' });
    });

    it('marks what it cannot read as a fallback, and says so at build time', () => {
        const { code, warnings } = run('<Translate><ul>{#each items as i}<li>{i}</li>{/each}</ul></Translate><Translate><p>Hi <Other /></p></Translate>');
        expect(blocks(code)).toEqual([{ fallback: '{#each}' }, { fallback: 'component <Other>' }]);
        expect(warnings).toHaveLength(2);
        expect(warnings[0]).toMatch(/^Test\.svelte:2:\d+: <Translate> keeps a \{#each\}.*registers nothing \(VAR-7\)/);
    });

    it('names an unnameable value `value`, with a warning', () => {
        const { code, warnings } = run('<Translate><p>Total {a + b}</p></Translate>');
        expect((blocks(code, { a: 1, b: 2 })[0] as { params: unknown }).params).toEqual({ value: 3 });
        expect(warnings.join()).toMatch(/\{a \+ b\} has no name to derive, so it registers as \{value\}/);
    });

    it('rewrites a $t template literal, in the script and in markup', () => {
        const { code } = run('<p>{$t(`Hi ${user.name}`, "UI")}</p>', 'const x = $t(`${items.length} left`);');
        expect(code).toContain(`const x = $t("{items_count} left", undefined, { "items_count": (items.length) });`);
        expect(code).toContain(`{$t("Hi {name}", "UI", { "name": (user.name) })}`);
    });

    it('rewrites a $t call inside a block, in the code it copies too', () => {
        const { code } = run('<Translate><p>Status: {$t(`is ${state}`)}</p></Translate>');
        expect(code).toContain('$t("is {state}", undefined, { "state": (state) })');
        expect(code).not.toContain('`is ${state}`');
    });

    it('leaves a <Translate> imported from elsewhere alone', () => {
        const content = `<script>import Translate from './Translate.svelte';</script><Translate><p>Hi {name}</p></Translate>`;
        expect(langsysPreprocess().markup({ content, filename: 'X.svelte' })).toBeUndefined();
    });

    it('produces a component Svelte compiles, on both targets', () => {
        const { code } = run(
            '<Translate category="UI"><p>Hello {name}{#if vip}!{/if}</p><button onclick={() => n++}>+</button></Translate>',
            'let name = $state("Ana"); let vip = $state(false); let n = $state(0);'
        );
        for (const generate of ['server', 'client'] as const) expect(() => compile(code, { generate, filename: 'Test.svelte' })).not.toThrow();
    });
});
