import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';
import {
    get as idbGet,
    set as idbSet,
    getMany,
    setMany,
    update,
    del as idbDel,
    delMany,
    clear,
    createStore,
} from 'idb-keyval';

// const langdb = createStore('langdb', 'langsys');

export interface tidbStore<T> extends Writable<T> {
    clear: () => void;
}

export default <T>(name: string, initialValue?: any): tidbStore<T> => {
    const store = writable(initialValue);

    // get key from idb and set to store if found
    idbGet(name).then((val) => {
        if (val !== undefined) store.set(val);
    });

    const set = async (val: any) => {
        await idbSet(name, val);
        store.set(val);
    };

    const clear = async () => {
        await idbDel(name);
        store.set(initialValue);
    };

    return {
        ...store,
        set,
        clear,
    };
};
