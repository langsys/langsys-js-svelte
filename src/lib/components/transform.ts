import type { BlockNode, ParamPrimitive } from 'langsys-js-typescript';
import { getContext, setContext } from 'svelte';

/**
 * What `langsys-js-svelte/preprocess` hands `<Translate>` and `<Phrase>` as their `__ls` prop.
 *
 * `tree` is the block's content with every interpolation as a named VAR-3 marker pair; `dyn`
 * holds, per element in the tree's pre-order, what is carried beside the text — handlers, classes,
 * values — so a rendered element gets them back by its `source` index; `params` are the values,
 * typed as the app holds them. `fallback` names what the build could not read. `content` marks a
 * block whose only dynamic parts are `{@html}` insertions: raw HTML is content, which the DOM
 * reader registers (VAR-7).
 *
 * A unit the build read on its own inside a fallback block is in that block, and takes its
 * category unless it names one: the block provides it as a context under `scope`, and the unit
 * reads it by the same key as `in`, an object of the component instance that wrote them.
 */
export type TransformOutput = (
    | { tree: BlockNode[]; dyn: Array<Record<string, unknown> | null>; params: Record<string, unknown> }
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
