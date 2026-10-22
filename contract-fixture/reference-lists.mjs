/**
 * A test case's crafted reference lists (spec CONF-2, REF-1): the Locale, Country, DialCode and
 * Currency tables a case gives in its setup, named as LocaleController, CountryController and
 * CurrencyController name the API's own, ported. The forwarder answers a reference route from
 * them once the clone has accepted the request, since a clone's shared tables cannot hold a list
 * per test; every refusal is the clone's. The one request they cannot answer, a locale list that
 * appends the project's target locales, which only the clone holds, is an UnsupportedListError.
 *
 * Node built-ins only.
 */
import { readFileSync } from 'node:fs';

const lower = (s) => (typeof s === 'string' ? s.toLowerCase() : s);

/** The organisation's settings.locales.locale_code_format (LocaleCodeFormat). */
const LOCALE_CODE_FORMATS = ['lowercase-hyphen', 'bcp47', 'posix'];
const FIELDS = ['locales', 'countries', 'dial_codes', 'currencies', 'locale_code_format'];

/**
 * A case's lists as the seeders fill the tables: locale codes as stored (lowercase), the rest as
 * rows. Beside them, its organisation's code format, which the locale lists write codes in.
 * Throws, naming what is wrong, on a malformed one.
 */
export function referenceTables(ref) {
    if (!ref || typeof ref !== 'object' || Array.isArray(ref)) throw new Error('reference is an object');
    const undeclared = Object.keys(ref).filter((field) => !FIELDS.includes(field));
    if (undeclared.length) throw new Error(`reference takes ${FIELDS.join(', ')}, not ${undeclared.join(', ')}`);
    const strings = (list, what) => {
        if (!Array.isArray(list) || list.some((v) => typeof v !== 'string' || v === '')) throw new Error(`reference.${what} must be a list of non-empty strings`);
        return list.map(lower);
    };
    const rows = (list, what, fields) => {
        if (!Array.isArray(list)) throw new Error(`reference.${what} must be a list`);
        return list.map((row) => {
            for (const f of fields) if (typeof row?.[f] !== 'string' || row[f] === '') throw new Error(`reference.${what}: every row needs a string ${f}`);
            return { ...row };
        });
    };
    const format = ref.locale_code_format ?? 'lowercase-hyphen';
    if (!LOCALE_CODE_FORMATS.includes(format)) throw new Error(`reference.locale_code_format must be one of ${LOCALE_CODE_FORMATS.join(', ')}`);
    return {
        locales: strings(ref.locales ?? [], 'locales'),
        countries: rows(ref.countries ?? [], 'countries', ['code']),
        dial_codes: rows(ref.dial_codes ?? [], 'dial_codes', ['country_code', 'dial_code']),
        currencies: rows(ref.currencies ?? [], 'currencies', ['code', 'name']).map((c) => ({
            code: c.code,
            name: c.name,
            symbol: c.symbol ?? c.code,
            symbol_native: c.symbol_native ?? c.symbol ?? c.code,
            decimal_digits: c.decimal_digits ?? 2,
            rounding: c.rounding ?? 0,
        })),
        locale_code_format: format,
    };
}

/** A route parameter, percent-decoded as the router decodes it; one that does not decode is taken as written. */
export function decodeSegment(segment) {
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}

/**
 * The reference route a request names, as the API registers them, or null: a locale form, or a
 * list and its display locale. `countries/{userLocale}` is registered before
 * `countries/dial-codes/{userLocale}`, and each parameter is one segment, so `/countries/dial-codes`
 * alone names the countries in `dial-codes`.
 */
export function referenceRoute(method, path) {
    if (method !== 'GET') return null;
    if (['/locales', '/locales/flat', '/locales/data'].includes(path)) return { form: path.slice(1) };
    const list = path.match(/^\/(countries\/dial-codes|countries|currencies)\/([^/]+)$/);
    return list ? { list: list[1], visitor: decodeSegment(list[2]) } : null;
}

/** PHP's locale_compose given no language: a ValueError, which CurrencyController does not catch. */
export class LocaleComposeError extends Error {}

/** A request the crafted lists cannot answer as the API would, since what it asks for only the clone holds. */
export class UnsupportedListError extends Error {}

/**
 * The `data` a reference route answers over a case's tables. Throws a LocaleComposeError where the
 * backend throws one its controller does not catch, which it renders as a 500, and an
 * UnsupportedListError for a locale list that appends the project's target locales.
 */
export function craftedList(tables, route, url) {
    return route.form ? localeLists(tables, url, route.form) : REFERENCE_LISTS[route.list](tables, route.visitor);
}

