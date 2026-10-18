#!/usr/bin/env node
/**
 * Langsys API contract double (spec CONF-2). One runnable HTTP server that every SDK's
 * tests start and point their API base URL at.
 *
 * It enforces the real contract, derived from the backend's own code: it refuses bad
 * auth, refuses writes from sessions that may not write, enforces the batch limit, answers
 * 204 where the real API does, and HOLDS STATE, so a second read observes what the first
 * write registered. `write_enabled` is computed from the key, the source address and any
 * write grant; it is never seeded as an answer.
 *
 * It offers no request log. A write is observable only as state: read back through the
 * real routes, or through `GET /__fixture/state`, which returns accepted state only — what
 * the real server would still hold afterwards, never what arrived. A declined hint is not
 * stored, so the state cannot be used to count attempts.
 *
 * Usage: `node server.mjs [--port N]`. Listens on 127.0.0.1 (an ephemeral port by default)
 * and prints one JSON line when ready:
 *   {"ready":true,"base_url":"http://127.0.0.1:PORT/api","fixture_url":"http://127.0.0.1:PORT/__fixture"}
 *
 * Node built-ins only. See README.md for the seed document and what is and is not modelled.
 */
import { createServer } from 'node:http';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

// ---------------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------------

const DEFAULT_CONFIG = Object.freeze({
    batch_limit: 200, // config langsys.translatable_items_batch_limit
    hint_rate_per_minute: 120, // config content_discovery.hint_rate_per_minute
    hint_dedup_ttl_seconds: 60, // config content_discovery.hint_dedup_ttl_seconds
    renderer_egress_ips: [], // config content_discovery.renderer_egress_ips
    legacy_omit_capability: false, // a server that predates write_enabled, auto_discovery and discovery_base_locale_only
    // Reproduces the backend's current drop of an uncategorised content block, which
    // answers 200 and stores nothing. Off by default: the double models the decided
    // behaviour, under which such a block registers. For a regression row only.
    drop_uncategorized_blocks: false,
});

let state = emptyState();

function emptyState() {
    return {
        config: { ...DEFAULT_CONFIG },
        projects: new Map(),
        keys: new Map(),
        faults: [],
        hints: [], // accepted hints only, as the server stores them
        hintRate: new Map(), // source ip -> { count, resetAt }
        hintDedup: new Map(), // `${key}|${dedupKey}` -> expiresAt
        duplicateGuard: new Map(), // request hash -> { count, resetAt }
        // The reference tables (Locale, Country, DialCode, Currency), in table order.
        reference: { locales: [], countries: [], dial_codes: [], currencies: [] },
        clockOffsetMs: 0,
    };
}

const now = () => Date.now() + state.clockOffsetMs;

function seed(doc) {
    const next = emptyState();
    next.config = { ...DEFAULT_CONFIG, ...(doc.config ?? {}) };
    for (const p of doc.projects ?? []) {
        if (!p || typeof p.id !== 'string') throw new Error('every project needs a string id');
        const project = {
            id: p.id,
            title: p.title ?? p.id,
            base_locale: lower(p.base_locale ?? 'en-us'),
            target_locales: (p.target_locales ?? []).map(lower),
            website_url: p.website_url ?? null,
            machine_translate_new_phrases: p.machine_translate_new_phrases ?? true,
            subscription_suspended: p.subscription_suspended === true,
            credits_exhausted: p.credits_exhausted === true,
            discovery_base_locale_only: p.discovery_base_locale_only ?? false,
            // HumanTranslationLimitService: the plan's cap on words added as new human
            // translations in a rolling window (null = uncapped), and the words already used.
            human_translation_word_limit: p.human_translation_word_limit ?? null,
            human_translation_words_used: p.human_translation_words_used ?? 0,
            // The organization's settings.locales.locale_code_format (LocaleCodeFormat).
            locale_code_format: p.locale_code_format ?? 'lowercase-hyphen',
            phrases: new Map(),
            blocks: new Map(),
        };
        if (!LOCALE_CODE_FORMATS.includes(project.locale_code_format)) {
            throw new Error(`project ${p.id}: locale_code_format must be one of ${LOCALE_CODE_FORMATS.join(', ')}`);
        }
        for (const ph of p.phrases ?? []) upsertPhrase(project, ph.category ?? null, ph.phrase, ph.translations);
        for (const b of p.blocks ?? []) {
            upsertBlock(project, b.category ?? null, b.custom_id, b.content ?? null, b.label ?? null, b.phrases ?? []);
        }
        next.projects.set(project.id, project);
    }
    for (const k of doc.keys ?? []) {
        if (!k || typeof k.key !== 'string') throw new Error('every key needs a string key');
        if (!['read', 'write', 'ip_write'].includes(k.type)) throw new Error(`key ${k.key}: type must be read, write or ip_write`);
        if (k.project !== null && k.project !== undefined && !next.projects.has(k.project)) {
            throw new Error(`key ${k.key}: project ${k.project} is not seeded`);
        }
        next.keys.set(k.key, {
            key: k.key,
            project: k.project ?? null,
            type: k.type,
            ip_allowlist: k.ip_allowlist ?? [],
            write_grant_secret: k.write_grant_secret ?? null,
            report_discovered_content: k.report_discovered_content === true,
            usage_exhausted: k.usage_exhausted === true,
            duplicate_guard: k.duplicate_guard ?? null,
        });
    }
    next.reference = seedReference(doc.reference ?? {});
    next.faults = (doc.faults ?? []).map((f) => ({ ...f, times: f.times ?? 1 }));
    next.clockOffsetMs = state.clockOffsetMs;
    state = next;
}

