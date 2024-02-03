// export type iTranslations = Record<string, string | null>;

interface iDirectToken {
    token: string;
    trans: string | null;
}

interface iDirectTokenTranslations {
    __DirectToken__?: iDirectToken;
}

export type iTranslations = iDirectTokenTranslations & {
    __category__: string;
    __symbol__?: string;
    // [key: string]: iTranslations | string | iDirectToken | undefined;
    [key: string]: string | undefined;
};

export type iCategories = {
    [key: string]: iTranslations;
    __uncategorized__: iTranslations;
};
