#!/usr/bin/env node
/**
 * The contract fixture (spec CONF-2): the API of an SDK test clone, a real Langsys instance seeded
 * before the run (langsys docs/sdk-test-clone.md), with what a real API cannot produce on demand
 * added per test case.
 *
 * Usage: `node forwarder.mjs --target https://api.langsys5.test --clone-root ~/dev/langsys5
 * [--php php] [--port N] [--log FILE]`. `--target` is the clone's origin, and `--clone-root` its
 * langsys checkout, whose `tests/Sdk/accepted-hints.php` reads the hints it stored. A clone served
 * over HTTPS by a local CA needs that CA in NODE_EXTRA_CA_CERTS. Prints one JSON line when ready.
 * `--log` appends one JSON line per setup, per refused request and per failed read.
 *
 * - `POST /__fixture/setup` names a test case by its keys, projects and seeded user tokens, and
 *   takes its caller address, its faults and its crafted reference lists. A setup naming a key,
 *   project or token an earlier one named updates that case: the fields it gives replace theirs,
 *   and the rest stay. Nothing in it reaches the clone.
 * - A request belongs to the case whose key (X-Authorization), user token (Authorization: Bearer)
 *   or project (the authorize path, or `project_id` in the query or a JSON body) it carries,
 *   whichever process sends it. One that names no case is refused with 421 and a body of the
 *   fixture's own, naming the route, rather than given another case's setup.
 * - Each request reaches the clone from its case's caller address, sent as X-Forwarded-For, which
 *   the clone trusts from loopback; every limit the API counts per address counts per case.
 * - A case's faults fail its next matching requests, in order, before anything is forwarded.
 * - A case's crafted reference lists answer the reference routes in place of the clone's shared
 *   tables, named as the API names its own (`reference-lists.mjs`), once the clone has answered
 *   the request itself: a request the API refuses is refused as the API refuses it. A locale list
 *   that would append the project's target locales, which only the clone holds, is refused with
 *   501 and a body of the fixture's own.
 * - `GET /__fixture/state?project=<id>[&project=<id>]` answers the hints the clone stored for those
 *   projects, read by langsys's reader. `POST /__fixture/clock` waits the time it is asked to
 *   advance: the clone's clock is real.
 *
 * Node built-ins only.
 */
import { execFile } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { join } from 'node:path';
import { craftedList, decodeSegment, LocaleComposeError, referenceRoute, referenceTables, UnsupportedListError } from './reference-lists.mjs';