// ---------------------------------------------------------------------------------------
// Names: ICU, as the backend reads it through PHP's \Locale, and Symfony Intl's currencies
// ---------------------------------------------------------------------------------------

/** EuCountries::EU_COUNTRY_CODES. */
const EU_COUNTRY_CODES = ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK'];

/** A display locale as ICU reads it: `_` as `-`, so `es_ES` is `es-es`. */
const icuLocale = (visitor) => String(visitor).replace(/_/g, '-').toLowerCase();

/**
 * ICU's root locale: `und`, and any locale whose language is `root` (`root_ES` too). A locale
 * with `und` and more subtags (`und_ES`) has no language and falls back to the host's default.
 */
const isIcuRoot = (visitor) => {
    const locale = icuLocale(visitor);
    return locale === 'und' || locale.split('-')[0] === 'root';
};

/**
 * symfony/intl's data, as langsys2 locks it (symfony-intl.json): each locale with a currency
 * bundle and the currencies its bundle names, and the locale aliases.
 */
const SYMFONY_INTL = JSON.parse(readFileSync(new URL('./symfony-intl.json', import.meta.url), 'utf8'));

/** Whether a locale's currency bundle names a currency: undefined where it has no bundle. */
function bundleNames(locale, code) {
    const bundle = Object.hasOwn(SYMFONY_INTL.currency_bundles, locale) ? SYMFONY_INTL.currency_bundles[locale] : undefined;
    if (!bundle) return undefined;
    return bundle.holds ? bundle.holds.includes(code) : SYMFONY_INTL.all_currencies.includes(code) && !bundle.lacks.includes(code);
}

/** ICU's data for a display locale, or null for one it has none for or cannot parse. */
function icuData(visitor) {
    try {
        return Intl.DisplayNames.supportedLocalesOf([icuLocale(visitor)])[0] ?? null;
    } catch {
        return null;
    }
}

/**
 * ICU's display names. ICU's root locale (`root`, `root_ES`, `und`) names a region by its code and
 * a locale by its subtags (`es (ES)`). A display locale ICU has no data for, or cannot parse, falls
 * back to the host's default locale; this models a backend host whose default is English, which
 * is PHP's `en_US_POSIX` with nothing set, whatever the forwarder's host. A code ICU cannot name
 * is named by itself, or with `fallback: 'none'` is undefined.
 */
function displayName(type, code, visitor, fallback = 'code') {
    const unnamed = fallback === 'code' ? code : undefined;
    if (isIcuRoot(visitor)) return rootName(type, code);
    const names = new Intl.DisplayNames([icuData(visitor) ?? 'en'], { type, languageDisplay: 'standard', fallback });
    try {
        return names.of(code) ?? unnamed;
    } catch {
        return unnamed;
    }
}

/** ICU's root locale's names: a region and a currency by code, a locale by its subtags, `es (ES)`. */
function rootName(type, code) {
    if (type !== 'language') return code.toUpperCase();
    const [language, ...rest] = code.split('-');
    const subtags = rest.map((t) => (t.length === 4 ? t[0].toUpperCase() + t.slice(1) : t.toUpperCase()));
    return subtags.length ? `${language} (${subtags.join(', ')})` : language;
}

/**
 * PHP's locale_parse, for a display locale of the modelled shape: a language, then a script, a
 * region and variants, with no extension or private-use subtag. `root` and `und` alone are
 * empty, `und` names no language, a script is title-cased, a region of two or three letters or
 * three digits upper-cased, and each later subtag is a variant, upper-cased.
 */
function localeParse(locale) {
    if (locale === 'root' || locale === 'und') return [];
    const subtags = locale.split('_');
    const parsed = subtags[0] === 'und' ? [] : [['language', subtags[0].toLowerCase()]];
    let at = 1;
    if (/^[a-z]{4}$/i.test(subtags[at] ?? '')) parsed.push(['script', subtags[at][0].toUpperCase() + subtags[at++].slice(1).toLowerCase()]);
    if (/^(?:[a-z]{2,3}|\d{3})$/i.test(subtags[at] ?? '')) parsed.push(['region', subtags[at++].toUpperCase()]);
    for (let variant = 0; at < subtags.length; at++) parsed.push([`variant${variant++}`, subtags[at].toUpperCase()]);
    return parsed;
}

/**
 * Symfony Intl's Locale::getFallback: a locale of one subtag falls back to `en` when it is two or
 * three characters long, `en` to `root`, and any other to nothing; a longer one drops its last
 * subtag, through locale_compose, which throws when no language is left (`und_Latn_ES`).
 */
