import { initLangsys } from '../harness.js';
import type { PageLoad } from './$types';

/**
 * The hydration hazard, reproduced deliberately.
 *
 * This is a UNIVERSAL load: it runs on the server for SSR and again on the
 * client during hydration bootstrap — and SvelteKit awaits it before mounting.
 * So by the time the first client render happens, `init()` has resolved and the
 * base SDK's `writeEnabled` signal already holds a concrete value, while the
 * server rendered its markup from `undefined`.
 *
 * Reading the raw signal here would mismatch. `$lib`'s `writeEnabled` publishes
 * `undefined` for the whole hydration pass and adopts the real value on the
 * first macrotask after it, which is what this page exists to prove.
 */
export const load: PageLoad = async () => {
    let initError: string | null = null;
    try {
        await initLangsys({ keyName: 'ip_write' });
    } catch (e) {
        initError = e instanceof Error ? e.message : String(e);
    }
    return { initError };
};