const lower = (s) => (typeof s === 'string' ? s.toLowerCase() : s);

const LOCALE_CODE_FORMATS = ['lowercase-hyphen', 'bcp47', 'posix'];

/** The reference tables, as the seeders fill them: locale codes as stored (lowercase), the rest as rows. */
function seedReference(ref) {
    const strings = (list, what) => {
        if (!Array.isArray(list) || list.some((v) => typeof v !== 'string' || v === '')) throw new Error(`reference.${what} must be a list of non-empty strings`);
        return list;
    };
    const rows = (list, what, fields) => {
        if (!Array.isArray(list)) throw new Error(`reference.${what} must be a list`);
        return list.map((row) => {
            for (const f of fields) if (typeof row?.[f] !== 'string' || row[f] === '') throw new Error(`reference.${what}: every row needs a string ${f}`);
            return { ...row };
        });
    };
    return {
        locales: strings(ref.locales ?? [], 'locales').map(lower),
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
    };
}
const itemKey = (category, text) => JSON.stringify([category ?? null, text]);

function upsertPhrase(project, category, phrase, translations = {}) {
    const k = itemKey(category, phrase);
    const existing = project.phrases.get(k);
    if (existing) return;
    project.phrases.set(k, { category: category ?? null, phrase, translations: lowerKeys(translations) });
}

function upsertBlock(project, category, customId, content, label, phrases) {
    const k = itemKey(category, customId);
    const block = project.blocks.get(k) ?? { category: category ?? null, custom_id: customId, content, label, phrases: [] };
    for (const p of phrases) {
        if (!block.phrases.some((q) => q.phrase === p.phrase)) {
            block.phrases.push({ phrase: p.phrase, translations: lowerKeys(p.translations ?? {}) });
        }
    }
    project.blocks.set(k, block);
}

function lowerKeys(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj ?? {})) out[lower(k)] = v;
    return out;
}

// ---------------------------------------------------------------------------------------
// Input handling, mirroring the backend's global TrimStrings + ConvertEmptyStringsToNull
// ---------------------------------------------------------------------------------------

function clean(value) {
    if (typeof value === 'string') {
        const t = value.trim();
        return t === '' ? null : t;
    }
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) out[k] = clean(v);
        return out;
    }
    return value;
}

// ---------------------------------------------------------------------------------------
// Addresses and grants
// ---------------------------------------------------------------------------------------

function sourceIp(req) {
    const ip = req.socket.remoteAddress ?? '';
    return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function ipMatches(ip, list) {
    return list.some((entry) => {
        if (!entry.includes('/')) return entry === ip;
        const [base, bitsText] = entry.split('/');
        const bits = Number(bitsText);
        const toInt = (a) => a.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
        if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip) || !/^\d+\.\d+\.\d+\.\d+$/.test(base)) return false;
        const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
        return (toInt(ip) & mask) === (toInt(base) & mask);
    });
}

/** WriteGrantService: HS256 with the key's own secret, exp required, 60s leeway, non-empty sub. */
function hasValidWriteGrant(key, req) {
    const token = header(req, 'x-write-grant');
    if (!key.write_grant_secret || !token) return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    try {
        const head = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        if (head.alg !== 'HS256') return false;
        const expected = createHmac('sha256', key.write_grant_secret).update(`${parts[0]}.${parts[1]}`).digest();
        const given = Buffer.from(parts[2], 'base64url');
        if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
        const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        const t = Math.floor(now() / 1000);
        const LEEWAY = 60;
        if (typeof claims.exp !== 'number') return false;
        if (t - LEEWAY >= claims.exp) return false;
        if (typeof claims.nbf === 'number' && claims.nbf > t + LEEWAY) return false;
        if (typeof claims.iat === 'number' && claims.iat > t + LEEWAY) return false;
        return typeof claims.sub === 'string' && claims.sub !== '';
    } catch {
        return false;
    }
}

function allowsWrite(key, req) {
    const byType =
        key.type === 'write' ||
        (key.type === 'ip_write' && ipMatches(sourceIp(req), [...key.ip_allowlist, ...state.config.renderer_egress_ips]));
    return byType || hasValidWriteGrant(key, req);
}

// ---------------------------------------------------------------------------------------
// Middleware, in the backend's order
// ---------------------------------------------------------------------------------------

const header = (req, name) => {
    const v = req.headers[name];
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};
/**
 * Error bodies, as the backend renders them (Handler::render, ApiResponse::errorResponse):
 * `{status:false, error:{message, code, template[, params][, details][, errors]}}`. A plain
 * ApiErrors case has its message as its template and no params.
 */
const apiError = (code, message, extra = {}) => ({ status: false, error: { message, code, template: message, ...extra } });
/** ValidationFailedError: one entry per failed rule, each with its field, code and template. */
const validationFailed = (entries) => ({
    status: false,
    error: { message: 'The request failed validation.', code: 'validation_failed', template: 'The request failed validation.', errors: entries },
});
const entry = (field, code, message, template = message, params = null) =>
    params ? { field, code, message, template, params } : { field, code, message, template };

