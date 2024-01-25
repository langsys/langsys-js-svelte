// export type iTranslations = Record<string, string | null>;

interface iDirectToken {
    token: string;
    trans: string | null;
}

export type iTranslations = {
    __DirectToken__?: iDirectToken;
    __category__: string;
    __symbol__?: string;
    [key: string]: iTranslations | string | iDirectToken | undefined;
};

export type iCategories = {
    [key: string]: iTranslations;
    __uncategorized__: iTranslations;
};
