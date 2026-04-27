export interface iCountry {
    label: string;
    code: string;
}
export type iCountryList = iCountry[];

export interface iCountryDialCode {
    /** ISO 3166-1 alpha-2 country code (e.g., "US", "CA", "GB") */
    country_code: string;
    /** International dialing code with + prefix (e.g., "+1", "+44", "+33") */
    dial_code: string;
    /** Localized country name in the requested locale */
    name: string;
}
