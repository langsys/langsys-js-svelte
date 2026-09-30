/**
 * `langsys-js-svelte/preprocess` — the build-time transform (VAR-6). Optional, enabled by one line:
 *
 *     // svelte.config.js
 *     import { langsysPreprocess } from 'langsys-js-svelte/preprocess';
 *     export default { preprocess: [vitePreprocess(), langsysPreprocess()] };
 *
 * Svelte compiles a template into code that writes each variable straight into the DOM, so at
 * runtime nothing separates `Hello ` from the `Ana` that followed it. The source still does. This
 * preprocessor reads every `<Translate>` and `<Phrase>` in it and hands the component the block as
 * a node tree, each interpolation marked as a named variable (VAR-2, VAR-3), with the values as
 * params. The component then renders the block through the core's `renderBlock` — on the server
 * too — and registers `Hello {name}` once for every user, never `Hello Ana`.
 *
 * `$t(\`Hello ${user.name}\`)` is rewritten the same way, to `$t('Hello {name}', …, { name })`.
 *
 * A block the tree cannot express — an `{#each}`, a component, a directive — is marked as a
 * fallback: it renders as before, from the catalog, and registers nothing (VAR-7). The build
 * reports each one, and each value it could not name.
 *
 * Put it LAST in the list: it reads the markup other preprocessors produce.
 */
import { parse } from 'svelte/compiler';
import MagicString from 'magic-string';
import { PHRASE_MARKER_ATTR, TRANSLATABLE_ATTRIBUTES } from 'langsys-js-typescript/pure';
import { assignNames, type Expr, type Occurrence } from './naming.js';

export interface LangsysPreprocessOptions {
    /**
     * Module specifiers the components and `t` are imported from. A `<Translate>` imported from
     * anywhere else is someone else's component and is left alone.
     */
    from?: readonly string[];
    /** Receives each build warning. Defaults to `console.warn`. */
    warn?: (message: string) => void;
}

/** What `svelte.config.js`'s `preprocess` accepts; restated so the entry has no type dependency on it. */
export interface LangsysPreprocessorGroup {
    name: string;
    markup(input: { content: string; filename?: string }): { code: string; map: unknown } | undefined;
}

// The AST as Svelte's parser produces it, read loosely: this module only walks it.
interface Node {
    type: string;
    start: number;
    end: number;
    [key: string]: unknown;
}
type Fragment = { nodes: Node[] };

const TRANSLATABLE = new Set<string>(TRANSLATABLE_ATTRIBUTES);
/** Elements the tree renderer cannot reproduce faithfully: another namespace, or raw text. */
const OPAQUE_ELEMENTS = new Set(['svg', 'math', 'script', 'style', 'textarea', 'template']);

class Fallback extends Error {}

type AttrPart = string | { key: string; expr: Expr };
type IR =
    | { k: 'text'; data: string }
    | { k: 'var'; key: string; expr: Expr }
    | { k: 'raw'; expr: Expr }
    | {
          k: 'el';
          tag: string;
          attrs: Array<{ name: string; value: true | AttrPart[] }>;
          dyn: Array<{ name: string; parts: Array<string | Expr> }>;
          children: IR[];
      }
    | { k: 'if'; branches: Array<{ test: Expr | null; body: IR[] }> };

export function langsysPreprocess(options: LangsysPreprocessOptions = {}): LangsysPreprocessorGroup {
    const from = new Set(options.from ?? ['langsys-js-svelte']);
    const warn = options.warn ?? ((message: string) => console.warn(message));
    return {
        name: 'langsys',
        markup({ content, filename }) {
            if (![...from].some((f) => content.includes(f))) return undefined;
            let ast: { fragment: Fragment; instance?: { content: Node }; module?: { content: Node } };
            try {
                ast = parse(content, { modern: true }) as unknown as typeof ast;
            } catch {
                return undefined; // not ours to report: the compiler will
            }
            const out = new Transform(content, filename ?? '(unknown)', ast, from, warn);
            if (!out.run()) return undefined;
            return { code: out.s.toString(), map: out.s.generateMap({ hires: true, source: filename }) };
        },
    };
}

