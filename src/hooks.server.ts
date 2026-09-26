import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { writable } from 'svelte/store';
import { LangsysApp } from '$lib/index.js';
import { createLangsysHandle } from '$lib/kit/server.js';
import { catalogFor, parseLocale } from './routes/e2e/srv-concurrency/fixture.js';
import { selectSeam } from './srv-scope/seam.js';

/**
 * Testbed only — this file is outside `src/lib` and never ships.
 *
 * `/e2e/srv-scope` runs through the package's own `createLangsysHandle` (`SRV_SEAM=core`, the
 * default for that route) — exactly what an app imports — or through a testbed seam that stands in
 * for a broken one: `global` (no scope) and `shared` (one scope for every request). Every other
 * route passes straight through.
 */
const isScopeRoute = (url: URL) => url.pathname.startsWith('/e2e/srv-scope');

/**
 * For the post-response flush (SRV-3) the SDK needs a key and a write lane, so a run that tests
 * it starts the dev server with `SRV_API` (the contract double) and `SRV_KEY`. The server-side
 * `init()` happens once per process, as a real app's would.
 */
let serverInit: Promise<{ status?: boolean }> | undefined;
function initOnce(): Promise<{ status?: boolean }> | undefined {
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

const options = {
    match: (event: { url: URL }) => isScopeRoute(event.url),
    locale: (event: { url: URL }) => parseLocale(event.url.searchParams.get('locale')),
    catalog: (_event: unknown, locale: string) => catalogFor(parseLocale(locale)),
};
const packageHandle = createLangsysHandle(options);
// `?noseed=1`: the same handle without the seed — the control for the hydration hand-off (SRV-4).
const packageHandleNoSeed = createLangsysHandle({ ...options, seed: false });

const seamName = env.SRV_SEAM ?? 'core';
const testbedSeam = seamName === 'core' ? undefined : selectSeam(seamName);

export const handle: Handle = async (input) => {
    const { event, resolve } = input;
    if (!isScopeRoute(event.url)) return resolve(event);
    // Reported back so a run can prove its premise: an SDK that never initialised sends nothing,
    // which would pass a read-only check for the wrong reason.
    const init = await initOnce();
    const initState = init ? (init.status ? `ok:${env.SRV_KEY}` : 'failed') : 'none';

    if (!testbedSeam) {
        const response = await (event.url.searchParams.get('noseed') === '1' ? packageHandleNoSeed : packageHandle)(input);
        response.headers.set('x-srv-seam', 'core');
        response.headers.set('x-srv-init', initState);
        return response;
    }

    const locale = parseLocale(event.url.searchParams.get('locale'));
    const scope = await testbedSeam.open({ locale, catalog: catalogFor(locale), url: event.url.href });
    const response = await scope.run(async () =>
        resolve(event, {
            transformPageChunk: ({ html }) =>
                event.url.searchParams.get('noseed') === '1'
                    ? html
                    : html.replace('</head>', `<script>window.__LANGSYS_SEED__=${JSON.stringify(scope.seed()).replace(/</g, '\\u003c')}</script></head>`),
        })
    );
    response.headers.set('x-srv-seam', testbedSeam.name);
    setTimeout(() => void scope.close().catch(() => {}), 0);
    return response;
};
