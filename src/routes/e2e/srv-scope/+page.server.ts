import { jitter, parseLocale } from '../srv-concurrency/fixture.js';
import type { PageServerLoad } from './$types';

/**
 * The shape SRV-7 exists for: the request awaits (a catalog fetch, a database call) before
 * anything renders. The scope was opened in `hooks.server.ts`; nothing here seeds.
 */
export const load: PageServerLoad = async ({ url }) => {
    await jitter();
    return { locale: parseLocale(url.searchParams.get('locale')) };
};