class Transform {
    readonly s: MagicString;
    private readonly locals = new Map<string, 'Translate' | 'Phrase' | 'DontTranslate'>();
    private tStore: string | null = null;
    /** Every `$t(\`…${x}…\`)` call, by start offset. */
    private readonly tCalls = new Map<number, Node>();
    private changed = false;

    constructor(
        private readonly content: string,
        private readonly filename: string,
        private readonly ast: { fragment: Fragment; instance?: { content: Node }; module?: { content: Node } },
        private readonly from: ReadonlySet<string>,
        private readonly warn: (message: string) => void
    ) {
        this.s = new MagicString(content);
    }

    run(): boolean {
        for (const script of [this.ast.instance, this.ast.module]) {
            for (const statement of ((script?.content as { body?: Node[] })?.body ?? []) as Node[]) {
                if (statement.type !== 'ImportDeclaration' || !this.from.has((statement.source as { value: string }).value)) continue;
                for (const spec of statement.specifiers as Array<{ type: string; imported?: { name: string }; local: { name: string } }>) {
                    const imported = spec.imported?.name;
                    if (imported === 'Translate' || imported === 'Phrase' || imported === 'DontTranslate') this.locals.set(spec.local.name, imported);
                    if (imported === 't') this.tStore = `$${spec.local.name}`;
                }
            }
        }
        if (this.locals.size === 0 && !this.tStore) return false;

        if (this.tStore) this.collectTCalls(this.ast as unknown as Node);
        // Outermost calls only: a nested one is rewritten inside its parent's code.
        for (const call of this.outermost([...this.tCalls.values()], 0, this.content.length)) {
            this.s.overwrite(call.start, call.end, this.tCall(call));
            this.changed = true;
        }
        this.visit(this.ast.fragment.nodes);
        return this.changed;
    }

    // ------------------------------------------------------------------
    // Blocks
    // ------------------------------------------------------------------

    private visit(nodes: readonly Node[] | undefined): void {
        for (const node of nodes ?? []) {
            const kind = node.type === 'Component' ? this.locals.get(node.name as string) : undefined;
            if (kind === 'Translate' || kind === 'Phrase') {
                this.block(node, kind);
                continue; // a nested block is part of this one, or of its fallback
            }
            for (const key of ['fragment', 'consequent', 'alternate', 'body', 'fallback', 'pending', 'then', 'catch']) {
                this.visit((node[key] as Fragment | null | undefined)?.nodes);
            }
        }
    }

    private block(node: Node, kind: 'Translate' | 'Phrase'): void {
        const attributes = node.attributes as Node[];
        if (attributes.some((a) => a.name === '__ls')) return;
        const staticProp = (name: string) => {
            const a = attributes.find((x) => x.type === 'Attribute' && x.name === name);
            const v = a?.value;
            return Array.isArray(v) && v.every((p: Node) => p.type === 'Text') ? v.map((p: Node) => p.data as string).join('') : undefined;
        };
        const category = staticProp('category') ?? '';
        const explicitParams = attributes.find((a) => a.type === 'Attribute' && a.name === 'params');

        const at = attributes.length ? attributes[attributes.length - 1].end : node.start + 1 + (node.name as string).length;
        const inject = (code: string) => {
            this.s.appendLeft(at, ` __ls={${code}}`);
            this.changed = true;
        };

        const occurrences: Occurrence[] = [];
        const explicit = new Set<string>();
        const spreads: Expr[] = [];
        this.explicitKeys(explicitParams, explicit);
        let ir: IR[];
        try {
            ir = this.children((node.fragment as Fragment).nodes, {
                occurrences,
                explicit,
                spreads,
                category,
                raw: false,
                pre: false,
                phrase: kind === 'Phrase',
            });
        } catch (e) {
            if (!(e instanceof Fallback)) throw e;
            this.warn(
                `${this.where(node)}: <${node.name}> keeps a ${e.message}, which the build cannot read. It renders from the catalog and registers nothing (VAR-7).`
            );
            inject(`{ fallback: ${JSON.stringify(e.message)} }`);
            return;
        }
        trimEdges(ir);

        const { names, unnameable } = assignNames(occurrences, explicit);
        for (const key of unnameable) {
            const occ = occurrences.find((o) => o.key === key)!;
            this.warn(
                `${this.where(occ.expr as unknown as Node)}: {${this.source(occ.expr)}} has no name to derive, so it registers as {${names.get(key)}}. Name it: write %name% and pass it in params.`
            );
        }
        const g = new Gen(this, names);
        const params = `{ ${[g.params(ir), ...spreads.map((e) => `...(${this.code(e)})`)].filter(Boolean).join(', ')} }`;
        inject(`{ tree: ${g.tree(ir)}, dyn: ${g.dyn(ir)}, params: ${params} }`);
    }