/** The ApiErrors cases these routes answer with (ApiErrors.php at langsys main 17a191cd). */
const ERRORS = {
    unauthenticated: () => [401, apiError('unauthenticated', 'Unauthenticated.')],
    apiKeyInvalid: () => [403, apiError('api_key_invalid', 'Invalid API key')],
    apiKeyWriteNotAllowed: () => [403, apiError('api_key_write_not_allowed', 'This API key cannot make write requests.')],
    subscriptionSuspended: () => [
        402,
        apiError('subscription_suspended', 'Subscription is suspended due to non-payment. Please pay the outstanding invoice to restore access.'),
    ],
    projectUnavailable: () => [403, apiError('project_unavailable', 'This project is not available. Its owners can see why in Langsys.')],
    apiUnitsLimitExceeded: () => [402, apiError('api_units_limit_exceeded', 'Monthly API usage units limit exceeded. Upgrade your plan to continue.')],
    duplicateRequest: () => [429, apiError('duplicate_request', 'Too many identical requests. Please wait a moment before retrying.')],
    tooManyRequests: () => [429, apiError('too_many_requests', 'Too many requests. Please try again later.')],
    forbidden: () => [403, apiError('forbidden', 'Forbidden.')],
    notFound: () => [404, apiError('not_found', 'Resource not found')],
    methodNotAllowed: () => [405, apiError('method_not_allowed', 'The requested method is not allowed for this route.')],
};

/** ApiErrorService::forStatus: the case a bare HTTP status renders as; any other status is internal_error. */
const STATUS_ERRORS = {
    400: ['bad_request', 'Bad request.'],
    401: ['unauthenticated', 'Unauthenticated.'],
    402: ['payment_required', 'Payment required.'],
    403: ['forbidden', 'Forbidden.'],
    404: ['not_found', 'Resource not found'],
    405: ['method_not_allowed', 'The requested method is not allowed for this route.'],
    409: ['conflict', 'Conflict.'],
    410: ['gone', 'Gone.'],
    422: ['unprocessable_entity', 'Unprocessable entity.'],
    429: ['too_many_requests', 'Too many requests. Please try again later.'],
    500: ['internal_error', 'Internal server error.'],
    502: ['external_service_error', 'External service error.'],
    503: ['service_unavailable', 'Service unavailable.'],
};
const statusError = (status) => apiError(...(STATUS_ERRORS[status] ?? STATUS_ERRORS[500]));

/** prevent-duplicate-requests: only for keys configured for it. */
function duplicateGuard(req, url, body) {
    const raw = header(req, 'x-authorization');
    const key = raw ? state.keys.get(raw) : null;
    const cfg = key?.duplicate_guard;
    if (!cfg) return null;
    const methods = cfg.methods ?? ['*'];
    if (!methods.includes('*') && !methods.includes(req.method)) return null;
    const hash = createHash('sha256').update(JSON.stringify([url, req.method, body, raw])).digest('hex');
    const t = now();
    const entry = state.duplicateGuard.get(hash);
    const windowMs = (cfg.window_seconds ?? 1) * 1000;
    if (!entry || entry.resetAt <= t) state.duplicateGuard.set(hash, { count: 1, resetAt: t + windowMs });
    else entry.count += 1;
    if (state.duplicateGuard.get(hash).count > (cfg.max_attempts ?? 3)) {
        return ERRORS.duplicateRequest();
    }
    return null;
}

/**
 * auth.apikey (AuthorizeApiKey). Returns [status, body] on refusal, else { key, project,
 * writeEnabled }. A missing key is 401 here on authorize-project; on the catalog and
 * registration routes `auth:sanctum` answers it first (`sanctum`).
 */
function authApiKey(req) {
    const raw = header(req, 'x-authorization');
    if (!raw) return ERRORS.unauthenticated();
    const key = state.keys.get(raw);
    if (!key) return ERRORS.apiKeyInvalid();
    const project = key.project ? state.projects.get(key.project) : null;
    if (!project) return ERRORS.apiKeyInvalid();
    // A suspended project: a write key is told why; any other key, only that it is unavailable.
    if (project.subscription_suspended) return key.type === 'write' ? ERRORS.subscriptionSuspended() : ERRORS.projectUnavailable();
    const writeEnabled = allowsWrite(key, req);
    if (req.method === 'GET' || writeEnabled) return { key, project, writeEnabled };
    return ERRORS.apiKeyWriteNotAllowed();
}

/** auth:sanctum, first on the catalog and registration routes: no X-Authorization is 401 before anything else. */
const sanctum = (req) => (header(req, 'x-authorization') ? null : ERRORS.unauthenticated());

/** deduct.request */
const deductRequest = (key) => (key.usage_exhausted ? ERRORS.apiUnitsLimitExceeded() : null);

// ---------------------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------------------

const words = (text) => String(text).split(/\s+/).filter(Boolean).length;

function catalog(project, locale) {
    const loc = lower(locale);
    const data = {};
    let total = 0;
    let untranslated = 0;
    const place = (category) => (data[category] ??= {});
    for (const p of project.phrases.values()) {
        const value = p.translations[loc] ?? null;
        place(p.category ?? '__uncategorized__')[p.phrase] = value;
        total += words(p.phrase);
        if (value === null) untranslated += words(p.phrase);
    }
    for (const b of project.blocks.values()) {
        const inner = {};
        for (const p of b.phrases) {
            const value = p.translations[loc] ?? null;
            inner[p.phrase] = value;
            total += words(p.phrase);
            if (value === null) untranslated += words(p.phrase);
        }
        // An uncategorised block is served under the same key uncategorised phrases use.
        place(b.category ?? '__uncategorized__')[b.custom_id] = inner;
    }
    const empty = Object.keys(data).length === 0;
    return {
        data: empty ? [] : data,
        additional: { words: total, untranslated_words: untranslated, untranslatedWords: untranslated },
    };
}