const option = (name) => {
    const at = process.argv.indexOf(name);
    return at > -1 ? process.argv[at + 1] : undefined;
};
const target = (option('--target') ?? '').replace(/\/+$/, '');
const cloneRoot = option('--clone-root') ?? '';
const php = option('--php') ?? 'php';
if (!target || !cloneRoot) {
    process.stderr.write('forwarder: --target and --clone-root are required\n');
    process.exit(2);
}
const logFile = option('--log');
const log = (entry) => logFile && appendFileSync(logFile, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------
// Answers the forwarder gives itself, as the API renders them
// ---------------------------------------------------------------------------------------

const apiError = (code, message) => ({ status: false, error: { message, code, template: message } });
/** ApiErrorService::forStatus, for a fault with a bare status. */
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

function send(res, status, body) {
    if (status === 204 || body === null) {
        res.writeHead(status);
        return res.end();
    }
    const text = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
    res.end(text);
}

// ---------------------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------------------

/** @type {Array<{ keys: Set<string>, tokens: Set<string>, projects: Set<string>, caller: string | null, faults: object[], reference: object | null }>} */
const cases = [];

const names = (value) => (Array.isArray(value) ? value.filter((v) => typeof v === 'string' && v.trim() !== '').map((v) => v.trim()) : []);

/** Why a setup cannot be taken, or null. */
function refuseSetup(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return 'a setup is a JSON object';
    const undeclared = Object.keys(body).filter((field) => !['keys', 'projects', 'tokens', 'caller', 'faults', 'reference'].includes(field));
    if (undeclared.length) return `a setup takes keys, projects, tokens, caller, faults and reference, not ${undeclared.join(', ')}`;
    for (const field of ['keys', 'projects', 'tokens']) {
        if (body[field] !== undefined && (!Array.isArray(body[field]) || names(body[field]).length !== body[field].length)) return `${field} is a list of non-empty strings`;
    }
    if (!names(body.keys).length && !names(body.projects).length && !names(body.tokens).length) return 'a setup names its case by at least one key, project or user token';
    if (body.caller !== undefined && !isIP(String(body.caller))) return 'caller is an IP address';
    if (body.faults !== undefined && !Array.isArray(body.faults)) return 'faults is a list';
    for (const fault of body.faults ?? []) {
        if (!fault || typeof fault !== 'object' || !['GET', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(fault.method) || typeof fault.path !== 'string') return 'a fault names its method and path';
    }
    if (body.reference !== undefined && body.reference !== null) {
        try {
            referenceTables(body.reference);
        } catch (error) {
            return error.message;
        }
    }
    return null;
}

function setup(body) {
    const refused = refuseSetup(body);
    if (refused) return [400, { ok: false, error: refused }];
    const keys = names(body.keys);
    const tokens = names(body.tokens);
    const projects = names(body.projects);
    const matching = cases.filter((c) => keys.some((k) => c.keys.has(k)) || tokens.some((t) => c.tokens.has(t)) || projects.some((p) => c.projects.has(p)));
    if (matching.length > 1) return [400, { ok: false, error: 'the names given belong to more than one case' }];
    const known = matching[0];
    if (!known && body.caller === undefined) return [400, { ok: false, error: 'a new case needs its caller address' }];
    const entry = known ?? { keys: new Set(), tokens: new Set(), projects: new Set(), caller: null, faults: [], reference: null };
    for (const k of keys) entry.keys.add(k);
    for (const t of tokens) entry.tokens.add(t);
    for (const p of projects) entry.projects.add(p);
    if (body.caller !== undefined) entry.caller = String(body.caller);
    if (body.faults !== undefined) entry.faults = body.faults.map((f) => ({ ...f, times: f.times ?? 1 }));
    if (body.reference !== undefined) entry.reference = body.reference === null ? null : referenceTables(body.reference);
    if (!known) cases.push(entry);
    log({ event: 'setup', keys, tokens: tokens.length, projects, caller: entry.caller, faults: entry.faults.length, reference: entry.reference !== null });
    return [200, { ok: true }];
}

/** The case a request belongs to: by its key, then its user token, then its project. */
function caseOf(req, url, raw) {
    const key = String(req.headers['x-authorization'] ?? '').trim();
    if (key) {
        const found = cases.find((c) => c.keys.has(key));
        if (found) return found;
    }
    const bearer = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization ?? '').trim())?.[1]?.trim();
    if (bearer) {
        const found = cases.find((c) => c.tokens.has(bearer));
        if (found) return found;
    }
    const projects = [];
    const authorize = url.pathname.match(/^\/api\/authorize-project\/([^/]+)$/);
    if (authorize) projects.push(decodeSegment(authorize[1]));
    for (const value of url.searchParams.getAll('project_id')) projects.push(value);
    if (raw.length) {
        try {
            const json = JSON.parse(raw.toString('utf8'));
            if (json && typeof json === 'object' && typeof json.project_id === 'string') projects.push(json.project_id);
        } catch {
            // A body that is not JSON names no project.
        }
    }
    return cases.find((c) => projects.some((p) => c.projects.has(p))) ?? null;
}

function takeFault(entry, method, path) {
    const fault = entry.faults.find((f) => f.times > 0 && f.method === method && f.path === path);
    if (!fault) return null;
    fault.times -= 1;
    return fault;
}

// ---------------------------------------------------------------------------------------
// Talking to the clone and its reader
// ---------------------------------------------------------------------------------------

