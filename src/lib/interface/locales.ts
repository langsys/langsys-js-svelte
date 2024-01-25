export interface iLocaleFlat {
    code: string;
    name: string;
}
export interface iLocaleData {
    /** the locale code */
    code: string;
    /** full locale name */
    locale_name: string;
    /** language name only */
    lang_name: string;
}

export type iLanguageName = string;

/**
 * { LanguageName: [{code,title},{code,title}] }
 */
export type iLocaleDefault = Record<iLanguageName, iLocaleFlat[]>;