function symfonyFallback(locale) {
    const parsed = localeParse(locale);
    if (parsed.length === 1) {
        if (parsed[0][0] === 'language' && parsed[0][1] === 'en') return 'root';
        return locale.length < 4 ? 'en' : null;
    }
    parsed.pop();
    if (!parsed.length) return null;
    if (parsed[0][0] !== 'language') throw new LocaleComposeError(`locale_compose: no language in ${locale}`);
    return parsed.map(([, subtag]) => subtag).join('_');
}

/**
 * Symfony Intl's Currencies::getName as CurrencyController calls it, with the display locale's
 * `-` turned to `_` and its case kept. BundleEntryReader resolves an alias, reads the locale's
 * currency bundle if there is one, matched case-sensitively as on the backend's Linux hosts, and
 * otherwise falls back; so `zh-tw` reads `zh_tw`, has no bundle, and is named in `zh`. The first
 * bundle on the way that names the currency names it, as ICU names it in that bundle's locale,
 * and `root` by its code. Undefined where Symfony throws a MissingResourceException, which the
 * controller catches to keep the stored name; a LocaleComposeError where it throws a ValueError.
 */
function symfonyCurrencyName(code, visitor) {
    const currency = code.toUpperCase();
    let locale = String(visitor).replace(/-/g, '_');
    while (locale !== null) {
        if (Object.hasOwn(SYMFONY_INTL.locale_aliases, locale)) locale = SYMFONY_INTL.locale_aliases[locale];
        if (bundleNames(locale, currency)) return locale === 'root' ? currency : displayName('currency', currency, locale);
        locale = symfonyFallback(locale);
    }
    return undefined;
}

/** UsesLocales::_labelCase: the first character upper-cased. */
const labelCase = (name) => (name ? [...name][0].toUpperCase() + [...name].slice(1).join('') : name);
/** PHP's strcmp, byte order over UTF-8, which Sorteable and Collection::sortBy compare with. */
const strcmp = (a, b) => Buffer.compare(Buffer.from(String(a)), Buffer.from(String(b)));
const sortBy = (rows, field) => [...rows].sort((a, b) => strcmp(a[field], b[field]));
/** UsesLocales::getLang. */
const langOf = (code) => code.split('-')[0];

// ---------------------------------------------------------------------------------------
// The locale lists: LocaleController
// ---------------------------------------------------------------------------------------

/** UsesLocales::formatLocale. */
const formatLocale = (locale) => String(locale).replace(/_/g, '-').toLowerCase();

/** UsesLocales::formatLocaleCode: the organisation's code format, applied to a code stored lowercase. */
function formatLocaleCode(code, format) {
    if (format === 'lowercase-hyphen' || !code.includes('-')) return code;
    const at = code.indexOf('-');
    const [lang, region] = [code.slice(0, at), code.slice(at + 1)];
    return format === 'bcp47' ? `${lang}-${region.toUpperCase()}` : `${lang}_${region.toUpperCase()}`;
}

/** The three locale forms, each named in one display locale (UsesLocales). */
const LOCALE_FORMS = {
    // categorizeLocales: grouped by language name, groups by key, each group by name.
    locales: (tables, visitor) => {
        const groups = {};
        for (const code of tables.locales) {
            const language = labelCase(displayName('language', langOf(code), visitor));
            (groups[language] ??= []).push({ code, name: labelCase(displayName('language', code, visitor)) });
        }
        return Object.fromEntries(Object.keys(groups).sort(strcmp).map((language) => [language, sortBy(groups[language], 'name')]));
    },
    // getFlatLocales: by name.
    'locales/flat': (tables, visitor) => sortBy(tables.locales.map((code) => ({ code, name: labelCase(displayName('language', code, visitor)) })), 'name'),
    // getDetailedLocales: by locale name.
    'locales/data': (tables, visitor) =>
        sortBy(
            tables.locales.map((code) => ({
                code,
                locale_name: labelCase(displayName('language', code, visitor)),
                lang_name: labelCase(displayName('language', langOf(code), visitor)),
            })),
            'locale_name'
        ),
};

/** LocaleController::_formatLocaleResources: every resource's `code` in the organisation's format. */
function formatCodes(value, format) {
    if (Array.isArray(value)) return value.map((row) => ({ ...row, code: formatLocaleCode(row.code, format) }));
    return Object.fromEntries(Object.entries(value).map(([group, rows]) => [group, formatCodes(rows, format)]));
}

/** TrimStrings and ConvertEmptyStringsToNull: a value trimmed, an empty one null. */
function clean(value) {
    const t = value.trim();
    return t === '' ? null : t;
}

