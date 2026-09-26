/**
 * SvelteKit server wiring for the core's request scope (SRV-7) — `langsys-js-svelte/kit/server`.
 *
 * A server process renders for many visitors at once, and the core keeps one catalog in module
 * state. The core's request scope gives each request its own locale, catalog view, miss
 * collection and hydration seed; this module opens one per request through SvelteKit's `handle`:
 *
 *     // src/hooks.server.ts
 *     import { createLangsysHandle } from 'langsys-js-svelte/kit/server';
 *     export const handle = createLangsysHandle({ locale: (event) => event.locals.locale });
 *
 * For each request it opens a scope, renders the whole response inside it — `load`, its awaits
 * and the component tree — writes the scope's seed into the page for `hydrateFromServer()`, and
 * closes the scope after the response, which sends the scope's misses on the write lane when the
 * key may write and `ssrTokenStrategy` allows it.
 */
import type { Handle, RequestEvent } from '@sveltejs/kit';
import { createRequestScope, setRequestScopeStorage, type iCategories, type ScopeStorage } from 'langsys-js-typescript';
import { SEED_GLOBAL } from './seed.js';

export interface LangsysHandleOptions {
    /** The request's locale. Choosing it is the app's (SRV-6): URL, then cookie or session, then `Accept-Language`. */
    locale: (event: RequestEvent) => string | Promise<string>;
    /** A catalog already in hand for this request. Omit it and the core fetches it, at most once per locale per request. */
    catalog?: (event: RequestEvent, locale: string) => iCategories | undefined | Promise<iCategories | undefined>;
    /** Which requests get a scope. Default: every request. */
    match?: (event: RequestEvent) => boolean;
    /** Write the scope's hydration seed into the page (an inline script). Default `true`; turn it off under a CSP that forbids inline scripts, and hand `scope.seed()` over yourself. */
    seed?: boolean;
    /** The AsyncLocalStorage that carries the scope across `load`'s awaits. Default: a new `node:async_hooks` AsyncLocalStorage. */
    storage?: ScopeStorage;
}

let storageReady: Promise<void> | undefined;

function ensureStorage(storage: ScopeStorage | undefined): Promise<void> {
    storageReady ??= (async () => {
        if (storage) return setRequestScopeStorage(storage);
        // Loaded at run time and only here, so nothing on the client side of the package ever
        // references a Node built-in.
        const id = 'node:async_hooks';
        const { AsyncLocalStorage } = (await import(/* @vite-ignore */ id)) as { AsyncLocalStorage: new () => ScopeStorage };
        setRequestScopeStorage(new AsyncLocalStorage());
    })();
    return storageReady;
}

/** Serialize the seed for an inline script: `<` escaped so the catalog cannot close the tag. */
const seedScript = (seed: unknown) => `<script>window.${SEED_GLOBAL}=${JSON.stringify(seed).replace(/</g, '\\u003c')}</script>`;

export function createLangsysHandle(options: LangsysHandleOptions): Handle {
    return async ({ event, resolve }) => {
        if (options.match && !options.match(event)) return resolve(event);

        await ensureStorage(options.storage);
        const locale = await options.locale(event);
        const catalog = options.catalog ? await options.catalog(event, locale) : undefined;
        const scope = await createRequestScope({ locale, catalog, url: event.url.href });

        const response = await scope.run(() =>
            resolve(event, {
                transformPageChunk:
                    options.seed === false
                        ? undefined
                        : ({ html }) => (html.includes('</head>') ? html.replace('</head>', `${seedScript(scope.seed())}</head>`) : html),
            })
        );

        // After the response. `handle` cannot run code after the body is sent, and the page is
        // fully rendered once `resolve` returns, so the close — which may send the scope's misses
        // — is scheduled rather than awaited: it never costs the visitor latency. It never throws.
        setTimeout(() => void scope.close(), 0);
        return response;
    };
}