    private explicitKeys(attribute: Node | undefined, into: Set<string>): void {
        const value = attribute?.value as Node | undefined;
        const expr = value && !Array.isArray(value) && value.type === 'ExpressionTag' ? (value.expression as Node) : undefined;
        if (expr?.type !== 'ObjectExpression') return;
        for (const p of expr.properties as Node[]) {
            const k = p.type === 'Property' && !p.computed ? (p.key as Node) : undefined;
            if (k?.type === 'Identifier') into.add(k.name as string);
            else if (k?.type === 'Literal') into.add(String(k.value));
        }
    }

    private children(nodes: readonly Node[], ctx: Ctx): IR[] {
        const out: IR[] = [];
        for (const n of nodes) {
            switch (n.type) {
                case 'Text': {
                    const data = ctx.pre ? (n.data as string) : (n.data as string).replace(/[ \t\r\n\f]+/g, ' ');
                    for (const m of data.matchAll(/%([A-Za-z_][A-Za-z0-9_]*)%/g)) ctx.explicit.add(m[1]);
                    out.push({ k: 'text', data });
                    break;
                }
                case 'Comment':
                    break;
                case 'ExpressionTag': {
                    const expr = n.expression as Expr;
                    if (ctx.raw) out.push({ k: 'raw', expr });
                    else {
                        const key = this.key(expr);
                        ctx.occurrences.push({ key, expr });
                        out.push({ k: 'var', key, expr });
                    }
                    break;
                }
                case 'RegularElement':
                    out.push(this.element(n, ctx));
                    break;
                case 'IfBlock':
                    out.push({ k: 'if', branches: this.branches(n, ctx) });
                    break;
                case 'KeyBlock':
                    out.push(...this.children((n.fragment as Fragment).nodes, ctx));
                    break;
                case 'Component':
                    out.push(this.nested(n, ctx));
                    break;
                default:
                    throw new Fallback(describe(n));
            }
        }
        return out;
    }

    private branches(n: Node, ctx: Ctx): Array<{ test: Expr | null; body: IR[] }> {
        const out: Array<{ test: Expr | null; body: IR[] }> = [{ test: n.test as Expr, body: this.children((n.consequent as Fragment).nodes, ctx) }];
        const alt = (n.alternate as Fragment | null)?.nodes ?? [];
        if (alt.length === 1 && alt[0].type === 'IfBlock' && alt[0].elseif) out.push(...this.branches(alt[0], ctx));
        else out.push({ test: null, body: this.children(alt, ctx) });
        return out;
    }

