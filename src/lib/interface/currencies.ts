export interface iCurrency {
    code: string;
    name: string;
    symbol: string;
    symbol_native: string;
    decimal_digits: number;
    rounding: number;
    name_plural?: string;
}

export type iCurrencyList = iCurrency[];
