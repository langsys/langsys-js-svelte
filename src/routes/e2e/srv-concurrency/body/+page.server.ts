import { catalogFor, jitter, parseLocale } from '../fixture.js';
import type { PageServerLoad } from './$types';

/**
 * MEASURED SHAPE — README-SSR's documented pattern. `load` awaits (the catalog fetch) and
 * only RETURNS the catalog; the component body seeds the process-global signals
 * synchronously, in the same render pass that reads them.
 */
export const load: PageServerLoad = async ({ url }) => {
    const locale = parseLocale(url.searchParams.get('locale'));
    await jitter();
    return { locale, catalog: catalogFor(locale) };
};
