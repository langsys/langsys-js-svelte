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
        // A key written in the params is taken without `%name%`, through a TypeScript cast too.
        for (const cast of ['{ name: who }', '{ name: who } as Record<string, string>', '<Record<string, string>>{ name: who }']) {
            const [cast_block] = blocks(run(`<Translate params={${cast}}><p>Met {user.name}</p></Translate>`).code, {
                who: 'Bo',
                user: { name: 'Ana' },
            }) as Array<{ params: unknown }>;
            expect(cast_block.params, cast).toEqual({ user_name: 'Ana' });
        }
    });

    it('a value inside <DontTranslate> within a phrase makes it a fallback, since the phrase would hold the value', () => {
        const { code, warnings } = run(
            '<Phrase>Signed in as <DontTranslate>{user.email}</DontTranslate> today</Phrase>' +
                '<Translate><p>Intro</p><Phrase>By <DontTranslate>{author}</DontTranslate></Phrase></Translate>' +
                '<Translate><p>Owner: <DontTranslate>{owner}</DontTranslate> here</p></Translate>' +
                '<Phrase>Powered by <DontTranslate>Langsys</DontTranslate></Phrase>'
        );
        const found = blocks(code, { user: { email: 'a@b.c' }, author: 'Ana', owner: 'Ana' }) as Array<{ fallback?: string; tree?: unknown }>;
        expect(found[0].fallback).toMatch(/<DontTranslate>/);
        expect(found[1].fallback).toMatch(/<DontTranslate>/);
        expect(warnings[0]).toMatch(
            /^Test\.svelte:2:\d+: <Phrase> keeps a value inside a <DontTranslate>, which a phrase would register as written, once per value\. It renders from the catalog and registers nothing \(VAR-7\)/
        );
        // In a block such a value is in no phrase: the block is read (its content shows the value).
        // Text written in a <DontTranslate> is the same for everyone, so a phrase may hold it.
        expect(found.slice(-2).map((b) => b.tree !== undefined)).toEqual([true, true]);
        // A phrase reads everything under its host, a nested <Translate> too; a block reads nothing
        // inside its <DontTranslate>, a nested <Phrase> included.
        const deeper = run(
            '<Phrase>By <Translate><DontTranslate>{email}</DontTranslate></Translate> now</Phrase>' +
                '<Translate><p>Hi {x}</p><DontTranslate><Phrase>Version {ver}</Phrase></DontTranslate></Translate>'
        );
        // The fallback phrase's nested <Translate> is a block of its own, so the outer block is last.
        const units = blocks(deeper.code, { email: 'a@b.c', x: 'Ana', ver: '1.2' }) as Array<{ fallback?: string; params?: unknown }>;
        expect(units[0].fallback).toMatch(/<DontTranslate>/);
        expect(units[units.length - 1].params).toEqual({ x: 'Ana' });
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

    it('a call whose callee cannot be spelled is its own placeholder, named from its argument', () => {
        // var-naming-vectors.json row call-unspellable-callee-twice.
        const { code } = run('<Translate><p>{getA()(n)} and {getB()(n)}</p></Translate>');
        const [block] = blocks(code, { n: 1, getA: () => (v: number) => `A${v}`, getB: () => (v: number) => `B${v}` }) as Array<{ params: unknown }>;
        expect(block.params).toEqual({ n: 'A1', n_2: 'B1' });
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

    /** The expression a `$t(...)` call is rewritten to. */
    const rewrite = (call: string) => {
        const code = run('', `const r = ${call};`).code;
        return code.slice(code.indexOf('const r = ') + 'const r = '.length, code.indexOf(';</script>'));
    };

    /** A rewritten `$t(...)` run against the core's `t`; `calls` holds what the core received. */
    const runT = (call: string, scope: Record<string, unknown>, { async = false } = {}) => {
        const core = tSignal.get() as unknown as (...a: unknown[]) => string;
        const calls: unknown[][] = [];
        const t = (...a: unknown[]) => (calls.push(a), core(...a));
        const expr = rewrite(call);
        const body = async ? `return (async () => ${expr})();` : `return ${expr};`;
        return { result: new Function('$t', ...Object.keys(scope), body)(t, ...Object.values(scope)), calls };
    };

    it("a $t template literal keeps the core's argument order whatever the second argument is", () => {
        // The core reads a string second argument as the category and anything else as the params.
        expect(runT('$t(`Hello ${x}`, { other: 1 })', { x: 'Ana' }).result).toBe('Hello Ana');
        expect(runT('$t(`Hello ${x}`, "UI", { other: 1 })', { x: 'Ana' }).result).toBe('Hello Ana');
        expect(runT('$t(`Hello ${x}`)', { x: 'Ana' }).result).toBe('Hello Ana');
        // Not knowable at build time: decided when the call runs, as the core decides it.
        expect(runT('$t(`Hello ${x}`, second)', { x: 'Ana', second: { other: 1 } }).result).toBe('Hello Ana');
        expect(runT('$t(`Hello ${x}`, second)', { x: 'Ana', second: 'UI' }).result).toBe('Hello Ana');
        expect(runT('$t(`Hello ${x}`, second)', { x: 'Ana', second: undefined }).result).toBe('Hello Ana');
    });

    it('a $t template literal hands the core its other arguments as the call wrote them', () => {
        const received = (call: string, scope: Record<string, unknown>) => runT(call, { x: 'Ana', ...scope }).calls[0];
        // `null` is an object to the core, so it is the params.
        expect(received('$t(`Hello ${x}`, null)', {})).toEqual(['Hello {x}', { x: 'Ana' }]);
        expect(received('$t(`Hello ${x}`, second)', { second: null })).toEqual(['Hello {x}', { x: 'Ana' }]);
        expect(received('$t(`Hello ${x}`, "UI", ...rest)', { rest: [{ other: 1 }] })).toEqual(['Hello {x}', 'UI', { other: 1, x: 'Ana' }]);
        expect(received('$t(`Hello ${x}`, ...rest)', { rest: ['UI', { other: 1 }] })).toEqual(['Hello {x}', 'UI', { other: 1, x: 'Ana' }]);
        expect(received('$t(`Hello ${x}`, ...rest)', { rest: [{ other: 1 }] })).toEqual(['Hello {x}', { other: 1, x: 'Ana' }]);
        // A comma expression is one argument: its last value.
        expect(received('$t(`Hello ${x}`, (a, b))', { a: { other: 1 }, b: 'UI' })).toEqual(['Hello {x}', 'UI', { x: 'Ana' }]);
        // Anything but an object is the category, `undefined` included, and the params follow it.
        expect(received('$t(`Hello ${x}`, second, { other: 1 })', { second: undefined })).toEqual(['Hello {x}', undefined, { other: 1, x: 'Ana' }]);
        expect(received('$t(`Hello ${x}`, second, { other: 1 })', { second: 7 })).toEqual(['Hello {x}', 7, { other: 1, x: 'Ana' }]);
        // A parenthesised callee is the same call.
        expect(received('($t)(`Hello ${x}`, "UI")', {})).toEqual(['Hello {x}', 'UI', { x: 'Ana' }]);
    });

    it('a $t template literal keeps an awaited argument in the caller', async () => {
        const { result, calls } = runT('$t(`Hello ${x}`, await category())', { x: 'Ana', category: async () => 'UI' }, { async: true });
        expect(await result).toBe('Hello Ana');
        expect(calls[0]).toEqual(['Hello {x}', 'UI', { x: 'Ana' }]);
    });

    it('a $t template literal reads the store before its arguments, as the call does', () => {
        // In an async template an `await` in an argument ends what Svelte tracks, so the store read
        // that keeps the text following the locale has to come first.
        const core = tSignal.get() as unknown as (...a: unknown[]) => string;
        for (const call of ['$t(`${read("template")}`, read("second"))', '$t(`${read("template")}`, "UI")']) {
            const order: string[] = [];
            const scope = {
                read: (v: string) => (order.push(v), v),
                get $t() {
                    return (order.push('$t'), core);
                },
            };
            new Function('scope', `with (scope) return ${rewrite(call)};`)(scope);
            expect(order, call).toEqual(call.includes('second') ? ['$t', 'template', 'second'] : ['$t', 'template']);
        }
    });

    it('a key the call writes in an object literal is a taken name, whatever else the object holds', () => {
        const received = (call: string, scope: Record<string, unknown>) => runT(call, { name: 'Ana', ...scope }).calls[0];
        expect(received('$t(`Hello ${name}`, { name: "Zed" })', {})).toEqual(['Hello {name_2}', { name_2: 'Ana', name: 'Zed' }]);
        expect(received('$t(`Hello ${name}`, { [k]: 1, name: "Zed" })', { k: 'other' })).toEqual(['Hello {name_2}', { name_2: 'Ana', name: 'Zed', other: 1 }]);
        expect(received('$t(`Hello ${name}`, { name: "Zed" }, "ignored")', {})[0]).toBe('Hello {name_2}');
        // A TypeScript cast or `satisfies` around the literal leaves its keys written.
        expect(rewrite('$t(`Hello ${name}`, { name: "Zed" } as Record<string, string>)')).toContain('"Hello {name_2}"');
        expect(rewrite('$t(`Hello ${name}`, { name: "Zed" } satisfies Record<string, string>)')).toContain('"Hello {name_2}"');
        expect(rewrite('$t(`Hello ${name}`, "UI", { name: "Zed" }!)')).toContain('"Hello {name_2}"');
    });

    it("a $t template literal's own values win over params of the same name, and are read first", () => {
        expect(runT('$t(`Hello ${name}`, extra)', { name: 'Ana', extra: { name: 'Zed' } }).result).toBe('Hello Ana');
        expect(runT('$t(`Hello ${name}`, "UI", extra)', { name: 'Ana', extra: { name: 'Zed' } }).result).toBe('Hello Ana');
        expect(runT('$t(`Hello ${name}`, { [k]: "Bob" })', { name: 'Ana', k: 'name' }).result).toBe('Hello Ana');
        const order: string[] = [];
        const read = (v: string) => (order.push(v), v);
        runT('$t(`${read("template")}`, read("second"))', { read });
        expect(order).toEqual(['template', 'second']);
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
