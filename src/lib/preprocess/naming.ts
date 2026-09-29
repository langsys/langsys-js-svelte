/**
 * VAR-2 — placeholder names derived from the source expression.
 *
 * A name matches `[a-z][a-z0-9_]*`, so it is a valid ICU argument: a dotted name such as
 * `user.name` is a pattern syntax error in every formatter the fleet uses, and a phrase whose
 * placeholder cannot be formatted cannot be promoted to a plural or gendered form. The name is also
 * part of the registered phrase, so every SDK derives the same name for the same expression; the
 * shared naming vectors pin that.
 *
 * Build-time only: this module runs inside the preprocessor, never in a browser.
 */

/** The ESTree subset the derivation reads. Svelte's parser produces these nodes. */
export interface Expr {
    type: string;
    [key: string]: unknown;
}

/** What one expression contributes before collisions are resolved. */
interface Derived {
    /** The name on its own, or null when the expression is unnameable. */
    base: string | null;
    /** The segment before the one that named it, for a collision's prefix. */
    prev: string | null;
}

/** `m<N>o` / `m<N>c` are `<Phrase>`'s markup tokens. */
const RESERVED = /^m\d+[oc]$/;
const COUNTED = new Set(['length', 'size', 'count']);
const WRAPPED = new Set(['value', 'current']);
const WRAPPERS = new Set(['ChainExpression', 'TSNonNullExpression', 'TSAsExpression', 'TSSatisfiesExpression', 'ParenthesizedExpression']);

/** `firstName` → `first_name`; null when nothing valid is left. */
export function snakeCase(identifier: string): string | null {
    const name = identifier
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^[^a-z]+/, '')
        .replace(/_+/g, '_')
        .replace(/_$/, '');
    return name === '' ? null : name;
}

/** Type wrappers and optional chaining say nothing about the value's name. */
function unwrap(expr: Expr): Expr {
    let node = expr;
    while (WRAPPERS.has(node.type) && node.expression) node = node.expression as Expr;
    return node;
}

/** A non-computed member chain as its segments, root first; null for anything else. */
function segmentsOf(expr: Expr): string[] | null {
    const segments: string[] = [];
    let node = unwrap(expr);
    while (node.type === 'MemberExpression') {
        const property = node.property as Expr;
        if (node.computed || property.type !== 'Identifier') return null;
        segments.unshift(property.name as string);
        node = unwrap(node.object as Expr);
    }
    if (node.type === 'Identifier') segments.unshift(node.name as string);
    else if (node.type !== 'ThisExpression') return null;
    return segments;
}

function derive(expr: Expr): Derived {
    const node = unwrap(expr);
    if (node.type === 'CallExpression') {
        const args = node.arguments as Expr[];
        return args.length === 1 && args[0].type !== 'SpreadElement' ? derive(args[0]) : { base: null, prev: null };
    }
    const segments = segmentsOf(node);
    if (!segments || segments.length === 0) return { base: null, prev: null };
    const snake = segments.map((s) => snakeCase(s));
    const last = segments.length - 1;
    const at = (i: number) => (i >= 0 ? snake[i] : null);
    if (last > 0 && COUNTED.has(segments[last]) && snake[last - 1]) return { base: `${snake[last - 1]}_count`, prev: at(last - 2) };
    if (last > 0 && WRAPPED.has(segments[last]) && snake[last - 1]) return { base: snake[last - 1], prev: at(last - 2) };
    return { base: snake[last], prev: at(last - 1) };
}

export interface Occurrence {
    /** Identifies the expression: the same key is the same value, so one placeholder. */
    key: string;
    expr: Expr;
    /** A name the developer gave this expression; it is used as written. */
    explicit?: string;
}

export interface Naming {
    /** Each occurrence key's placeholder name. */
    names: Map<string, string>;
    /** The keys named `value…` because nothing could be derived — each one a build warning. */
    unnameable: string[];
}

/**
 * Names every distinct expression in one phrase (one block's params), in source order.
 *
 * `explicit` holds the names the developer wrote — `%name%` in the text, keys of a literal
 * `params` — which always win: a derived name that meets one is a collision like any other.
 */
export function assignNames(occurrences: readonly Occurrence[], explicit: ReadonlySet<string> = new Set()): Naming {
    const given = new Map<string, string>();
    for (const o of occurrences) if (o.explicit) given.set(o.key, o.explicit);
    const reserved = new Set([...explicit, ...given.values()]);
    const distinct: Array<{ key: string } & Derived> = [];
    const seen = new Set<string>();
    for (const { key, expr } of occurrences) {
        if (seen.has(key) || given.has(key)) continue;
        seen.add(key);
        distinct.push({ key, ...derive(expr) });
    }

    const unnameable = distinct.filter((d) => d.base === null).map((d) => d.key);
    const wanted = distinct.map((d) => d.base ?? 'value');

    // A name wanted by more than one expression, or already the developer's or reserved, is taken
    // for all of them: each that has a previous segment takes it as a prefix.
    const count = new Map<string, number>();
    for (const name of wanted) count.set(name, (count.get(name) ?? 0) + 1);
    const contested = (name: string) => (count.get(name) ?? 0) > 1 || reserved.has(name) || RESERVED.test(name);
    const prefixed = distinct.map((d, i) => (contested(wanted[i]) && d.base !== null && d.prev ? `${d.prev}_${wanted[i]}` : wanted[i]));

    // Whatever still meets a taken name is suffixed `_2`, `_3`, in source order.
    const taken = new Set(reserved);
    const names = new Map(given);
    distinct.forEach((d, i) => {
        const base = prefixed[i];
        let name = base;
        for (let n = 2; taken.has(name) || RESERVED.test(name); n++) name = `${base}_${n}`;
        taken.add(name);
        names.set(d.key, name);
    });
    return { names, unnameable };
}
