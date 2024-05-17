export interface iCountry {
    label: string;
    code: string;
}
export type iCountryList = iCountry[];

export interface iCountryDialCode {
    country_code: string;
    dial_code: string;
    name: string;
}
