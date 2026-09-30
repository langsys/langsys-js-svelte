import type { BlockNode, ParamPrimitive } from 'langsys-js-typescript';

/**
 * What `langsys-js-svelte/preprocess` hands `<Translate>` and `<Phrase>` as their `__ls` prop.
 *
 * `tree` is the block's content with every interpolation as a named VAR-3 marker pair; `dyn`
 * holds, per element in the tree's pre-order, what is carried beside the text — handlers, classes,
 * values — so a rendered element gets them back by its `source` index; `params` are the values,
 * typed as the app holds them. `fallback` names what the build could not read.
 */
export type TransformOutput = { tree: BlockNode[]; dyn: Array<Record<string, unknown> | null>; params: Record<string, unknown> } | { fallback: string };

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
