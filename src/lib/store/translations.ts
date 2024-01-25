import type { iCategories } from '$lib/interface/translations.js';
import idbStore from '../js/idbStore.js';

const initialValue = {
    __uncategorized__: {
        __category__: '__uncategorized__',
    },
};

export const sTranslations = idbStore<iCategories>('translations', initialValue);

export default sTranslations;
