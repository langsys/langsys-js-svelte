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
            phrases: new Map(),
            blocks: new Map(),
        };
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
    next.faults = (doc.faults ?? []).map((f) => ({ ...f, times: f.times ?? 1 }));
    next.clockOffsetMs = state.clockOffsetMs;
    state = next;
}

const lower = (s) => (typeof s === 'string' ? s.toLowerCase() : s);
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
    if (method === 'GET' && authorize) result = authorizeProject(req, decodeURIComponent(authorize[1]), fullUrl);
    else if (method === 'GET' && (path === '/translations' || path === '/translations/data')) result = translations(req, query, fullUrl);
    else if (method === 'POST' && path === '/translatable-items') result = translatableItems(req, body, fullUrl);
    else if (method === 'POST' && path === '/discovery/hint') result = discoveryHint(req, body);
    else if (authorize || ['/translations', '/translations/data', '/translatable-items', '/discovery/hint'].includes(path)) {
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
