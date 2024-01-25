import { writable } from 'svelte/store';
import { persist as createPersist, createIndexedDBStorage } from '@macfja/svelte-persistent-store';

export type { PersistentStore } from '@macfja/svelte-persistent-store';

export const persist = (key: string, val: any) => {
    return createPersist(writable(val), createIndexedDBStorage(), key);
};

export default persist;
