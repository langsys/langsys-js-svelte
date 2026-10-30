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
    /** Inside an author's exclusion (TOK-1): in no key, so it names nothing in the unit. */
    excluded?: boolean;
}

export interface Naming {
    /** Each occurrence's placeholder name. */
    names: Map<number, string>;
    /** The unit's values named `value…` because nothing could be derived — each one a build warning. */
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
 *
 * A value inside an author's exclusion is in no key (TOK-1), so the unit's own values are named
 * without it, and what an exclusion holds never changes a key. It takes the name of the same
 * expression among them, where the core finds one, or a name they leave free. It still needs a
 * name of its own: a block stores it as `{NAME}`, and its value travels in the params.
 */
export function assignNames(occurrences: readonly Occurrence[], explicit: ReadonlySet<string> = new Set()): Naming {
    const written = [...explicit].map((name) => ({ shape: { identifier: name }, explicit: name }));
    const entry = (o: Occurrence) => ({ shape: shapeOf(o.expr), explicit: o.explicit });
    const derive = (list: ReadonlyArray<{ shape: ExpressionShape; explicit?: string }>) => derivePlaceholderNames([...written, ...list]).slice(written.length);
    const own = occurrences.filter((o) => !o.excluded);
    const derived = derive(own.map(entry));
    const names = new Map(own.map((o, i) => [o.id, derived[i]]));
    const free: Occurrence[] = [];
    for (const o of occurrences.filter((x) => x.excluded)) {
        // The core's call: added after the unit's values, it is one of them when it changes none of
        // their names and takes one.
        const withIt = derive([...own, o].map(entry));
        const name = withIt[own.length];
        if (withIt.slice(0, own.length).every((n, i) => n === derived[i]) && derived.includes(name)) names.set(o.id, name);
        else free.push(o);
    }
    const taken = own.map((o, i) => ({ shape: shapeOf(o.expr), explicit: derived[i] }));
    derive([...taken, ...free.map(entry)])
        .slice(taken.length)
        .forEach((name, i) => names.set(free[i].id, name));
    return { names, unnameable: own.filter((o) => !o.explicit && unnameable(shapeOf(o.expr))).map((o) => o.id) };
}
