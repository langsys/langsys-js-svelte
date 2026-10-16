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

/**
 * Evaluates the `__ls` each block was given, with `scope` as the component's variables and each
 * context key the component declares as an object of its own.
 */
function blocks(code: string, variables: Record<string, unknown> = {}): unknown[] {
    const keys = Object.fromEntries([...new Set(code.match(/__lsScope\d+/g) ?? [])].map((name) => [name, { key: name }]));
    const scope = { ...keys, ...variables };
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
                params: { n: 4 },
            },
            { text: ' ' },
            { tag: 'code', attrs: { translate: 'no', 'data-ls-dont-translate': '' }, children: v('sku', 'X-1') },
        ]);
        expect(block.params).toEqual({ sku: 'X-1' });
    });

    it('names a nested unit inside a block on its own and hands it its own params; inside a phrase it is part of the phrase', () => {
        const { code } = run(
            '<Translate><p>Hi {user.name}</p><Phrase params={extra}>By {owner.name}</Phrase><Translate><p>For {owner.name}</p></Translate></Translate>' +
                '<Phrase>By <Translate>{owner.name}</Translate> now</Phrase>'
        );
        const vars = { user: { name: 'Ana' }, owner: { name: 'Bo' }, extra: { tag: 'x' } };
        const [block, phrase] = blocks(code, vars) as Array<{ tree: Array<Record<string, unknown>>; params: unknown }>;
        expect(block.params).toEqual({ name: 'Ana' });
        expect(block.tree[1]).toEqual({
            tag: 'span',
            attrs: { 'data-ls-phrase': '' },
            children: [{ text: 'By ' }, ...v('name', 'Bo')],
            params: { name: 'Bo', tag: 'x' },
        });
        expect(block.tree[2]).toEqual({
            tag: 'translate',
            attrs: { 'data-ls-contentblock': '' },
            children: [{ tag: 'p', attrs: {}, children: [{ text: 'For ' }, ...v('name', 'Bo')] }],
            params: { name: 'Bo' },
        });
        // A phrase reads everything under its host: the nested block's value is the phrase's.
        expect(phrase.params).toEqual({ name: 'Bo' });
        expect(phrase.tree[1]).toEqual({ tag: 'translate', attrs: { 'data-ls-contentblock': '' }, children: v('name', 'Bo') });
    });

    it('inlines a nested <Translate> as a block of its own: declared, or identified by its custom_id', () => {
        const { code } = run(
            '<Translate category="UI"><p>Outer</p><Translate tag="div"><p>Inner {n}</p></Translate><Translate custom_id="app-id"><p>Mine</p></Translate></Translate>'
        );
        const [block] = blocks(code, { n: 2 }) as Array<{ tree: unknown[] }>;
        expect(block.tree).toEqual([
            { tag: 'p', attrs: {}, children: [{ text: 'Outer' }] },
            {
                tag: 'div',
                attrs: { 'data-ls-contentblock': '' },
                children: [{ tag: 'p', attrs: {}, children: [{ text: 'Inner ' }, ...v('n', '2')] }],
                params: { n: 2 },
            },
            { tag: 'translate', attrs: { 'data-ls-contentblock': 'app-id' }, children: [{ tag: 'p', attrs: {}, children: [{ text: 'Mine' }] }], params: {} },
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

    it("takes a name written in an attribute a translator reads, in a block; in a phrase an attribute's value is shown, never a placeholder", () => {
        const vars = { extra: { name: 'NICK' }, user: { name: 'Ana' } };
        // In a block the title's text is a token, so its %name% is the caller's, as in the text.
        const [block] = blocks(run('<Translate params={extra}><p title="To %name%">Hello {user.name}</p></Translate>').code, vars) as Array<{
            params: unknown;
        }>;
        expect(block.params).toEqual({ user_name: 'Ana' });
        // In a phrase the core copies an element's attributes as they are: the value is carried beside the tree.
        const [phrase] = blocks(
            run('<Phrase>Hello <a title="Profile of {user.name}">{user.name}</a> and <i title="To %name%">you</i></Phrase>').code,
            vars
        ) as Array<{
            tree: unknown[];
            dyn: unknown[];
            params: unknown;
        }>;
        expect(phrase.tree).toEqual([
            { text: 'Hello ' },
            { tag: 'a', attrs: {}, children: v('name', 'Ana') },
            { text: ' and ' },
            { tag: 'i', attrs: { title: 'To %name%' }, children: [{ text: 'you' }] },
        ]);
        expect(phrase.dyn).toEqual([{ title: 'Profile of Ana' }, null]);
        expect(phrase.params).toEqual({ name: 'Ana' });
    });

    it('marks a value inside a <DontTranslate> as any other, in a phrase and in a block, and writes no %name% for it', () => {
        const { code, warnings } = run(
            '<Phrase>Signed in as <DontTranslate>{user.email}</DontTranslate> today</Phrase>' +
                '<Translate><p>Owner: <DontTranslate>{owner}</DontTranslate> here</p></Translate>' +
                '<Phrase>By <Translate><DontTranslate>{email}</DontTranslate></Translate> now</Phrase>'
        );
        expect(warnings).toEqual([]);
        expect(code).not.toMatch(/%(email|owner)%/);
        const excluded = (children: unknown[]) => ({ tag: 'span', attrs: { translate: 'no', 'data-ls-dont-translate': '' }, children });
        const [phrase, block, nested] = blocks(code, { user: { email: 'a@b.c' }, owner: 'Ana', email: 'a@b.c' }) as Array<{ tree: unknown[]; params: unknown }>;
        expect(phrase.tree).toEqual([{ text: 'Signed in as ' }, excluded(v('email', 'a@b.c')), { text: ' today' }]);
        expect(phrase.params).toEqual({ email: 'a@b.c' });
        expect(block.tree).toEqual([{ tag: 'p', attrs: {}, children: [{ text: 'Owner: ' }, excluded(v('owner', 'Ana')), { text: ' here' }] }]);
        expect(nested.tree).toEqual([
            { text: 'By ' },
            { tag: 'translate', attrs: { 'data-ls-contentblock': '' }, children: [excluded(v('email', 'a@b.c'))] },
            { text: ' now' },
        ]);
        // A block reads nothing inside its <DontTranslate> as a unit, a nested <Phrase> included:
        // the phrase is part of the block's tree, its value marked there too.
        const deeper = run('<Translate><p>Hi {x}</p><DontTranslate><Phrase>Version {ver}</Phrase></DontTranslate></Translate>');
        const units = blocks(deeper.code, { x: 'Ana', ver: '1.2' }) as Array<{ fallback?: string; params?: unknown }>;
        expect(units).toHaveLength(1);
        expect(units[0].params).toEqual({ x: 'Ana', ver: '1.2' });
    });

    it("reads no unit inside a <DontTranslate>, and hands a fallback block's own units its category", () => {
        const { code, warnings } = run(
            '<Translate category="DT"><ul>{#each items as i}<li>{i}</li>{/each}</ul><Phrase>Plain {v}</Phrase>' +
                '<DontTranslate><Phrase>Build {v}</Phrase></DontTranslate></Translate>' +
                '<DontTranslate><Phrase category="DT">Top {v}</Phrase>' +
                '<Translate><ul>{#each items as i}<li>{i}</li>{/each}</ul><Phrase>Inner {v}</Phrase></Translate></DontTranslate>'
        );
        const units = blocks(code, { items: [], v: '1.2' }) as Array<{ fallback?: string; scope?: string; in?: string }>;
        const unread = 'place inside a <DontTranslate>';
        expect(units.map((u) => u.fallback ?? 'read')).toEqual(['{#each}', 'read', unread, unread, unread, unread]);
        // The outer block provides its category; its own <Phrase> reads it by the same key.
        expect(units[0].scope).toBeDefined();
        expect(units[1].in).toBe(units[0].scope);
        // Nothing inside a <DontTranslate> takes part: no key handed, none provided.
        expect(units.slice(2).every((u) => u.in === undefined && u.scope === undefined)).toBe(true);
        expect(warnings).toHaveLength(5);
        expect(warnings[1]).toMatch(/<Phrase> is inside a <DontTranslate>, whose content is never read\. It registers nothing \(VAR-7\)/);
    });

    it('keys the category a fallback block provides by an object of the component instance, and provides it only when a unit is read inside', () => {
        const each = '<ul>{#each items as i}<li>{i}</li>{/each}</ul>';
        const markup =
            `<Translate category={section}>${each}<Phrase>A {v}</Phrase>{#snippet s(c)}<Phrase>B</Phrase>{/snippet}` +
            `<Translate>${each}<Phrase>Deep</Phrase></Translate></Translate>` +
            `<Translate category="X">${each}</Translate>`;
        const { code } = run(markup);
        const [outer, a, b, inner, deep, alone] = blocks(code, { items: [], v: '1', section: 'S' }) as Array<{ scope?: object; in?: object }>;
        for (const unit of [a, b, inner]) expect(unit.in).toBe(outer.scope);
        // A fallback inside a fallback reads the outer one's and provides its own.
        expect(inner.scope).toBeDefined();
        expect(inner.scope).not.toBe(outer.scope);
        expect(deep.in).toBe(inner.scope);
        expect(alone).toEqual({ fallback: '{#each}' });
        // Declared in the instance script, an object each, so every instance has its own.
        expect(code).toMatch(/\nconst __lsScope0 = \{\}, __lsScope1 = \{\};\n<\/script>/);
        // A component without an instance script gets one.
        const bare = langsysPreprocess({ warn: () => {} }).markup({ content: `<script module>${IMPORT}</script>\n${markup}`, filename: 'Bare.svelte' })!.code;
        expect(bare).toMatch(/^<script>const __lsScope0 = \{\}, __lsScope1 = \{\};<\/script>\n<script module>/);
        for (const generate of ['server', 'client'] as const) {
            expect(() => compile(code, { generate, filename: 'Test.svelte' })).not.toThrow();
            expect(() => compile(bare, { generate, filename: 'Bare.svelte' })).not.toThrow();
        }
    });

    it('declares the key of a block in an exported snippet in the module script, under a name the file does not use', () => {
        const each = '<ul>{#each items as i}<li>{i}</li>{/each}</ul>';
        const content =
            `<script module>${IMPORT} export { row };</script>\n<script>let __lsScope0 = 'mine';</script>\n` +
            `{#snippet row(items)}<Translate category="Rows">${each}<Phrase>Row</Phrase></Translate>{/snippet}` +
            `<Translate category="Page">${each}<Phrase>Page {__lsScope0}</Phrase></Translate>`;
        const code = langsysPreprocess({ warn: () => {} }).markup({ content, filename: 'Rows.svelte' })!.code;
        // A snippet the module script exports reaches only what that script declares.
        expect(code).toMatch(/<script module>[^<]*\nconst __lsScope_0 = \{\};\n<\/script>/);
        expect(code).toContain("<script>let __lsScope0 = 'mine';\nconst __lsScope_1 = {};\n</script>");
        for (const generate of ['server', 'client'] as const) expect(() => compile(code, { generate, filename: 'Rows.svelte' })).not.toThrow();
    });

    it('declares in the module script the key of a block in a snippet an exported snippet renders, however deep', () => {
        const each = '<ul>{#each items as i}<li>{i}</li>{/each}</ul>';
        const content =
            `<script module>${IMPORT} export { outer };</script>\n` +
            `{#snippet helper(items)}<Translate category="H">${each}<Phrase>H</Phrase></Translate>{/snippet}` +
            `{#snippet middle(items)}<p>{@render helper(items)}</p>{/snippet}` +
            `{#snippet outer(items)}<div>{@render middle(items)}</div>{/snippet}` +
            `<Translate category="Page">${each}<Phrase>Page</Phrase></Translate>`;
        // Premise: Svelte exports `outer` as written.
        for (const generate of ['server', 'client'] as const) expect(() => compile(content, { generate, filename: 'Helper.svelte' })).not.toThrow();
        const code = langsysPreprocess({ warn: () => {} }).markup({ content, filename: 'Helper.svelte' })!.code;
        expect(code).toMatch(/<script module>[^<]*\nconst __lsScope0 = \{\};\n<\/script>/);
        // The page's own block keeps a key of the instance.
        expect(code).toMatch(/^<script>const __lsScope1 = \{\};<\/script>/);
        for (const generate of ['server', 'client'] as const) expect(() => compile(code, { generate, filename: 'Helper.svelte' })).not.toThrow();
    });

    it('declares in the module script the keys of a snippet an exported one reaches through a default value however deep in a pattern, a computed key or member, or beside a typed parameter', () => {
        const each = '<ul>{#each items as i}<li>{i}</li>{/each}</ul>';
        const helper = (name: string) => `{#snippet ${name}(items)}<Translate category="${name}">${each}<Phrase>${name}</Phrase></Translate>{/snippet}`;
        const content =
            `<script module lang="ts">${IMPORT} const lookup: Record<string, string> = {}; export { a, b, c, d, e, f, g, h };</script>\n` +
            ['ha', 'hb', 'Row', 'hd', 'he', 'hf', 'hg', 'hh'].map(helper).join('') +
            '{#snippet a(row = ha)}{@render row([])}{/snippet}' +
            '{#snippet b({ row = hb })}{@render row([])}{/snippet}' +
            '{#snippet c(r: Row)}{@render Row([])}{/snippet}' +
            '{#snippet d(items)}<p>{lookup[hd as unknown as string]}</p>{/snippet}' +
            // A computed key in a pattern, and defaults inside array patterns: nested, after a hole, under a rest.
            '{#snippet e({ [he as unknown as string]: row })}{@render row([])}{/snippet}' +
            '{#snippet f([[row = hf]])}{@render row([])}{/snippet}' +
            '{#snippet g([, row = hg])}{@render row([])}{/snippet}' +
            '{#snippet h([...[row = hh]])}{@render row([])}{/snippet}';
        for (const generate of ['server', 'client'] as const) expect(() => compile(content, { generate, filename: 'Reach.svelte' })).not.toThrow();
        const code = langsysPreprocess({ warn: () => {} }).markup({ content, filename: 'Reach.svelte' })!.code;
        const keys = Array.from({ length: 8 }, (_, i) => `__lsScope${i} = \\{\\}`).join(', ');
        expect(code).toMatch(new RegExp(`<script module lang="ts">[^]*?\\nconst ${keys};\\n<\\/script>`));
        expect(code).not.toMatch(/^<script>/);
        for (const generate of ['server', 'client'] as const) expect(() => compile(code, { generate, filename: 'Reach.svelte' })).not.toThrow();
    });

    it('keeps in the instance script the keys of a top-level snippet no exported snippet renders', () => {
        const each = '<ul>{#each items as i}<li>{i}</li>{/each}</ul>';
        const content =
            `<script module lang="ts">${IMPORT} const cfg = { lone: 'x' }; function id<T>(a: unknown) { return a; } export { outer };</script>\n` +
            `{#snippet helper(items)}<Translate category="H">${each}<Phrase>H</Phrase></Translate>{/snippet}` +
            `{#snippet lone(items)}<Translate category="L">${each}<Phrase>L</Phrase></Translate>{/snippet}` +
            // Its own parameter hides the top-level helper, `cfg.lone` is a property, and a type is no
            // render, wherever it is written: it renders neither.
            `{#snippet outer(helper)}<p>{@render helper([])} {cfg.lone} {cfg as unknown as typeof lone} {id<typeof lone>(cfg)} {((a: typeof lone): typeof lone => a)(cfg)}</p>{/snippet}`;
        for (const generate of ['server', 'client'] as const) expect(() => compile(content, { generate, filename: 'Lone.svelte' })).not.toThrow();
        const code = langsysPreprocess({ warn: () => {} }).markup({ content, filename: 'Lone.svelte' })!.code;
        expect(code).toMatch(/^<script>const __lsScope0 = \{\}, __lsScope1 = \{\};<\/script>\n<script module lang="ts">/);
        expect(code).not.toMatch(/<script module lang="ts">[^<]*__lsScope/);
        for (const generate of ['server', 'client'] as const) expect(() => compile(code, { generate, filename: 'Lone.svelte' })).not.toThrow();
    });

    it("names the unit's own values without a value inside a <DontTranslate>, which takes a name they leave free or the same expression's", () => {
        const { code } = run(
            '<Phrase>Hi {user.name}, as <DontTranslate>{owner.name}</DontTranslate></Phrase>' +
                '<Translate><p>Hi {user.name}</p><p>Owner: <DontTranslate>{owner.name}</DontTranslate></p></Translate>' +
                '<Phrase>Hi {user.name}, <DontTranslate>{user.name}</DontTranslate></Phrase>'
        );
        const excluded = (children: unknown[]) => ({ tag: 'span', attrs: { translate: 'no', 'data-ls-dont-translate': '' }, children });
        const [phrase, block, same] = blocks(code, { user: { name: 'Ana' }, owner: { name: 'Bo' } }) as Array<{ tree: unknown[]; params: unknown }>;
        expect(phrase.tree).toEqual([{ text: 'Hi ' }, ...v('name', 'Ana'), { text: ', as ' }, excluded(v('owner_name', 'Bo'))]);
        expect(phrase.params).toEqual({ name: 'Ana', owner_name: 'Bo' });
        expect(block.params).toEqual({ name: 'Ana', owner_name: 'Bo' });
        // The same expression is one placeholder, inside the exclusion or not.
        expect(same.tree).toEqual([{ text: 'Hi ' }, ...v('name', 'Ana'), { text: ', ' }, excluded(v('name', 'Ana'))]);
        expect(same.params).toEqual({ name: 'Ana' });
    });

    it('gives distinct values distinct names beside an exclusion, however their names would meet', () => {
        const { code } = run(
            '<Translate><p>Hi {user.name} <DontTranslate>{name}</DontTranslate></p></Translate>' +
                '<Phrase>A <DontTranslate>{a.name}</DontTranslate> B <DontTranslate>{b.name}</DontTranslate></Phrase>'
        );
        const [block, phrase] = blocks(code, { user: { name: 'Ana' }, name: 'Bo', a: { name: 'X' }, b: { name: 'Y' } }) as Array<{ params: unknown }>;
        expect(block.params).toEqual({ name: 'Ana', name_2: 'Bo' });
        expect(phrase.params).toEqual({ a_name: 'X', b_name: 'Y' });
    });

    it('names an unnameable value inside a <DontTranslate> with no warning: it is in no key', () => {
        const { code, warnings } = run(
            '<Phrase>Total <DontTranslate>{a + b}</DontTranslate> now</Phrase><Translate><p>Sum <DontTranslate>{a + b}</DontTranslate></p></Translate>'
        );
        expect(warnings).toEqual([]);
        expect(blocks(code, { a: 1, b: 2 }).map((b) => (b as { params: unknown }).params)).toEqual([{ value: 3 }, { value: 3 }]);
    });

    it('reads an author\'s translate="no" or data-notrans element as a <DontTranslate>, as the core decides it', () => {
        const img = '<img alt="By {y}" src="x" />';
        const { code, warnings } = run(
            `<Translate><p>Hi <span translate="no">${img}</span></p></Translate>` +
                `<Phrase>Hi <span data-notrans>${img}</span> now</Phrase>` +
                `<Translate><p>Hi <span data-notrans="false">${img}</span></p></Translate>` +
                '<span translate="NO"><Phrase>Top {v}</Phrase></span>' +
                '<Translate><ul>{#each items as i}<li>{i}</li>{/each}</ul><span data-notrans><Phrase>Deep {v}</Phrase></span></Translate>' +
                '<Translate><p>Hi <span translate={mode}>{v}</span></p></Translate>' +
                `<Translate><p>Hi <span TRANSLATE="no">${img}</span></p></Translate>`
        );
        const [block, phrase, control, top, outer, deep, runtime, upper] = blocks(code, { y: 'Bob', v: '1', items: [], mode: 'no' }) as Array<{
            tree?: unknown[];
            dyn?: unknown[];
            params?: unknown;
            fallback?: string;
        }>;
        // An attribute's text inside the exclusion is a value, rendered as written, never a placeholder.
        const span = (attrs: Record<string, string | true>) => ({ tag: 'span', attrs, children: [{ tag: 'img', attrs: { src: 'x' }, children: [] }] });
        expect(block.tree).toEqual([{ tag: 'p', attrs: {}, children: [{ text: 'Hi ' }, span({ translate: 'no' })] }]);
        expect(block.dyn).toEqual([null, null, { alt: 'By Bob' }]);
        expect(block.params).toEqual({});
        expect(phrase.tree).toEqual([{ text: 'Hi ' }, span({ 'data-notrans': true }), { text: ' now' }]);
        expect(phrase.params).toEqual({});
        // Control: data-notrans="false" opts out of the opt-out.
        expect(control.params).toEqual({ y: 'Bob' });
        // No unit inside one is read, outside any block or in a block that falls back.
        expect(top.fallback).toBe('place inside an excluded <span>');
        expect(outer.fallback).toBe('{#each}');
        expect(deep.fallback).toBe('place inside an excluded <span>');
        expect(warnings.filter((w) => /whose content is never read/.test(w))).toHaveLength(2);
        // An exclusion decided at runtime is not known at build time: the block falls back.
        expect(runtime.fallback).toBe('translate={…}');
        // Attribute names are matched whatever their case, as HTML's are.
        expect(upper.params).toEqual({});
    });

    it('reads no unit inside an element whose exclusion is decided at runtime, or a <svelte:element> excluding itself', () => {
        const { code, warnings } = run(
            '<span translate={mode}><Phrase>Top {v}</Phrase></span>' +
                '<svelte:element this={tag} translate="no"><Phrase>Svel {v}</Phrase></svelte:element>' +
                '<Translate><ul>{#each items as i}<li>{i}</li>{/each}</ul><span data-notrans={flag}><Phrase>Deep {v}</Phrase></span></Translate>' +
                '<Translate><p>Hi <DontTranslate><span translate={mode}>{x}</span></DontTranslate> z</p></Translate>' +
                '<Translate><p>Hi <span translate="no" data-notrans={flag}><img alt="By {y}" src="x" /></span> z</p></Translate>' +
                '<Translate><p>Hi <span translate={mode} data-notrans><img alt="By {y}" src="x" /></span> z</p></Translate>'
        );
        const [top, svel, outer, deep, inside, notransRuntime, translateRuntime] = blocks(code, {
            mode: 'no',
            tag: 'span',
            items: [],
            flag: true,
            v: '1',
            x: 'X',
            y: 'Bob',
        }) as Array<{
            fallback?: string;
            dyn?: unknown[];
            params?: unknown;
        }>;
        expect(top.fallback).toBe('place inside a <span translate={…}>');
        expect(svel.fallback).toBe('place inside an excluded <svelte:element>');
        expect(outer.fallback).toBe('{#each}');
        expect(deep.fallback).toBe('place inside a <span data-notrans={…}>');
        expect(warnings.filter((w) => /whose content is never read/.test(w))).toHaveLength(3);
        // Inside an exclusion the element is excluded whatever its own attribute says: no fallback.
        expect(inside.fallback).toBeUndefined();
        expect(inside.params).toEqual({ x: 'X' });
        // Nor where the other attribute excludes it as written: it is excluded, its attribute's text a value.
        for (const unit of [notransRuntime, translateRuntime]) {
            expect(unit.fallback).toBeUndefined();
            expect(unit.params).toEqual({});
        }
        expect(notransRuntime.dyn).toEqual([null, { 'data-notrans': true }, { alt: 'By Bob' }]);
        expect(translateRuntime.dyn).toEqual([null, { translate: 'no' }, { alt: 'By Bob' }]);
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
            { fallback: '{#each}', scope: { key: '__lsScope0' } },
            { tree: [{ tag: 'p', attrs: {}, children: [{ text: 'Static text' }] }], dyn: [null], params: {}, in: { key: '__lsScope0' } },
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