    private element(n: Node, ctx: Ctx): IR {
        const tag = n.name as string;
        if (OPAQUE_ELEMENTS.has(tag)) throw new Fallback(`<${tag}>`);
        const attrs: Array<{ name: string; value: true | AttrPart[] }> = [];
        const dyn: Array<{ name: string; parts: Array<string | Expr> }> = [];
        for (const a of n.attributes as Node[]) {
            if (a.type !== 'Attribute') throw new Fallback(describe(a));
            const name = a.name as string;
            const value = a.value as true | Node | Node[];
            if (value === true) {
                attrs.push({ name, value: true });
                continue;
            }
            const parts = Array.isArray(value) ? value : [value];
            if (parts.every((p) => p.type === 'Text')) {
                attrs.push({ name, value: [parts.map((p) => p.data as string).join('')] });
            } else if (TRANSLATABLE.has(name.toLowerCase()) && !ctx.raw && parts.some((p) => p.type === 'Text' && /\S/.test(p.data as string))) {
                // Text with a variable in it, in an attribute a translator reads: placeholders.
                attrs.push({
                    name,
                    value: parts.map((p) => {
                        if (p.type === 'Text') return p.data as string;
                        const expr = p.expression as Expr;
                        const key = this.key(expr);
                        ctx.occurrences.push({ key, expr });
                        return { key, expr };
                    }),
                });
            } else {
                // A value, a handler, a class: carried beside the tree, not part of the text.
                dyn.push({ name, parts: parts.map((p) => (p.type === 'Text' ? (p.data as string) : (p.expression as Expr))) });
            }
        }
        const inner = { ...ctx, pre: ctx.pre || tag === 'pre' };
        const children = this.children((n.fragment as Fragment).nodes, inner);
        if (!inner.pre) trimEdges(children);
        return { k: 'el', tag, attrs, dyn, children };
    }

    /** A `<Phrase>` or `<DontTranslate>` inside the block becomes its marked element. */
    private nested(n: Node, ctx: Ctx): IR {
        const kind = this.locals.get(n.name as string);
        if (kind !== 'Phrase' && kind !== 'DontTranslate') throw new Fallback(kind ? `nested <${n.name}>` : `component <${n.name}>`);
        const attrs: Array<{ name: string; value: true | AttrPart[] }> = [];
        const dyn: Array<{ name: string; parts: Array<string | Expr> }> = [];
        let tag = 'span';
        for (const a of n.attributes as Node[]) {
            if (a.type !== 'Attribute') throw new Fallback(`${describe(a)} on <${n.name}>`);
            const value = a.value as true | Node | Node[];
            const parts = value === true ? [] : Array.isArray(value) ? value : [value];
            const isStatic = parts.every((p) => p.type === 'Text');
            const text = parts.map((p) => (p.data as string) ?? '').join('');
            if (a.name === 'tag' && isStatic) tag = text;
            else if (a.name === 'class') {
                if (isStatic) attrs.push({ name: 'class', value: [text] });
                else dyn.push({ name: 'class', parts: parts.map((p) => (p.type === 'Text' ? (p.data as string) : (p.expression as Expr))) });
            } else if (a.name === 'category' && isStatic && (text === '' || text === ctx.category)) continue;
            else if (a.name === 'params' && kind === 'Phrase' && !Array.isArray(value) && value !== true) {
                this.explicitKeys(a, ctx.explicit);
                ctx.spreads.push(value.expression as Expr);
            } else throw new Fallback(`${a.name} on <${n.name}>`);
        }
        if (kind === 'DontTranslate') {
            attrs.push({ name: 'translate', value: ['no'] }, { name: 'data-ls-dont-translate', value: [''] });
            return { k: 'el', tag, attrs, dyn, children: this.children((n.fragment as Fragment).nodes, { ...ctx, raw: true }) };
        }
        attrs.unshift({ name: PHRASE_MARKER_ATTR, value: [''] });
        return { k: 'el', tag, attrs, dyn, children: this.children((n.fragment as Fragment).nodes, ctx) };
    }

    // ------------------------------------------------------------------
    // `$t` template literals
    // ------------------------------------------------------------------

    private collectTCalls(root: Node): void {
        const seen = new WeakSet<object>();
        const walk = (value: unknown): void => {
            if (!value || typeof value !== 'object' || seen.has(value)) return;
            seen.add(value);
            if (Array.isArray(value)) return value.forEach(walk);
            const node = value as Node;
            if (node.type === 'CallExpression' && (node.callee as Node).type === 'Identifier' && (node.callee as Node).name === this.tStore) {
                const first = (node.arguments as Node[])[0];
                if (first?.type === 'TemplateLiteral' && (first.expressions as Node[]).length > 0) this.tCalls.set(node.start, node);
            }
            for (const [k, v] of Object.entries(node)) if (k !== 'loc' && k !== 'metadata') walk(v);
        };
        walk(root);
    }