// ---------------------------------------------------------------------------------------
// Hints: HintUrl, ported
// ---------------------------------------------------------------------------------------

const TRACKING_PARAMS = ['gclid', 'fbclid', 'msclkid', 'mc_cid', 'mc_eid', 'ref', 'ref_src'];

function normalizeHintUrl(url) {
    let u;
    try {
        u = new URL(String(url).trim());
    } catch {
        return null;
    }
    const scheme = u.protocol.replace(/:$/, '').toLowerCase();
    if (scheme !== 'http' && scheme !== 'https') return null;
    if (!u.hostname) return null;
    const params = [...u.searchParams.entries()].filter(
        ([k]) => !TRACKING_PARAMS.includes(k) && !k.startsWith('utm_')
    );
    params.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const query = params.length ? '?' + new URLSearchParams(params).toString() : '';
    const fragment = u.hash.startsWith('#') ? u.hash.slice(1) : '';
    const route = fragment.startsWith('!/') ? fragment.slice(1) : fragment;
    const keptFragment = route.startsWith('/') && route.replace(/\/+$/, '') !== '' ? '#' + fragment : '';
    const port = u.port ? ':' + u.port : '';
    return `${scheme}://${u.hostname.toLowerCase()}${port}${u.pathname === '/' && !url.includes(u.host + '/') ? '' : u.pathname}${query}${keptFragment}`;
}

const dedupKey = (normalized) => normalized.replace('#!/', '#/');

function hostMatches(url, siteUrl) {
    if (!url || !siteUrl) return false;
    let page, site;
    try {
        page = new URL(url).hostname.toLowerCase();
        site = new URL(siteUrl).hostname.toLowerCase();
    } catch {
        return false;
    }
    const base = site.startsWith('www.') ? site.slice(4) : site;
    return page === base || page.endsWith('.' + base);
}

/** ContentDiscoveryHintService::handle, in its order. Stores a hint only when accepted. */
function handleHint(key, req, pageUrl) {
    const project = key.project ? state.projects.get(key.project) : null;
    // Sensitive-URL declining is NOT modelled: SDKs decline those before sending (README).
    if (allowsWrite(key, req)) return 'caller_can_write';
    if (!key.report_discovered_content) return 'discovery_disabled';
    if (ipMatches(sourceIp(req), state.config.renderer_egress_ips)) return 'from_renderer_egress';
    if (!(key.type === 'ip_write' && state.config.renderer_egress_ips.length > 0)) return 'key_never_writable';
    const normalized = normalizeHintUrl(pageUrl);
    if (normalized === null) return 'url_unnormalizable';
    const slot = `${key.key}|${dedupKey(normalized)}`;
    const t = now();
    const held = state.hintDedup.get(slot);
    if (held !== undefined && held > t) return 'deduped';
    state.hintDedup.set(slot, t + state.config.hint_dedup_ttl_seconds * 1000);
    if (!project || !hostMatches(normalized, project.website_url)) return 'host_mismatch';
    if (!(project.machine_translate_new_phrases && project.target_locales.length > 0)) return 'project_not_translating';
    if (project.credits_exhausted) return 'insufficient_credits';
    state.hints.push({ project_id: project.id, url: normalized });
    return 'accepted';
}

function hintThrottle(req) {
    const ip = sourceIp(req);
    const t = now();
    const entry = state.hintRate.get(ip);
    if (!entry || entry.resetAt <= t) {
        state.hintRate.set(ip, { count: 1, resetAt: t + 60_000 });
        return false;
    }
    entry.count += 1;
    return entry.count > state.config.hint_rate_per_minute;
}

// ---------------------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------------------

/**
 * GET /authorize-project/{project}: RouteModelBinding (an unknown project is 404) →
 * prevent-duplicate → auth.apikey (a missing key is 401 here) → deduct → the controller,
 * which answers a key for another project as an invalid key.
 */
function authorizeProject(req, projectId, url) {
    const project = state.projects.get(projectId);
    if (!project) return ERRORS.notFound();
    const dup = duplicateGuard(req, url, null);
    if (dup) return dup;
    const auth = authApiKey(req);
    if (Array.isArray(auth)) return auth;
    const deduct = deductRequest(auth.key);
    if (deduct) return deduct;
    if (auth.key.project !== project.id) return ERRORS.apiKeyInvalid();
    const data = {
        id: project.id,
        title: project.title,
        base_locale: project.base_locale,
        target_locales: project.target_locales,
        default_locales: Object.fromEntries(project.target_locales.map((l) => [l.split('-')[0], l])),
        key_type: auth.key.type,
        ...(state.config.legacy_omit_capability
            ? {}
            : {
                  write_enabled: auth.writeEnabled,
                  auto_discovery: auth.key.report_discovered_content,
                  discovery_base_locale_only: project.discovery_base_locale_only,
              }),
        langsys_settings: { translatable_items: { batch_limit: state.config.batch_limit } },
    };
    return [200, { status: true, data }];
}

/**
 * GET /translations[/data]: auth:sanctum (no key is 401) → RouteModelBinding (an unknown
 * `project_id` is 404) → prevent-duplicate → auth.apikey → request-dto-processor (a missing
 * locale is 422) → deduct → the DTO's own validation (a missing `project_id` is 422) →
 * AccessGuard (a key for another project is 403 forbidden).
 */
