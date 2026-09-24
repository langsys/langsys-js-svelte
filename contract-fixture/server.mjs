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
const errorBody = (message) => ({ status: false, data: [], error: message });

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
        return [429, errorBody('Too many identical requests')];
    }
    return null;
}

/** auth.apikey. Returns [status, body] on refusal, else { key, project, writeEnabled }. */
function authApiKey(req) {
    const raw = header(req, 'x-authorization');
    if (!raw) return [401, { message: 'Unauthenticated.' }];
    const key = state.keys.get(raw);
    if (!key) return [403, errorBody('Invalid API key')];
    const project = key.project ? state.projects.get(key.project) : null;
    if (!project) return [403, errorBody('Api key not associated with a project')];
    if (project.subscription_suspended) return [402, errorBody('Subscription suspended')];
    const writeEnabled = allowsWrite(key, req);
    if (req.method === 'GET' || writeEnabled) return { key, project, writeEnabled };
    return [403, errorBody('This action is unauthorized.')];
}

/** deduct.request */
const deductRequest = (key) => (key.usage_exhausted ? [402, errorBody('API usage limit exceeded')] : null);

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

function authorizeProject(req, projectId, url) {
    const project = state.projects.get(projectId);
    if (!project) return [404, errorBody('Not found')]; // route-model binding runs first
    const dup = duplicateGuard(req, url, null);
    if (dup) return dup;
    const auth = authApiKey(req);
    if (Array.isArray(auth)) return auth;
    const deduct = deductRequest(auth.key);
    if (deduct) return deduct;
    if (auth.key.project !== project.id) return [403, errorBody('Invalid Api Key for project')];
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

function translations(req, query, url) {
    const dup = duplicateGuard(req, url, null);
    if (dup) return dup;
    const auth = authApiKey(req);
    if (Array.isArray(auth)) return auth;
    if (!query.project_id) return [422, errorBody('The project id field is required.')];
    const project = state.projects.get(query.project_id);
    if (!project) return [404, errorBody('Not found')];
    const deduct = deductRequest(auth.key);
    if (deduct) return deduct;
    if (auth.key.project !== project.id) return [403, errorBody('This action is unauthorized.')];
    if (!query.locale) return [422, errorBody('The locale field is required.')];
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

function translatableItems(req, body, url) {
    const dup = duplicateGuard(req, url, body);
    if (dup) return dup;
    const auth = authApiKey(req);
    if (Array.isArray(auth)) return auth;
    const items = body?.translatable_items;
    const count = Array.isArray(items) ? items.length : 0;
    if (count > state.config.batch_limit) {
        return [
            422,
            errorBody(
                `Batch size of ${count} exceeds the maximum allowed limit of ${state.config.batch_limit} translatable items per request.`
            ),
        ];
    }
    if (!body?.project_id) return [422, errorBody('The project id field is required.')];
    const project = state.projects.get(body.project_id);
    if (!project) return [404, errorBody('Not found')];
    if (!Array.isArray(items)) return [422, errorBody('The translatable items field must be an array.')];
    const deduct = deductRequest(auth.key);
    if (deduct) return deduct;
    if (auth.key.project !== project.id) return [403, errorBody('This action is unauthorized.')];
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
    return [200, { status: true }];
}

function discoveryHint(req, body) {
    if (hintThrottle(req)) return [429, { message: 'Too Many Attempts.' }];
    const pageUrl = body?.page_url;
    let valid = typeof pageUrl === 'string' && pageUrl.length <= 2048;
    if (valid) {
        try {
            new URL(pageUrl);
        } catch {
            valid = false;
        }
    }
    if (!valid) return [422, errorBody('The page url field must be a valid URL.')];
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
    if (!url.pathname.startsWith('/api/')) return send(res, 404, errorBody('Not found'));
    const path = url.pathname.slice('/api'.length);

    const fault = takeFault(method, path);
    if (fault) {
        if (fault.delay_ms) await new Promise((r) => setTimeout(r, fault.delay_ms));
        if (fault.drop) return req.socket.destroy();
        if (fault.status) return send(res, fault.status, errorBody('Injected fault'));
    }

    if (rawBody === undefined) return send(res, 400, errorBody('Malformed JSON body'));
    const body = clean(rawBody);
    const query = clean(Object.fromEntries(url.searchParams.entries()));
    const fullUrl = url.pathname + url.search;

    let result;
    const authorize = path.match(/^\/authorize-project\/([^/]+)$/);
    if (method === 'GET' && authorize) result = authorizeProject(req, decodeURIComponent(authorize[1]), fullUrl);
    else if (method === 'GET' && (path === '/translations' || path === '/translations/data')) result = translations(req, query, fullUrl);
    else if (method === 'POST' && path === '/translatable-items') result = translatableItems(req, body, fullUrl);
    else if (method === 'POST' && path === '/discovery/hint') result = discoveryHint(req, body);
    else result = [404, errorBody('Not found')];
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
