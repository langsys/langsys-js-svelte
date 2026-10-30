import type { ClientInit } from '@sveltejs/kit';
import { hydrateFromServer } from '$lib/kit.js';

/** Testbed only: what an app using `createLangsysHandle` puts in its own `hooks.client.ts`. */
export const init: ClientInit = () => {
    hydrateFromServer();
};
