/**
 * SvelteKit wiring — a separate entry point (`langsys-js-svelte/kit`) so the main entry never
 * imports `$app/*` and keeps working in Svelte apps that do not use SvelteKit.
 */
import { afterNavigate } from '$app/navigation';
import { LangsysApp, notifyNavigation, type RequestSeed } from 'langsys-js-typescript';
import { SEED_GLOBAL } from './kit/seed.js';

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

/**
 * Put the server's catalog in place before hydration (SRV-4). Call it from `init` in
 * `src/hooks.client.ts` when the server uses `createLangsysHandle` from
 * `langsys-js-svelte/kit/server`:
 *
 *     export const init = () => hydrateFromServer();
 *
 * It reads the seed the server wrote for this request and hands it to the core's synchronous
 * `seedCatalog`, so the first client render reads the catalog the server rendered with and agrees
 * with the served HTML, and nothing the server already sent is sent again. Returns whether a seed
 * was found.
 */
export function hydrateFromServer(): boolean {
    const seed = (globalThis as unknown as Record<string, RequestSeed | undefined>)[SEED_GLOBAL];
    if (!seed) return false;
    // The whole seed, not only its catalog: the blocks and phrases the server rendered, with what
    // it already collected and sends itself, so the client never sends those again (SRV-3).
    LangsysApp.seedCatalog(structuredClone(seed.catalog), seed.locale, structuredClone(seed));
    return true;
}
