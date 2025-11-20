import { writable } from 'svelte/store';
import { persist as createPersist, createIndexedDBStorage, createLocalStorage } from '@macfja/svelte-persistent-store';

export type { PersistentStore } from '@macfja/svelte-persistent-store';

// Create SSR-safe storage that falls back to localStorage when IndexedDB is not available
const createSafeStorage = () => {
    // Check if we're in a browser environment
    if (typeof window === 'undefined') {
        // SSR: return null storage that does nothing
        return null;
    }
    
    try {
        // Try to use IndexedDB first (better for larger data)
        return createIndexedDBStorage();
    } catch (e) {
        // Fallback to localStorage if IndexedDB is not available
        try {
            return createLocalStorage();
        } catch (e2) {
            // If both fail, return null (will work as memory-only store)
            return null;
        }
    }
};

export const persist = (key: string, val: any) => {
    const storage = createSafeStorage();
    if (storage) {
        return createPersist(writable(val), storage, key);
    } else {
        // Fallback to regular writable store in SSR or when storage is not available
        return writable(val);
    }
};

export default persist;
