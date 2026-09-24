/**
 * SvelteKit wiring — a separate entry point (`langsys-js-svelte/kit`) so the main entry never
 * imports `$app/*` and keeps working in Svelte apps that do not use SvelteKit.
 */
import { afterNavigate } from '$app/navigation';
import { notifyNavigation } from 'langsys-js-typescript';

/**
 * Tell the SDK about every client-side route change (HINT-13).
 *
 * Call it once, during initialisation of the root `+layout.svelte`. A layout stays mounted
 * across client-side navigation and nothing re-evaluates its `$t(...)` calls, so without this
 * a phrase rendered there is recorded for the first URL of the session only. After each
 * navigation this calls the core's `notifyNavigation()`, which republishes `t`, so mounted
 * content is looked up again at the new URL. It sends nothing itself.
 *
 * The initial page load is skipped: the first render already records its misses at the URL
 * it rendered on.
 */
export function syncNavigation(): void {
    afterNavigate(({ type }) => {
        if (type !== 'enter') notifyNavigation();
    });
}
