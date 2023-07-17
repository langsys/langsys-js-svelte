import type { iTranslations } from '$lib/interface/translations.js';
import idbStore from '../js/idbStore.js';

const initialValue = {
    // example
    Home: 'Inicio',
};

export const sTranslations = idbStore<iTranslations>('translations', initialValue);

export default sTranslations;
