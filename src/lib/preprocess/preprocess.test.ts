import { compile, parse } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';
import { tSignal } from 'langsys-js-typescript';
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
                tree: [
                    {
                        tag: 'p',
                        attrs: {},
                        children: [{ text: 'Hello ' }, ...v('name', 'Ana'), { text: ', you have ' }, ...v('items_count', '3'), { text: ' items' }],
                    },
                ],
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
        const at = (vip: boolean, guest: boolean) => blocks(code, { vip, guest, name: 'Ana' })[0] as { tree: Array<{ children: unknown }>; params: unknown };
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
        const { code } = run(
            '<Translate category="UI"><Phrase>Based on {n} <b>reviews</b></Phrase> <DontTranslate tag="code">{sku}</DontTranslate></Translate>'
        );
        const [block] = blocks(code, { n: 4, sku: 'X-1' }) as Array<{ tree: unknown[]; params: unknown }>;
        expect(block.tree).toEqual([
            {
                tag: 'span',
                attrs: { 'data-ls-phrase': '' },
                children: [{ text: 'Based on ' }, ...v('n', '4'), { text: ' ' }, { tag: 'b', attrs: {}, children: [{ text: 'reviews' }] }],
            },
            { text: ' ' },
            { tag: 'code', attrs: { translate: 'no', 'data-ls-dont-translate': '' }, children: [{ text: 'X-1' }] },
        ]);
        expect(block.params).toEqual({ n: 4 });
    });

    it('inlines a nested <Translate> as a block of its own: declared, or identified by its custom_id', () => {
        const { code } = run(
            '<Translate category="UI"><p>Outer</p><Translate tag="div"><p>Inner {n}</p></Translate><Translate custom_id="app-id"><p>Mine</p></Translate></Translate>'
        );
        const [block] = blocks(code, { n: 2 }) as Array<{ tree: unknown[] }>;
        expect(block.tree).toEqual([
            { tag: 'p', attrs: {}, children: [{ text: 'Outer' }] },
            { tag: 'div', attrs: { 'data-ls-contentblock': '' }, children: [{ tag: 'p', attrs: {}, children: [{ text: 'Inner ' }, ...v('n', '2')] }] },
            { tag: 'translate', attrs: { 'data-ls-contentblock': 'app-id' }, children: [{ tag: 'p', attrs: {}, children: [{ text: 'Mine' }] }] },
        ]);
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

    it('marks a block whose only dynamic parts are {@html} as content, with no warning (VAR-7)', () => {
        const { code, warnings } = run('<Translate><div class="cms">{@html body}</div></Translate><Translate><p>Hi {name}</p>{@html body}</Translate>');
        expect(blocks(code, { body: '<p>x</p>', name: 'Ana' })).toEqual([{ content: 'raw-html' }, { fallback: '{@html}' }]);
        expect(warnings).toHaveLength(1); // the mixed block only
    });

    it('a readable block nested in a fallback block is transformed on its own', () => {
        const { code } = run('<Translate><ul>{#each xs as x (x)}<li>{x}</li>{/each}</ul><Translate><p>Static text</p></Translate></Translate>');
        expect(blocks(code, { xs: [] })).toEqual([
            { fallback: '{#each}' },
            { tree: [{ tag: 'p', attrs: {}, children: [{ text: 'Static text' }] }], dyn: [null], params: {} },
        ]);
    });

    it('a self-naming expression is one placeholder wherever it repeats, however it is spaced', () => {
        const { code } = run('<Translate><p>{name}, {a.b} … {name} {a . b}</p></Translate>');
        const [block] = blocks(code, { name: 'Ana', a: { b: 1 } }) as Array<{ tree: Array<{ children: unknown }>; params: unknown }>;
        expect(block.tree[0].children).toEqual([
            ...v('name', 'Ana'),
            { text: ', ' },
            ...v('b', '1'),
            { text: ' … ' },
            ...v('name', 'Ana'),
            { text: ' ' },
            ...v('b', '1'),
        ]);
        expect(block.params).toEqual({ name: 'Ana', b: 1 });
    });

    it('an unnameable expression is its own placeholder every time, even when its source repeats', () => {
        // The core cannot tell `{a + b}` twice from `{i++}` twice, so the build never merges them.
        const { code, warnings } = run('<Translate><p>{a + b} and {a + b}</p></Translate>');
        const [block] = blocks(code, { a: 1, b: 2 }) as Array<{ tree: Array<{ children: unknown }>; params: unknown }>;
        expect(block.tree[0].children).toEqual([...v('value', '3'), { text: ' and ' }, ...v('value_2', '3')]);
        expect(block.params).toEqual({ value: 3, value_2: 3 });
        expect(warnings.filter((w) => w.includes('has no name to derive'))).toHaveLength(2);
    });

    it('a $t template literal names its values the same way', () => {
        const { code } = run('<p>{$t(`${name} ${a + b} ${name} ${a + b}`)}</p>');
        expect(code).toContain(`{$t("{name} {value} {name} {value_2}", undefined, { "name": (name), "value": (a + b), "value_2": (a + b) })}`);
    });

    it('the two newest naming rows, through the build: equal-shaped unnameable values stay apart', () => {
        // var-naming-vectors.json rows unnameable-same-kind-twice and call-unnameable-arg-twice.
        const { code } = run('<Translate><p>{a + b} {c * d} {fmt(a + b)} {fmt(c * d)}</p></Translate>');
        const [block] = blocks(code, { a: 1, b: 2, c: 3, d: 4, fmt: (v: number) => `#${v}` }) as Array<{ params: unknown }>;
        expect(block.params).toEqual({ value: 3, value_2: 12, value_3: '#3', value_4: '#12' });
    });

    it('the two repeat rows, through the build: a self-naming repeat is one placeholder, an unnameable one two', () => {
        // var-naming-vectors.json rows self-naming-repeated-verbatim and unnameable-repeated-verbatim.
        const named = blocks(run('<Translate><p>{name} {name}</p></Translate>').code, { name: 'Ana' })[0] as {
            tree: Array<{ children: unknown }>;
            params: unknown;
        };
        expect(named.tree[0].children).toEqual([...v('name', 'Ana'), { text: ' ' }, ...v('name', 'Ana')]);
        expect(named.params).toEqual({ name: 'Ana' });
        const unnamed = blocks(run('<Translate><p>{a + b} {a + b}</p></Translate>').code, { a: 1, b: 2 })[0] as {
            tree: Array<{ children: unknown }>;
            params: unknown;
        };
        expect(unnamed.tree[0].children).toEqual([...v('value', '3'), { text: ' ' }, ...v('value_2', '3')]);
        expect(unnamed.params).toEqual({ value: 3, value_2: 3 });
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

    it("a $t template literal keeps the core's argument order whatever the second argument is", () => {
        // The core reads a string second argument as the category and anything else as the params.
        const t = tSignal.get() as unknown as (...a: unknown[]) => string;
        const rewritten = (call: string, scope: Record<string, unknown>) => {
            const code = run('', `const r = ${call};`).code;
            const expr = code.slice(code.indexOf('const r = ') + 'const r = '.length, code.indexOf(';</script>'));
            return new Function('$t', ...Object.keys(scope), `return ${expr};`)(t, ...Object.values(scope));
        };
        expect(rewritten('$t(`Hello ${x}`, { other: 1 })', { x: 'Ana' })).toBe('Hello Ana');
        expect(rewritten('$t(`Hello ${x}`, "UI", { other: 1 })', { x: 'Ana' })).toBe('Hello Ana');
        expect(rewritten('$t(`Hello ${x}`)', { x: 'Ana' })).toBe('Hello Ana');
        // Not knowable at build time: decided when the call runs, as the core decides it.
        expect(rewritten('$t(`Hello ${x}`, second)', { x: 'Ana', second: { other: 1 } })).toBe('Hello Ana');
        expect(rewritten('$t(`Hello ${x}`, second)', { x: 'Ana', second: 'UI' })).toBe('Hello Ana');
        expect(rewritten('$t(`Hello ${x}`, second)', { x: 'Ana', second: undefined })).toBe('Hello Ana');
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
