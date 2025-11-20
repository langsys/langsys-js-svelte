import type { iCategories } from '$lib/interface/translations.js';
import { persist } from '../js/store.js';

const initialValue = {
    __uncategorized__: {
        __category__: '__uncategorized__',
        __symbol__: '__uncategorized__',
    },
} as iCategories;

export const sTranslations = persist('translations', initialValue);

export default sTranslations;
