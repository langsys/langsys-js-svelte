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
const WRAPPERS = new Set(['ChainExpression', 'TSNonNullExpression', 'TSAsExpression', 'TSSatisfiesExpression', 'TSTypeAssertion', 'ParenthesizedExpression']);

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
    /** This occurrence, in source order. Whether two occurrences are one value is the core's call. */
    id: number;
    expr: Expr;
    /** A name the developer gave this expression; it is used as written. */
    explicit?: string;
}

export interface Naming {
    /** Each occurrence's placeholder name. */
    names: Map<number, string>;
    /** The occurrences named `value…` because nothing could be derived — each one a build warning. */
    unnameable: number[];
}

/**
 * Names every expression in one phrase (one block's params), in source order.
 *
 * Every occurrence goes to the core as written, and its names are used as they come back: an
 * expression that names itself is one placeholder wherever it repeats, and one that does not is a
 * placeholder of its own each time, since `{a + b}` twice cannot be told from `{i++}` twice.
 *
 * `explicit` holds the names the developer wrote without an expression — `%name%` in the text, keys
 * of a literal `params` — which always win: they are handed to the core as taken names, so a
 * derived name that meets one is a collision like any other.
 */
export function assignNames(occurrences: readonly Occurrence[], explicit: ReadonlySet<string> = new Set()): Naming {
    const written = [...explicit].map((name) => ({ shape: { identifier: name }, explicit: name }));
    const derived = derivePlaceholderNames([...written, ...occurrences.map((o) => ({ shape: shapeOf(o.expr), explicit: o.explicit }))]).slice(written.length);
    return {
        names: new Map(occurrences.map((o, i) => [o.id, derived[i]])),
        unnameable: occurrences.filter((o) => !o.explicit && unnameable(shapeOf(o.expr))).map((o) => o.id),
    };
}
