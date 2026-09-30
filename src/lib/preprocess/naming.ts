/**
 * VAR-2 — placeholder names, from the source expression.
 *
 * The naming itself is the core's (`derivePlaceholderNames`), so this binding derives exactly the
 * names every other SDK does. What is Svelte's is the AST: this module maps an expression, as
 * Svelte's parser hands it over, onto the language-neutral shape the core and the shared naming
 * vectors use.
 *
 * Build-time only: this module runs inside the preprocessor, never in a browser.
 */
import { derivePlaceholderNames, type ExpressionShape } from 'langsys-js-typescript/pure';

/** The ESTree subset the mapping reads. Svelte's parser produces these nodes. */
export interface Expr {
    type: string;
    [key: string]: unknown;
}

/** Type assertions and parentheses say nothing about the value. */
const WRAPPERS = new Set(['ChainExpression', 'TSNonNullExpression', 'TSAsExpression', 'TSSatisfiesExpression', 'ParenthesizedExpression']);

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

const OTHER: Record<string, string> = {
    BinaryExpression: 'binary',
    LogicalExpression: 'binary',
    ConditionalExpression: 'conditional',
    TemplateLiteral: 'template',
    MemberExpression: 'computed',
};

/** An expression as the shape the core names. */
export function shapeOf(expr: Expr): ExpressionShape {
    const node = unwrap(expr);
    if (node.type === 'Identifier') return { identifier: node.name as string };
    if (node.type === 'CallExpression') {
        const args = node.arguments as Expr[];
        const callee = segmentsOf(node.callee as Expr);
        return { call: { callee: callee ? callee.join('.') : '', args: args.map((a) => (a.type === 'SpreadElement' ? { other: 'spread' } : shapeOf(a))) } };
    }
    const segments = segmentsOf(node);
    if (segments && segments.length > 0) return segments.length === 1 ? { identifier: segments[0] } : { member: segments };
    return { other: OTHER[node.type] ?? node.type };
}

/** True when the core can derive no name, so the value is `value…` and the build warns. */
function unnameable(shape: ExpressionShape): boolean {
    if ('other' in shape) return true;
    if ('call' in shape) return shape.call.args.length !== 1 || unnameable(shape.call.args[0]);
    return false;
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
 * `explicit` holds the names the developer wrote without an expression — `%name%` in the text, keys
 * of a literal `params` — which always win: they are handed to the core as taken names, so a
 * derived name that meets one is a collision like any other.
 */
export function assignNames(occurrences: readonly Occurrence[], explicit: ReadonlySet<string> = new Set()): Naming {
    const distinct: Occurrence[] = [];
    const seen = new Set<string>();
    for (const o of occurrences) {
        if (seen.has(o.key)) continue;
        seen.add(o.key);
        distinct.push(o);
    }
    const written = [...explicit].map((name) => ({ shape: { identifier: name }, explicit: name }));
    const derived = derivePlaceholderNames([...written, ...distinct.map((o) => ({ shape: shapeOf(o.expr), explicit: o.explicit }))]).slice(written.length);
    return {
        names: new Map(distinct.map((o, i) => [o.key, derived[i]])),
        unnameable: distinct.filter((o) => !o.explicit && unnameable(shapeOf(o.expr))).map((o) => o.key),
    };
}