    private tCall(call: Node): string {
        const [template, category, params, ...rest] = call.arguments as Node[];
        const quasis = template.quasis as Array<{ value: { cooked: string | null } }>;
        if (quasis.some((q) => q.value.cooked === null)) return this.content.slice(call.start, call.end);
        const exprs = template.expressions as Expr[];
        const occurrences = exprs.map((expr) => ({ key: this.key(expr), expr }));
        const explicit = new Set<string>();
        if (params)
            this.explicitKeys({ type: 'Attribute', start: 0, end: 0, value: { type: 'ExpressionTag', expression: params } } as unknown as Node, explicit);
        const { names, unnameable } = assignNames(occurrences, explicit);
        for (const key of unnameable) {
            const occ = occurrences.find((o) => o.key === key)!;
            this.warn(
                `${this.where(occ.expr as unknown as Node)}: \${${this.source(occ.expr)}} has no name to derive, so it registers as {${names.get(key)}}.`
            );
        }
        const phrase = quasis.map((q, i) => q.value.cooked + (i < exprs.length ? `{${names.get(occurrences[i].key)}}` : '')).join('');
        const entries = [...new Map(occurrences.map((o) => [names.get(o.key)!, this.code(o.expr)])).entries()].map(([n, c]) => `${JSON.stringify(n)}: (${c})`);
        if (params) entries.push(`...(${this.code(params)})`);
        const args = [JSON.stringify(phrase), category ? this.code(category) : 'undefined', `{ ${entries.join(', ')} }`, ...rest.map((r) => this.code(r))];
        return `${this.content.slice(call.start, (call.callee as Node).end)}(${args.join(', ')})`;
    }

    // ------------------------------------------------------------------
    // Source helpers
    // ------------------------------------------------------------------

    /** An expression's source, with any `$t` call inside it rewritten. */
    code(expr: Expr | Node): string {
        const { start, end } = expr as Node;
        let out = '';
        let at = start;
        for (const call of this.outermost([...this.tCalls.values()], start, end)) {
            if (call.start === start && call.end === end) return this.tCall(call);
            out += this.content.slice(at, call.start) + this.tCall(call);
            at = call.end;
        }
        return out + this.content.slice(at, end);
    }

    private outermost(calls: Node[], start: number, end: number): Node[] {
        const inside = calls.filter((c) => c.start >= start && c.end <= end).sort((a, b) => a.start - b.start);
        const out: Node[] = [];
        for (const c of inside) if (!out.some((o) => c.start >= o.start && c.end <= o.end)) out.push(c);
        return out;
    }

    private source(expr: Expr): string {
        const { start, end } = expr as unknown as Node;
        return this.content.slice(start, end);
    }

    /** The same expression, however spaced, is the same value and so one placeholder. */
    private key(expr: Expr): string {
        const { start, end } = expr as unknown as Node;
        return this.content.slice(start, end).replace(/\s+/g, '');
    }

    private where(node: Node): string {
        const before = this.content.slice(0, node.start);
        const line = before.split('\n').length;
        return `${this.filename}:${line}:${node.start - before.lastIndexOf('\n')}`;
    }
}

interface Ctx {
    occurrences: Occurrence[];
    explicit: Set<string>;
    spreads: Expr[];
    category: string;
    /** Inside `<DontTranslate>`: values are shown as they are, never placeholders. */
    raw: boolean;
    pre: boolean;
    phrase: boolean;
}

/** Code for the component: the tree, the values beside it, and the params. */
class Gen {
    constructor(
        private readonly t: Transform,
        private readonly names: Map<string, string>
    ) {}

    tree(list: IR[]): string {
        return `[${list.flatMap((n) => this.node(n)).join(', ')}]`;
    }