function translations(req, query, url) {
    const unauthenticated = sanctum(req);
    if (unauthenticated) return unauthenticated;
    const project = query.project_id ? state.projects.get(query.project_id) : null;
    if (query.project_id && !project) return ERRORS.notFound();
    const dup = duplicateGuard(req, url, null);
    if (dup) return dup;
    const auth = authApiKey(req);
    if (Array.isArray(auth)) return auth;
    // ValidLocale validates a missing locale too (ValidatesWhenMissing): FieldErrors::InvalidLocale.
    if (!query.locale) return [422, validationFailed([entry('locale', 'invalid_option', 'The locale is not valid.')])];
    const deduct = deductRequest(auth.key);
    if (deduct) return deduct;
    if (!project) return [422, validationFailed([entry('project_id', 'required', 'The project is required.')])];
    if (auth.key.project !== project.id) return ERRORS.forbidden();
    const { data, additional } = catalog(project, query.locale);
    const envelope = { status: true, ...additional };
    if (!state.config.legacy_omit_capability) {
        envelope.write_enabled = auth.writeEnabled;
        // Top-level, beside write_enabled and never inside `data`, on both catalog routes.
        envelope.discovery_base_locale_only = project.discovery_base_locale_only;
    }
    envelope.data = data;
    return [200, envelope];
}

/**
 * POST /translatable-items: auth:sanctum → RouteModelBinding → prevent-duplicate →
 * auth.apikey → validate-batch-size → deduct → the DTO's own validation (`project_id`
 * required, `translatable_items` a list, both reported together) → AccessGuard → the
 * target-locale check → writes.
 */
function translatableItems(req, body, url) {
    const unauthenticated = sanctum(req);
    if (unauthenticated) return unauthenticated;
    const project = body?.project_id ? state.projects.get(body.project_id) : null;
    if (body?.project_id && !project) return ERRORS.notFound();
    const dup = duplicateGuard(req, url, body);
    if (dup) return dup;
    const auth = authApiKey(req);
    if (Array.isArray(auth)) return auth;
    const items = body?.translatable_items;
    const count = Array.isArray(items) ? items.length : 0;
    if (count > state.config.batch_limit) {
        // BatchSizeExceededError: its values are details, not template markers.
        const message = 'The request has more translatable items than one batch allows.';
        return [422, apiError('batch_size_exceeded', message, { details: { limit: state.config.batch_limit, item_count: count } })];
    }
    const deduct = deductRequest(auth.key);
    if (deduct) return deduct;
    const invalid = [];
    if (!project) invalid.push(entry('project_id', 'required', 'The project is required.'));
    if (!Array.isArray(items)) invalid.push(entry('translatable_items', 'invalid_type', 'The translatable items must be a list.'));
    if (invalid.length) return [422, validationFailed(invalid)];
    if (auth.key.project !== project.id) return ERRORS.forbidden();
    // ProvidedTranslationService::assertTargetLocales: a translation for a locale the project
    // does not translate into is refused before anything is written.
    const refused = assertTargetLocales(project, items);
    if (refused) return refused;
    // TranslatableItemService::_prepareBatchData: skips, never rejects.
    for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const type = item.type ?? null;
        if (type === 'phrase' || type === null) {
            if (!item.phrase || item.category === '__uncategorized__') continue;
            upsertPhrase(project, item.category ?? null, item.phrase);
        } else {
            // An uncategorised block arrives with a null category, because empty strings
            // become null on input. It registers. `drop_uncategorized_blocks` reproduces
            // the backend's current behaviour, which skips every phrase of such a block.
            const uncategorised = item.category === null || item.category === undefined;
            if (uncategorised && state.config.drop_uncategorized_blocks) continue;
            const phrases = (item.phrases ?? []).filter((p) => p && p.phrase);
            if (!phrases.length) continue;
            upsertBlock(project, item.category ?? null, item.custom_id ?? null, item.content ?? null, item.label ?? null, phrases);
        }
    }
    const outcome = storeProvidedTranslations(project, items);
    // RegisteredTranslatableItemsResource, through resourceResponse.
    return [200, { status: true, data: { human_translations_saved: outcome.saved, human_translations_skipped: outcome.skipped } }];
}

// ---------------------------------------------------------------------------------------
// Translations sent with the phrases: ProvidedTranslationService, ported
// ---------------------------------------------------------------------------------------

/** UsesLocales::formatLocale. */
const formatLocale = (locale) => String(locale).replace(/_/g, '-').toLowerCase();

/**
 * A `translations` key that is not one of the project's target locales answers 422, as a
 * FieldValidationException renders through ValidationExceptionHandler: one entry, on the
 * item's `translations` field, with TranslationLocaleNotTargetFieldError's code and template.
 */
function assertTargetLocales(project, items) {
    for (const [index, item] of items.entries()) {
        const map = item && typeof item === 'object' && item.translations && typeof item.translations === 'object' ? item.translations : {};
        for (const raw of Object.keys(map)) {
            const locale = formatLocale(raw);
            if (project.target_locales.includes(locale)) continue;
            const template = 'The locale {locale} is not a target locale of this project.';
            return [422, validationFailed([entry(`translatable_items.${index}.translations`, 'invalid_option', template.replace('{locale}', locale), template, { locale })])];
        }
    }
    return null;
}

