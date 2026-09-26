import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { catalogFor, parseLocale } from './routes/e2e/srv-concurrency/fixture.js';
import { selectSeam } from './srv-scope/seam.js';

/**
 * Testbed only — this file is outside `src/lib` and never ships.
 *
 * SvelteKit's request lifecycle wired to the request-scope seam (SRV-7), for the
 * `/e2e/srv-scope` routes and nothing else: the scope opens when the request begins, the whole
 * render — `load`, its awaits, the component tree — runs inside it, and it closes when
 * `resolve()` settles. Every other route passes straight through.
 */
const seam = selectSeam(env.SRV_SEAM);

export const handle: Handle = async ({ event, resolve }) => {
    if (!event.url.pathname.startsWith('/e2e/srv-scope')) return resolve(event);
    const locale = parseLocale(event.url.searchParams.get('locale'));
    const response = await seam.run(locale, catalogFor(locale), async () => resolve(event));
    response.headers.set('x-srv-seam', seam.name);
    return response;
};