    private node(n: IR): string[] {
        switch (n.k) {
            case 'text':
                return [JSON.stringify({ text: n.data })];
            case 'var':
                // VAR-3's tree form: the value between the pair, named.
                return [
                    JSON.stringify({ comment: `ls:${this.names.get(n.key)}` }),
                    `{ text: String((${this.t.code(n.expr)}) ?? '') }`,
                    JSON.stringify({ comment: '/ls' }),
                ];
            case 'raw':
                return [`{ text: String((${this.t.code(n.expr)}) ?? '') }`];
            case 'el': {
                const attrs = n.attrs.map(
                    ({ name, value }) =>
                        `${JSON.stringify(name)}: ${value === true ? 'true' : JSON.stringify(value.map((p) => (typeof p === 'string' ? p : `{${this.names.get(p.key)}}`)).join(''))}`
                );
                return [`{ tag: ${JSON.stringify(n.tag)}, attrs: { ${attrs.join(', ')} }, children: ${this.tree(n.children)} }`];
            }
            case 'if':
                return [`...(${this.conditional(n.branches, (body) => this.tree(body), '[]')})`];
        }
    }

    /** One entry per element, in the tree's pre-order, so an element's `source` indexes it. */
    dyn(list: IR[]): string {
        return `[${list.flatMap((n) => this.dynOf(n)).join(', ')}]`;
    }

    private dynOf(n: IR): string[] {
        if (n.k === 'el') {
            const own = n.dyn.length
                ? `{ ${n.dyn.map(({ name, parts }) => `${JSON.stringify(name)}: ${parts.length === 1 && typeof parts[0] !== 'string' ? `(${this.t.code(parts[0])})` : '`' + parts.map((p) => (typeof p === 'string' ? p.replace(/[`\\$]/g, '\\$&') : `\${${this.t.code(p)}}`)).join('') + '`'}`).join(', ')} }`
                : 'null';
            return [own, ...n.children.flatMap((c) => this.dynOf(c))];
        }
        if (n.k === 'if') return [`...(${this.conditional(n.branches, (body) => this.dyn(body), '[]')})`];
        return [];
    }

    params(list: IR[]): string {
        return list.flatMap((n) => this.paramsOf(n)).join(', ');
    }

    private paramsOf(n: IR): string[] {
        const entry = (key: string, expr: Expr) => `${JSON.stringify(this.names.get(key))}: (${this.t.code(expr)})`;
        if (n.k === 'var') return [entry(n.key, n.expr)];
        if (n.k === 'el')
            return [
                ...n.attrs.flatMap((a) => (a.value === true ? [] : a.value.flatMap((p) => (typeof p === 'string' ? [] : [entry(p.key, p.expr)])))),
                ...n.children.flatMap((c) => this.paramsOf(c)),
            ];
        if (n.k === 'if') return [`...(${this.conditional(n.branches, (body) => `{ ${this.params(body)} }`, '{}')})`];
        return [];
    }

    private conditional(branches: Array<{ test: Expr | null; body: IR[] }>, of: (body: IR[]) => string, none: string): string {
        let out = '';
        for (const b of branches) {
            if (b.test === null) return out + of(b.body);
            out += `(${this.t.code(b.test)}) ? ${of(b.body)} : `;
        }
        return out + none;
    }
}

/** Svelte drops the whitespace a block or an element opens and closes with; the tree does too. */
function trimEdges(ir: IR[]): void {
    const first = ir[0];
    if (first?.k === 'text') first.data = first.data.replace(/^\s+/, '');
    const last = ir[ir.length - 1];
    if (last?.k === 'text') last.data = last.data.replace(/\s+$/, '');
    for (let i = ir.length - 1; i >= 0; i--) if (ir[i].k === 'text' && (ir[i] as { data: string }).data === '') ir.splice(i, 1);
}

function describe(n: Node): string {
    switch (n.type) {
        case 'EachBlock':
            return '{#each}';
        case 'AwaitBlock':
            return '{#await}';
        case 'SnippetBlock':
            return '{#snippet}';
        case 'RenderTag':
            return '{@render}';
        case 'HtmlTag':
            return '{@html}';
        case 'ConstTag':
            return '{@const}';
        case 'SpreadAttribute':
            return 'spread attribute';
        default:
            if (n.type.endsWith('Directive')) return `${n.type.replace('Directive', '').toLowerCase()}:${n.name as string} directive`;
            return n.name ? `<${n.name as string}>` : n.type;
    }
}