/**
 * Store each registered phrase's provided translations as human translations, served on
 * later catalog reads. Content blocks, untranslatable phrases and items that registered
 * nothing are ignored. A new translation counts its phrase's words against the cap; one
 * that would exceed what is left is skipped (its locale is left for machine translation).
 * Replacing a translation the phrase already has is an update and counts nothing.
 */
function storeProvidedTranslations(project, items) {
    const outcome = { saved: 0, skipped: 0 };
    const limit = project.human_translation_word_limit;
    for (const item of items) {
        if (!item || typeof item !== 'object' || !item.translations || typeof item.translations !== 'object') continue;
        if ((item.type ?? 'phrase') !== 'phrase' || item.translatable === false) continue;
        const phrase = item.phrase ? project.phrases.get(itemKey(item.category ?? null, item.phrase)) : null;
        if (!phrase) continue;
        for (const [raw, value] of Object.entries(item.translations)) {
            const locale = formatLocale(raw);
            const text = value === null || value === undefined ? '' : String(value);
            const cost = words(phrase.phrase);
            const isNew = !(locale in phrase.translations);
            const remaining = limit === null ? null : Math.max(0, limit - project.human_translation_words_used);
            if (isNew && remaining !== null && cost > remaining) {
                outcome.skipped++;
                continue;
            }
            outcome.saved++;
            // TranslationService::createTranslation with no text undoes an untranslatable
            // mark and writes no translation.
            if (!text) continue;
            phrase.translations[locale] = text;
            if (isNew) project.human_translation_words_used += cost;
        }
    }
    return outcome;
}

/**
 * POST /discovery/hint: throttle:hint → the DTO's validation of `page_url`
 * (`#[Url, Max(2048)] string`, every failed rule reported) → the acceptance rules. No
 * API-key middleware runs: an unknown key is answered 204 like any other.
 */
function discoveryHint(req, body) {
    if (hintThrottle(req)) return ERRORS.tooManyRequests();
    const pageUrl = body?.page_url;
    const invalid = [];
    if (pageUrl === null || pageUrl === undefined) invalid.push(entry('page_url', 'required', 'The page URL is required.'));
    else if (typeof pageUrl !== 'string') invalid.push(entry('page_url', 'invalid_type', 'The page URL must be text.'));
    else {
        try {
            new URL(pageUrl);
        } catch {
            invalid.push(entry('page_url', 'invalid_format', 'The page URL must be a valid URL.'));
        }
        if (pageUrl.length > 2048) {
            const template = 'The page URL must not be longer than {max} characters.';
            invalid.push(entry('page_url', 'too_long', template.replace('{max}', '2048'), template, { max: 2048 }));
        }
    }
    if (invalid.length) return [422, validationFailed(invalid)];
    const raw = header(req, 'x-authorization');
    const key = raw ? state.keys.get(raw) : null;
    if (key) handleHint(key, req, pageUrl);
    return [204, null];
}

// ---------------------------------------------------------------------------------------
// Reference reads: LocaleController, CountryController, CurrencyController, ported
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
 * ICU's display names, which the backend reads through PHP's \Locale. ICU's root locale (`root`,
 * `root_ES`, `und`) names a region by its code and a locale by its subtags (`es (ES)`). A display
 * locale ICU has no data for, or cannot parse, falls back to the host's default locale; the
 * double models a backend host whose default is English, which is PHP's `en_US_POSIX` with
 * nothing set. A code ICU cannot name is named by itself, or with `fallback: 'none'` is
 * undefined.
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

