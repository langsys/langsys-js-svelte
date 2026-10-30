import type { BlockNode, ParamPrimitive, RenderedNode } from 'langsys-js-typescript';
import { getContext, setContext, type Snippet } from 'svelte';

/**
 * A rendered block's node as it is written to the page: text, or an element with its attributes
 * ready to spread — the rendered ones and what the build carried beside them (`dyn`) merged — and
 * whether it is a void element. Marker comments render nothing, so they are left out.
 */
export type PreparedNode = { text: string } | { tag: string; attrs: Record<string, unknown>; void: boolean; children: PreparedNode[] };

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

// An attribute written without a value is `true` in the tree. Svelte's spread renders `true` as
// the text "true" on every name but the boolean ones it lists (DOM_BOOLEAN_ATTRIBUTES, which it
// does not export) and `hidden`, which it treats as one, so on any other name it is written
// empty, as Svelte's own markup writes it. An empty value would drop a boolean one.
const BOOLEAN_NAMES =
    'allowfullscreen async autofocus autoplay checked controls default disabled formnovalidate indeterminate inert ismap loop multiple muted nomodule novalidate open playsinline readonly required reversed seamless selected webkitdirectory defer disablepictureinpicture disableremoteplayback hidden';
const BOOLEAN = new RegExp(`^(?:${BOOLEAN_NAMES.replaceAll(' ', '|')})$`, 'i');

/** A rendered block's nodes as they are written: each element takes back its `dyn` entry by its `source` index. */
export function prepareNodes(nodes: readonly RenderedNode[], dyn: ReadonlyArray<Record<string, unknown> | null>): PreparedNode[] {
    return nodes.flatMap((n): PreparedNode[] => {
        if ('text' in n) return [{ text: n.text }];
        if (!('tag' in n)) return [];
        const attrs = Object.fromEntries(Object.entries(n.attrs).map(([name, value]) => [name, value === true && !BOOLEAN.test(name) ? '' : value]));
        return [{ tag: n.tag, attrs: { ...attrs, ...(dyn[n.source] ?? {}) }, void: VOID.has(n.tag), children: prepareNodes(n.children, dyn) }];
    });
}

/**
 * What `langsys-js-svelte/preprocess` hands `<Translate>` and `<Phrase>` as their `__ls` prop.
 *
 * `tree` is the block's content with every interpolation as a named VAR-3 marker pair; `dyn`
 * holds, per element in the tree's pre-order, what is carried beside the text — handlers, classes,
 * values — so a rendered element gets them back by its `source` index; `params` are the values,
 * typed as the app holds them. `render` writes the rendered nodes, and is declared in the component
 * the block is written in, so its elements take that component's scoped styles as the ones written
 * there do. `fallback` names what the build could not read. `content` marks a block whose only
 * dynamic parts are `{@html}` insertions: raw HTML is content, which the DOM reader registers
 * (VAR-7).
 *
 * A unit the build read on its own inside a fallback block is in that block, and takes its
 * category unless it names one: the block provides it as a context under `scope`, and the unit
 * reads it by the same key as `in`, an object of the component instance that wrote them.
 */
export type TransformOutput = (
    | { tree: BlockNode[]; dyn: Array<Record<string, unknown> | null>; params: Record<string, unknown>; render?: Snippet<[PreparedNode[]]> }
    | { fallback: string; scope?: object }
    | { content: 'raw-html' }
) & { in?: object };

/**
 * The category a unit renders and registers under, given its own: for one the build read on its
 * own inside a fallback block, the block's unless the unit names one (an empty one is the block's
 * too, as it is inside a block that is read). A fallback block provides its category to the units
 * read inside it. Call while the component initialises; the getter is reactive where it is read.
 */
export function blockCategory(__ls: TransformOutput | undefined, own: () => string): () => string {
    const block = __ls?.in ? getContext<(() => string) | undefined>(__ls.in) : undefined;
    const category = () => own() || block?.() || '';
    if (__ls && 'fallback' in __ls && __ls.scope) setContext(__ls.scope, category);
    return category;
}

/** The reason `warnUnregistered` reports when a block reaches the runtime without the transform. */
export const NO_TRANSFORM = 'svelte-transform-missing: add langsysPreprocess() from langsys-js-svelte/preprocess to svelte.config.js';

/** Values as the core's params take them: primitives and dates as they are, anything else as its text. */
export function paramsOf(...sources: Array<Record<string, unknown> | undefined>): Record<string, ParamPrimitive> {
    const out: Record<string, ParamPrimitive> = {};
    for (const source of sources) {
        for (const [key, value] of Object.entries(source ?? {})) {
            out[key] =
                value == null
                    ? ''
                    : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value instanceof Date
                      ? value
                      : String(value);
        }
    }
    return out;
}

/**
 * The build's tree with each nested unit's own params taken as `paramsOf` takes a unit's: the core
 * renders a nested host with them in place of the block's, so a value left unset shows empty there
 * as it does standing alone.
 */
export function unitParams(tree: readonly BlockNode[]): BlockNode[] {
    return tree.map((n) =>
        'tag' in n ? { ...n, ...(n.children ? { children: unitParams(n.children) } : {}), ...(n.params ? { params: paramsOf(n.params) } : {}) } : n
    );
}
