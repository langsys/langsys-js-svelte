import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { writable } from 'svelte/store';
import { LangsysApp } from '$lib/index.js';
import { catalogFor, parseLocale } from './routes/e2e/srv-concurrency/fixture.js';
import { selectSeam } from './srv-scope/seam.js';

/**
 * Testbed only — this file is outside `src/lib` and never ships.
 *
 * SvelteKit's request lifecycle wired to the request-scope seam (SRV-7), for the
 * `/e2e/srv-scope` routes and nothing else. The scope opens when the request begins; the whole
 * render — `load`, its awaits, the component tree — runs inside it; its hydration seed is written
 * into the page for `hooks.client.ts` to hand to `LangsysApp.seedCatalog` before hydration; and
 * it closes after the response, which flushes its misses through the write lane. Every other
 * route passes straight through.
 */
const seam = selectSeam(env.SRV_SEAM);

const SEED_GLOBAL = '__LANGSYS_SEED__';

/**
 * For the post-response flush (SRV-3) the SDK needs a key and a write lane, so a run that tests
 * it starts the dev server with `SRV_API` (the contract double) and `SRV_KEY`. The server-side
 * `init()` happens once per process, as a real app's would; without `SRV_API` nothing initialises
 * and the scopes render from the catalog they are given.
 */
let serverInit: Promise<unknown> | undefined;
function initOnce(): Promise<unknown> | undefined {
    if (!env.SRV_API) return undefined;
    serverInit ??= LangsysApp.init({
        projectid: 'p1',
        key: env.SRV_KEY ?? '',
        UserLocaleStore: writable('en-us'),
        baseLocale: 'en-us',
        apiUrl: env.SRV_API,
        ssrTokenStrategy: 'server',
    });
    return serverInit;
}

export const handle: Handle = async ({ event, resolve }) => {
    if (!event.url.pathname.startsWith('/e2e/srv-scope')) return resolve(event);

    await initOnce();
    const locale = parseLocale(event.url.searchParams.get('locale'));
    const scope = await seam.open({ locale, catalog: catalogFor(locale), url: event.url.href });

    const response = await scope.run(async () =>
        resolve(event, {
            transformPageChunk: ({ html }) =>
                // `?noseed=1` omits the seed: the control for the hydration hand-off (SRV-4).
                event.url.searchParams.get('noseed') === '1'
                    ? html
                    : html.replace('</head>', `<script>window.${SEED_GLOBAL}=${JSON.stringify(scope.seed()).replace(/</g, '\\u003c')}</script></head>`),
        })
    );
    response.headers.set('x-srv-seam', seam.name);

    // After the response: the scope's misses go out on the write lane, never on this request's
    // time. A handle cannot run code after the body is sent, so the close is scheduled rather than
    // awaited; the page is already fully rendered by the time `resolve` returns.
    setTimeout(() => void scope.close().catch((e) => console.error('request scope close failed', e)), 0);
    return response;
};
