import { currentlyLoadedLocale, sTranslations } from '$lib/index.js';
import { catalogFor, jitter, parseLocale } from '../fixture.js';
import type { PageServerLoad } from './$types';

/**
 * POSITIVE CONTROL — the placement README-SSR measured as unsafe: seed the process-global
 * signals in an async server module, then await before rendering. Another request can
 * re-seed inside that window.
 *
 * It exists so the measurement can fail. If the harness cannot see a leak HERE, its zero
 * for the body seed would mean only that the harness cannot see interleaving at all.
 */
export const load: PageServerLoad = async ({ url }) => {
    const locale = parseLocale(url.searchParams.get('locale'));
    await jitter();
    sTranslations.set(catalogFor(locale));
    currentlyLoadedLocale.set(locale);
    await jitter();
    return { locale };
};
