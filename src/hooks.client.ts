import type { ClientInit } from '@sveltejs/kit';
import { LangsysApp, type iCategories } from '$lib/index.js';

/**
 * Testbed only. Runs before hydration: when the server wrote a request scope's seed into the
 * page (`hooks.server.ts`, the `/e2e/srv-scope` routes), put it in place synchronously, so the
 * first client render reads the catalog the server rendered with (SRV-4's client half).
 */
export const init: ClientInit = () => {
    const seed = (window as unknown as { __LANGSYS_SEED__?: { locale: string; catalog: iCategories } }).__LANGSYS_SEED__;
    if (seed) LangsysApp.seedCatalog(structuredClone(seed.catalog), seed.locale);
};
