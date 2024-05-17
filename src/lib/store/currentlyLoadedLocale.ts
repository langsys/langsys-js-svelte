import { writable, type Writable } from 'svelte/store';

/**
 * This only changes when a new set of translations are fully loaded, processed and ready for use.
 */
export const currentlyLoadedLocale: Writable<string> = writable('');

export default currentlyLoadedLocale;