const HOP_BY_HOP = new Set(['host', 'connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'expect', 'te', 'trailer', 'proxy-connection', 'content-length', 'accept-encoding']);

function requestHeaders(req) {
    const headers = {};
    for (const [name, value] of Object.entries(req.headers)) {
        if (!HOP_BY_HOP.has(name) && name !== 'x-forwarded-for' && value !== undefined) headers[name] = Array.isArray(value) ? value.join(', ') : value;
    }
    return headers;
}

async function relay(res, response) {
    const headers = {};
    response.headers.forEach((value, name) => {
        if (!HOP_BY_HOP.has(name) && name !== 'content-encoding' && name !== 'set-cookie') headers[name] = value;
    });
    const bytes = Buffer.from(await response.arrayBuffer());
    if (response.status === 204 || response.status === 304 || bytes.length === 0) {
        res.writeHead(response.status, headers);
        return res.end();
    }
    res.writeHead(response.status, { ...headers, 'content-length': bytes.length });
    res.end(bytes);
}

/** langsys's reader of the hints the clone stored, for these projects. */
function acceptedHints(projects) {
    return new Promise((resolve) => {
        execFile(php, [join(cloneRoot, 'tests', 'Sdk', 'accepted-hints.php'), ...projects], { timeout: 30_000 }, (error, stdout, stderr) => {
            if (error) return resolve({ error: `${error.code ?? error.signal ?? 'failed'}: ${String(stderr || error.message).trim().slice(0, 500)}` });
            try {
                const parsed = JSON.parse(stdout);
                if (!Array.isArray(parsed?.hints)) return resolve({ error: `the reader printed no hints list: ${stdout.slice(0, 300)}` });
                resolve({ hints: parsed.hints });
            } catch {
                resolve({ error: `the reader printed no JSON: ${stdout.slice(0, 300)}` });
            }
        });
    });
}

// ---------------------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------------------

async function fixtureRoute(req, res, url, raw) {
    const path = url.pathname.slice('/__fixture'.length);
    let body;
    try {
        body = raw.length ? JSON.parse(raw.toString('utf8')) : {};
    } catch {
        return send(res, 400, { ok: false, error: 'the body is not JSON' });
    }
    if (req.method === 'POST' && path === '/setup') return send(res, ...setup(body));
    if (req.method === 'POST' && path === '/clock') {
        const seconds = Number(body?.advance_seconds ?? 0);
        if (!Number.isFinite(seconds) || seconds < 0) return send(res, 400, { ok: false, error: 'advance_seconds must be >= 0' });
        await sleep(seconds * 1000);
        return send(res, 200, { ok: true, now: new Date().toISOString() });
    }
    if (req.method === 'GET' && path === '/state') {
        const projects = url.searchParams.getAll('project');
        if (!projects.length) return send(res, 400, { ok: false, error: 'state is read for the projects named by project=<id>' });
        const read = await acceptedHints(projects);
        if (read.error) {
            log({ event: 'state_failed', projects, error: read.error });
            return send(res, 502, { ok: false, error: `the hint reader failed: ${read.error}` });
        }
        return send(res, 200, { hints: read.hints });
    }
    return send(res, 404, { ok: false, error: 'no such fixture route' });
}

async function api(req, res, url, raw) {
    const entry = caseOf(req, url, raw);
    const route = `${req.method} ${url.pathname}`;
    if (!entry) {
        log({ event: 'no_case', route });
        return send(res, 421, { ok: false, fixture: 'no_case', route, error: 'carries no key, project or user token a setup names: POST /__fixture/setup naming them first' });
    }
    const path = url.pathname.slice('/api'.length);
    const fault = takeFault(entry, req.method, path);
    if (fault) {
        if (fault.delay_ms) await sleep(fault.delay_ms);
        if (fault.drop) return req.socket.destroy();
        // Something in front of the API answering in its place: a proxy's error page, a captive portal.
        if (fault.body !== undefined) {
            res.writeHead(fault.status ?? 200, { 'Content-Type': fault.content_type ?? 'application/json', 'Content-Length': Buffer.byteLength(fault.body) });
            return res.end(fault.body);
        }
        if (fault.status) return send(res, fault.status, statusError(fault.status));
    }
    const headers = { ...requestHeaders(req), 'x-forwarded-for': entry.caller };
    const response = await fetch(`${target}${url.pathname}${url.search}`, { method: req.method, headers, body: raw.length ? raw : undefined, redirect: 'manual' });
    const reference = entry.reference && response.ok ? referenceRoute(req.method, path) : null;
    if (!reference) return relay(res, response);
    await response.arrayBuffer();
    try {
        return send(res, 200, { status: true, data: craftedList(entry.reference, reference, url) });
    } catch (error) {
        // An exception the controller does not catch, rendered as the backend renders one.
        if (error instanceof LocaleComposeError) return send(res, 500, statusError(500));
        if (error instanceof UnsupportedListError) {
            log({ event: 'unsupported', route });
            return send(res, 501, { ok: false, fixture: 'unsupported', route, error: error.message });
        }
        throw error;
    }
}

function readRaw(req) {
    return new Promise((resolve) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
    });
}

// ---------------------------------------------------------------------------------------
// Start-up: the checkout is a clone's, and the target answers as a Langsys API
// ---------------------------------------------------------------------------------------

const UNUSED = '00000000-0000-4000-8000-000000000000';
const probe = await acceptedHints([UNUSED]);
if (probe.error || probe.hints.length) {
    process.stderr.write(`forwarder: ${cloneRoot} is not an SDK test clone's checkout (its hint reader answered ${probe.error ?? JSON.stringify(probe)})\n`);
    process.exit(2);
}
const answer = await fetch(`${target}/api/translations`, { headers: { accept: 'application/json' } })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))
    .catch((error) => ({ status: 0, body: String(error?.cause ?? error) }));
if (answer.status !== 401 || answer.body?.error?.code !== 'unauthenticated') {
    process.stderr.write(`forwarder: ${target} does not answer as a Langsys API (an unauthenticated catalog read answered ${answer.status}: ${JSON.stringify(answer.body).slice(0, 300)})\n`);
    process.exit(2);
}
log({ event: 'started', target, clone_root: cloneRoot });

const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://fixture.local');
    const raw = await readRaw(req);
    try {
        if (url.pathname.startsWith('/__fixture/')) return await fixtureRoute(req, res, url, raw);
        if (!url.pathname.startsWith('/api/')) return send(res, 404, apiError('not_found', 'Resource not found'));
        return await api(req, res, url, raw);
    } catch (error) {
        // The clone closed the connection, or could not be reached: the caller sees the same.
        log({ event: 'connection_lost', method: req.method, path: url.pathname, error: String(error?.cause ?? error) });
        req.socket.destroy();
    }
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

function shutdown() {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
}
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, shutdown);