/** PHP's locale_compose given no language: a ValueError, which CurrencyController does not catch. */
class LocaleComposeError extends Error {}

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
    locales: (visitor) => {
        const groups = {};
        for (const code of state.reference.locales) {
            const language = labelCase(displayName('language', langOf(code), visitor));
            (groups[language] ??= []).push({ code, name: labelCase(displayName('language', code, visitor)) });
        }
        return Object.fromEntries(Object.keys(groups).sort(strcmp).map((language) => [language, sortBy(groups[language], 'name')]));
    },
    // getFlatLocales: by name.
    'locales/flat': (visitor) => sortBy(state.reference.locales.map((code) => ({ code, name: labelCase(displayName('language', code, visitor)) })), 'name'),
    // getDetailedLocales: by locale name.
    'locales/data': (visitor) =>
        sortBy(
            state.reference.locales.map((code) => ({
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

/** LocalesIndexRequest's declared fields: request-dto-processor refuses any other query key. */
const LOCALES_INDEX_FIELDS = ['locales', 'project_id', 'append_target_locales', 'user_locale'];

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
 * The query as LocalesIndexRequest receives it, keyed as PHP parses it, with TrimStrings and
 * ConvertEmptyStringsToNull applied: each value trimmed, an empty one null. As parse_str does, a
 * field given twice takes its last value, and `locales` the shape of its last key. A key without
 * a bracket makes it a string, not a list, or absent when empty; a key with one adds to a list,
 * started anew if `locales` was not one: `[]` at the next index, `[k]` at index k, replacing
 * what was there. request-dto-processor formats each listed locale as UsesLocales::formatLocale
 * does, `_` to `-` and lowercased. `undeclared` is every key the DTO does not declare, in order.
 */
function localesQuery(url) {
    const undeclared = [];
    const scalars = {};
    let locales = null;
    let next = 0;
    for (const [name, raw] of url.searchParams.entries()) {
        const key = phpQueryKey(name);
        if (!key) continue;
        const { field, index } = key;
        if (!LOCALES_INDEX_FIELDS.includes(field)) {
            if (!undeclared.includes(field)) undeclared.push(field);
        } else if (field === 'locales') {
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
    const scalar = typeof locales === 'string';
    const listed = locales instanceof Map ? [...locales.values()].filter((value) => value !== null).map(formatLocale) : [];
    return { listed, scalar, undeclared, scalars };
}

/**
 * GET /locales, /locales/flat, /locales/data: auth:sanctum → prevent-duplicate → auth.apikey →
 * request-dto-processor (an undeclared query key is 422 `not_allowed`; `locales[]` formatted)
 * → deduct → BooleanQueryParamCast and LocalesIndexRequest's validation → the controller. The
 * display locales are the `locales[]` the Locale table holds; the key's project's target
 * locales are appended unless `append_target_locales` is false, and always with a
 * `project_id`. Each display locale's entry is keyed, and every code written, in the
 * organisation's locale-code format. An empty answer is `data: []`, as PHP writes an empty map.
 */
function localeLists(req, url, form, fullUrl) {
    const unauthenticated = sanctum(req);
    if (unauthenticated) return unauthenticated;
    const dup = duplicateGuard(req, fullUrl, null);
    if (dup) return dup;
    const auth = authApiKey(req);
    if (Array.isArray(auth)) return auth;
    const { listed, scalar, undeclared, scalars } = localesQuery(url);
    if (undeclared.length) return [422, validationFailed(undeclared.map((field) => entry(field, 'not_allowed', 'This field is not allowed.')))];
    const deduct = deductRequest(auth.key);
    if (deduct) return deduct;

    const flag = scalars.append_target_locales ?? null;
    // BooleanQueryParamCast reads 'true', 'false', '1' and '0'; anything else fails `boolean`.
    const append = flag === null ? true : ['true', '1'].includes(flag) ? true : ['false', '0'].includes(flag) ? false : undefined;
    const invalid = [];
    if (scalar) invalid.push(entry('locales', 'invalid_type', 'The locales must be a list.'));
    if (append === undefined) invalid.push(entry('append_target_locales', 'invalid_type', 'The append target locales setting must be true or false.'));
    if (invalid.length) return [422, validationFailed(invalid)];

    // _getRequestLocales: the listed locales the Locale table holds, in its order, then targets.
    const table = state.reference.locales;
    let requested = table.filter((code) => listed.includes(code));
    let project = auth.project;
    const projectId = scalars.project_id ?? null;
    if (projectId !== null) {
        // gateByKey('belongsToProject'): a project the key does not belong to is forbidden.
        project = state.projects.get(projectId) ?? null;
        if (!project || auth.key.project !== project.id) return ERRORS.forbidden();
        requested = [...requested, ...project.target_locales];
    } else if (append) requested = [...requested, ...project.target_locales];
    requested = [...new Set(requested)];
    const format = project.locale_code_format;

    // `data` names only the requested locales the table holds, in the table's order.
    const visitors = form === 'locales/data' ? table.filter((code) => requested.includes(code)) : requested;
    const data = {};
    for (const visitor of visitors) data[formatLocaleCode(visitor, format)] = formatCodes(LOCALE_FORMS[form](visitor), format);
    return [200, { status: true, data: Object.keys(data).length ? data : [] }];
}

/** The rows of `countries/{locale}`, `countries/dial-codes/{locale}` and `currencies/{locale}`, named in the display locale. */
const REFERENCE_LISTS = {
    // CountryController::index; CountryResource's default order is by label.
    countries: (visitor) =>
        sortBy(state.reference.countries.map((c) => ({ label: displayName('region', c.code, visitor), code: c.code, eu: EU_COUNTRY_CODES.includes(c.code.toUpperCase()) })), 'label'),
    // CountryController::dialCode; DialCodeResource's default order is by name.
    'countries/dial-codes': (visitor) =>
        sortBy(
            state.reference.dial_codes.map((d) => ({ country_code: d.country_code, dial_code: d.dial_code, name: `${displayName('region', d.country_code, visitor)} (+${d.dial_code})` })),
            'name'
        ),
    // CurrencyController::index: Symfony Intl's name, else, where Symfony throws, the stored
    // one. Table order.
    currencies: (visitor) => state.reference.currencies.map((c) => ({ ...c, name: symfonyCurrencyName(c.code, visitor) ?? c.name })),
};

/**
 * GET /countries/{locale}, /countries/dial-codes/{locale}, /currencies/{locale}: auth:sanctum →
 * prevent-duplicate → auth.apikey → deduct → the controller. Nothing checks the display locale;
 * it is named as `displayName` and `symfonyCurrencyName` say.
 */
function referenceList(req, list, visitor, fullUrl) {
    const unauthenticated = sanctum(req);
    if (unauthenticated) return unauthenticated;
    const dup = duplicateGuard(req, fullUrl, null);
    if (dup) return dup;
    const auth = authApiKey(req);
    if (Array.isArray(auth)) return auth;
    const deduct = deductRequest(auth.key);
    if (deduct) return deduct;
    try {
        return [200, { status: true, data: REFERENCE_LISTS[list](visitor) }];
    } catch (error) {
        // An exception the controller does not catch, rendered as the backend renders one.
        if (error instanceof LocaleComposeError) return [500, statusError(500)];
        throw error;
    }
}

// ---------------------------------------------------------------------------------------
// Setup namespace: seed, reset, clock, and accepted state
// ---------------------------------------------------------------------------------------

function acceptedState() {
    const projects = {};
    for (const p of state.projects.values()) {
        projects[p.id] = {
            human_translation_words_used: p.human_translation_words_used,
            phrases: [...p.phrases.values()].map(({ category, phrase, translations }) => ({ category, phrase, translations })),
            blocks: [...p.blocks.values()].map(({ category, custom_id, content, label, phrases }) => ({
                category,
                custom_id,
                content,
                label,
                phrases,
            })),
        };
    }
    return { projects, hints: state.hints.map((h) => ({ ...h })) };
}

function fixtureRoute(method, path, body) {
    if (method === 'POST' && path === '/seed') {
        try {
            seed(body ?? {});
        } catch (err) {
            return [400, { ok: false, error: String(err.message ?? err) }];
        }
        return [200, { ok: true }];
    }
    if (method === 'POST' && path === '/reset') {
        const offset = state.clockOffsetMs;
        state = emptyState();
        state.clockOffsetMs = offset;
        return [200, { ok: true }];
    }
    if (method === 'POST' && path === '/clock') {
        const seconds = Number(body?.advance_seconds ?? 0);
        if (!Number.isFinite(seconds) || seconds < 0) return [400, { ok: false, error: 'advance_seconds must be >= 0' }];
        state.clockOffsetMs += seconds * 1000;
        return [200, { ok: true, now: new Date(now()).toISOString() }];
    }
    if (method === 'GET' && path === '/state') return [200, acceptedState()];
    return [404, { ok: false, error: 'no such fixture route' }];
}

// ---------------------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------------------

function readBody(req) {
    return new Promise((resolve) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            if (!text) return resolve(null);
            try {
                resolve(JSON.parse(text));
            } catch {
                resolve(undefined);
            }
        });
    });
}

function send(res, status, body) {
    if (status === 204 || body === null) {
        res.writeHead(status);
        res.end();
        return;
    }
    const text = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
    res.end(text);
}

/** A route parameter, percent-decoded as the router decodes it; one that does not decode is taken as written. */
function decodeSegment(segment) {
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}

function takeFault(method, path) {
    const fault = state.faults.find((f) => f.times > 0 && f.method === method && f.path === path);
    if (!fault) return null;
    fault.times -= 1;
    return fault;
}

const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://fixture.local');
    const rawBody = await readBody(req);
    const method = req.method ?? 'GET';

    if (url.pathname.startsWith('/__fixture/')) {
        const [status, body] = fixtureRoute(method, url.pathname.slice('/__fixture'.length), rawBody);
        return send(res, status, body);
    }
    if (!url.pathname.startsWith('/api/')) return send(res, ...ERRORS.notFound());
    const path = url.pathname.slice('/api'.length);

    const fault = takeFault(method, path);
    if (fault) {
        if (fault.delay_ms) await new Promise((r) => setTimeout(r, fault.delay_ms));
        if (fault.drop) return req.socket.destroy();
        // Something in front of the API answering in its place: a proxy's error page, a captive portal.
        if (fault.body !== undefined) {
            res.writeHead(fault.status ?? 200, { 'Content-Type': fault.content_type ?? 'application/json', 'Content-Length': Buffer.byteLength(fault.body) });
            return res.end(fault.body);
        }
        // A bare status renders as the case ApiErrorService maps it to, as the backend's own would.
        if (fault.status) return send(res, fault.status, statusError(fault.status));
    }

    // Laravel reads a body that is not JSON as an empty one; nothing rejects it, so the route's
    // own validation answers.
    const body = clean(rawBody === undefined ? null : rawBody);
    const query = clean(Object.fromEntries(url.searchParams.entries()));
    const fullUrl = url.pathname + url.search;

    let result;
    const authorize = path.match(/^\/authorize-project\/([^/]+)$/);
    // `countries/{userLocale}` is registered before `countries/dial-codes/{userLocale}`, and each
    // parameter is one segment, so `/countries/dial-codes` alone names the countries in `dial-codes`.
    const reference = path.match(/^\/(countries\/dial-codes|countries|currencies)\/([^/]+)$/);
    const localeForm = ['/locales', '/locales/flat', '/locales/data'].includes(path) ? path.slice(1) : null;
    if (method === 'GET' && authorize) result = authorizeProject(req, decodeURIComponent(authorize[1]), fullUrl);
    else if (method === 'GET' && (path === '/translations' || path === '/translations/data')) result = translations(req, query, fullUrl);
    else if (method === 'POST' && path === '/translatable-items') result = translatableItems(req, body, fullUrl);
    else if (method === 'POST' && path === '/discovery/hint') result = discoveryHint(req, body);
    else if (method === 'GET' && localeForm) result = localeLists(req, url, localeForm, fullUrl);
    else if (method === 'GET' && reference) result = referenceList(req, reference[1], decodeSegment(reference[2]), fullUrl);
    else if (authorize || reference || localeForm || ['/translations', '/translations/data', '/translatable-items', '/discovery/hint'].includes(path)) {
        result = ERRORS.methodNotAllowed();
    } else result = ERRORS.notFound();
    return send(res, result[0], result[1]);
});

const portArg = process.argv.indexOf('--port');
const port = portArg > -1 ? Number(process.argv[portArg + 1]) : 0;
server.listen(port, '127.0.0.1', () => {
    const { port: bound } = server.address();
    process.stdout.write(
        JSON.stringify({
            ready: true,
            base_url: `http://127.0.0.1:${bound}/api`,
            fixture_url: `http://127.0.0.1:${bound}/__fixture`,
        }) + '\n'
    );
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