/**
 * A query key as PHP's parse_str names it, leading spaces dropped: a key with a bracketed part
 * (`locales[]`, `locales[a]`, `foo[bar]`) by the name before the bracket, with `index` the text
 * inside it, and in that name `.`, a space and an unclosed `[` as `_`, so
 * `append.target_locales` is `append_target_locales`. A key with no name (`=1`, `[x]`) is
 * dropped, as null.
 */
function phpQueryKey(name) {
    const key = name.replace(/^ +/, '');
    const open = key.indexOf('[');
    if (!key || open === 0) return null;
    const close = open > 0 ? key.indexOf(']', open) : -1;
    if (close < 0) return { field: key.replace(/[. []/g, '_'), index: null };
    return { field: key.slice(0, open).replace(/[. ]/g, '_'), index: key.slice(open + 1, close) };
}

/**
 * The query as LocalesIndexRequest receives it, keyed as PHP parses it, with each value cleaned.
 * As parse_str does, a field given twice takes its last value, and `locales` the shape of its last
 * key. A key without a bracket makes it a string, which lists nothing; a key with one adds to a
 * list, started anew if `locales` was not one: `[]` at the next index, `[k]` at index k, replacing
 * what was there. request-dto-processor formats each listed locale as UsesLocales::formatLocale
 * does, `_` to `-` and lowercased.
 */
function localesQuery(url) {
    const scalars = {};
    let locales = null;
    let next = 0;
    for (const [name, raw] of url.searchParams.entries()) {
        const key = phpQueryKey(name);
        if (!key) continue;
        const { field, index } = key;
        if (field === 'locales') {
            if (index === null) locales = clean(raw);
            else {
                if (!(locales instanceof Map)) [locales, next] = [new Map(), 0];
                // PHP keys an index that is a canonical integer by that integer.
                const at = index === '' ? next : /^(?:0|-?[1-9]\d*)$/.test(index) ? Number(index) : index;
                if (typeof at === 'number' && at >= next) next = at + 1;
                locales.set(at, clean(raw));
            }
        } else scalars[field] = clean(raw);
    }
    const listed = locales instanceof Map ? [...locales.values()].filter((value) => value !== null).map(formatLocale) : [];
    return { listed, scalars };
}

/**
 * GET /locales, /locales/flat, /locales/data, as the controller answers a request the API
 * accepted. The display locales are the `locales[]` the Locale table holds, in its order. The API
 * appends the project's target locales unless `append_target_locales` is false
 * (BooleanQueryParamCast's `false` or `0`), and always with a `project_id`; those are the clone's
 * project's, so such a request is an UnsupportedListError. Each display locale's entry is keyed,
 * and every code written, in the organisation's locale-code format. An empty answer is `[]`, as
 * PHP writes an empty map.
 */
function localeLists(tables, url, form) {
    const { listed, scalars } = localesQuery(url);
    if ((scalars.project_id ?? null) !== null || !['false', '0'].includes(scalars.append_target_locales ?? 'true')) {
        throw new UnsupportedListError("the crafted locale lists do not append a project's target locales, which the clone holds: ask with append_target_locales=0 and no project_id");
    }
    const format = tables.locale_code_format;
    const data = {};
    for (const visitor of tables.locales.filter((code) => listed.includes(code))) data[formatLocaleCode(visitor, format)] = formatCodes(LOCALE_FORMS[form](tables, visitor), format);
    return Object.keys(data).length ? data : [];
}

// ---------------------------------------------------------------------------------------
// The lists named in a display locale: CountryController, CurrencyController
// ---------------------------------------------------------------------------------------

/**
 * The rows of `countries/{locale}`, `countries/dial-codes/{locale}` and `currencies/{locale}`.
 * Nothing checks the display locale; it is named as `displayName` and `symfonyCurrencyName` say.
 */
const REFERENCE_LISTS = {
    // CountryController::index; CountryResource's default order is by label.
    countries: (tables, visitor) =>
        sortBy(tables.countries.map((c) => ({ label: displayName('region', c.code, visitor), code: c.code, eu: EU_COUNTRY_CODES.includes(c.code.toUpperCase()) })), 'label'),
    // CountryController::dialCode; DialCodeResource's default order is by name.
    'countries/dial-codes': (tables, visitor) =>
        sortBy(
            tables.dial_codes.map((d) => ({ country_code: d.country_code, dial_code: d.dial_code, name: `${displayName('region', d.country_code, visitor)} (+${d.dial_code})` })),
            'name'
        ),
    // CurrencyController::index: Symfony Intl's name, else, where Symfony throws a
    // MissingResourceException, the stored one. Table order.
    currencies: (tables, visitor) => tables.currencies.map((c) => ({ ...c, name: symfonyCurrencyName(c.code, visitor) ?? c.name })),
};
