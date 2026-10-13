// Audit row 10 and 11 (_dev_/upgrade/AUDIT.md): which content-block ids, routes and catalog
// entries move between two builds of the langsys-js-typescript core, and what the newer core
// renders for a block whose translation the older one stored.
//
//   OLD_CORE=<built 0.6.5 checkout> NEW_CORE=<built checkout of the pinned core> node _dev_/upgrade/id-moves.mjs
//
// FIXTURE defaults to vectors/canonicalization-reference.json; OUT (default: a new temp directory)
// receives results.md and results.json. Nothing is written into the repo.
//
// For each case a host <div> is built with happy-dom (taken from NEW_CORE's node_modules),
// unmounted, and its innerHTML set to the case's html: the same host the core's
// canonicalization-agreement test builds. Each core then derives the id the way its DOM
// `Translate` does for a host without a caller-supplied custom_id:
//
//   tokens = tokenizeElement(host).tokens
//   id     = generateCustomId(category, tokens)
//
// Both functions come from each core's own built dist/index.mjs. A few helpers the dists do not
// export (the new core's findSingleTextNode, isMarkerOnlyUnit, historicalCustomIds,
// blockContentMatches and both attribute lists) are bundled from each core's src with the new
// core's esbuild.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
if (!process.env.OLD_CORE || !process.env.NEW_CORE) {
    console.error('Set OLD_CORE and NEW_CORE to built core checkouts (see _dev_/upgrade/README.md).');
    process.exit(2);
}
const OLD_CORE = resolve(process.env.OLD_CORE);
const NEW_CORE = resolve(process.env.NEW_CORE);
const FIXTURE = resolve(process.env.FIXTURE ?? resolve(HERE, '../../vectors/canonicalization-reference.json'));
const OUT = resolve(process.env.OUT ?? mkdtempSync(resolve(tmpdir(), 'langsys-id-moves-')));
mkdirSync(OUT, { recursive: true });
const BUILD = mkdtempSync(resolve(tmpdir(), 'langsys-id-moves-build-'));

// ---------------------------------------------------------------- helpers bundle
function ensureHelpers() {
    const esbuild = resolve(NEW_CORE, 'node_modules/.bin/esbuild');
    const entries = {
        'entry-new.ts': [
            `export { findSingleTextNode, isMarkerOnlyUnit, isExcisedFromUnit } from ${JSON.stringify(resolve(NEW_CORE, 'src/content-block.ts'))};`,
            `export { historicalCustomIds, blockContentMatches, TRANSLATABLE_ATTRIBUTES, NON_TRANSLATABLE_ELEMENTS, CONTENT_BLOCK_MARKER_ATTRS } from ${JSON.stringify(resolve(NEW_CORE, 'src/identity.ts'))};`,
        ],
        'entry-old.ts': [`export { TRANSLATABLE_ATTRIBUTES } from ${JSON.stringify(resolve(OLD_CORE, 'src/content-block.ts'))};`],
    };
    for (const [entry, lines] of Object.entries(entries)) {
        writeFileSync(resolve(BUILD, entry), lines.join('\n') + '\n');
        const out = resolve(BUILD, entry.replace('entry-', 'helpers-').replace('.ts', '.mjs'));
        execFileSync(esbuild, [resolve(BUILD, entry), '--bundle', '--format=esm', '--platform=neutral', '--log-level=warning', `--outfile=${out}`]);
    }
}
ensureHelpers();

// ---------------------------------------------------------------- DOM
const requireFromNew = createRequire(resolve(NEW_CORE, 'package.json'));
const { Window } = await import(pathToFileURL(requireFromNew.resolve('happy-dom')).href);
const window = new Window();
const document = window.document;
// 0.6.5's walk reads `Node.ELEMENT_NODE` / `Node.TEXT_NODE` from the global.
// `window` and `document` are deliberately NOT made global: the style snapshot
// (`_applyStylesToClone`) is skipped, exactly as for the fixture's unmounted host.
globalThis.Node = window.Node;

const OLD = await import(pathToFileURL(resolve(OLD_CORE, 'dist/index.mjs')).href);
const NEW = await import(pathToFileURL(resolve(NEW_CORE, 'dist/index.mjs')).href);
const OLD_H = await import(pathToFileURL(resolve(BUILD, 'helpers-old.mjs')).href);
const NEW_H = await import(pathToFileURL(resolve(BUILD, 'helpers-new.mjs')).href);
rmSync(BUILD, { recursive: true, force: true }); // loaded; the bundles are not needed again

const coreSha = (dir) => {
    try {
        return execFileSync('git', ['-C', dir, 'rev-parse', '--short=8', 'HEAD']).toString().trim();
    } catch {
        return 'n/a';
    }
};

function host(html) {
    const el = document.createElement('div');
    el.innerHTML = html;
    return el;
}

// How each core's `Translate` would register this host (no caller custom_id).
//  0.6.5 : exactly one token -> t(token, category) phrase; otherwise a content block.
//  new   : a marker-only unit registers nothing; one token that is the unit's single
//          text node, or a single marked run, -> phrase; otherwise a content block.
function oldRoute(tokens) {
    return tokens.length === 1 ? 'phrase' : 'block';
}
function newRoute(el, tokens, vars) {
    if (NEW_H.isMarkerOnlyUnit(tokens, vars)) return 'none';
    const single = tokens.length === 1 && (NEW_H.findSingleTextNode(el) !== null || vars.runs.includes(0));
    return single ? 'phrase' : 'block';
}

function measure({ id, html, category }) {
    const oldTokens = OLD.tokenizeElement(host(html)).tokens;
    const oldId = OLD.generateCustomId(category, oldTokens);

    const newHost = host(html);
    const { tokens: newTokens, vars } = NEW.tokenizeElement(newHost);
    const newId = NEW.generateCustomId(category, newTokens);

    const routeOld = oldRoute(oldTokens);
    const routeNew = newRoute(newHost, newTokens, vars);

    // Would the new core's migration fallback (CID-3 candidates + CID-4 content
    // check, as `Translate.handleContentBlock` runs it) find the 0.6.5 block?
    let rescued = null;
    if (oldId !== newId && routeOld === 'block' && routeNew === 'block') {
        const candidates = NEW_H.historicalCustomIds(category, newTokens, NEW.legacyTokenizeElement(host(html))).filter((c) => c !== newId);
        rescued = candidates.includes(oldId) && NEW_H.blockContentMatches(oldTokens, newTokens);
    }

    // The catalog entry each core's Translate would create: a phrase keyed by its
    // token, a block keyed by its id, or nothing (a marker-only unit, VAR-3).
    const entry = (route, tokens, blockId) => (route === 'phrase' ? `phrase:${tokens[0]}` : route === 'block' ? `block:${blockId}` : 'none');
    const entryOld = entry(routeOld, oldTokens, oldId);
    const entryNew = entry(routeNew, newTokens, newId);

    return {
        id,
        category,
        html,
        entryOld,
        entryNew,
        entryMoved: entryNew === 'none' ? null : entryOld !== entryNew,
        oldTokens,
        newTokens,
        oldId,
        newId,
        tokensMoved: JSON.stringify(oldTokens) !== JSON.stringify(newTokens),
        moved: oldId !== newId,
        routeOld,
        routeNew,
        rescued,
    };
}

// ---------------------------------------------------------------- cases
const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const fixtureRows = fixture.cases.map((row) => {
    const r = measure(row);
    r.expectedId = row.expected_custom_id;
    r.newMatchesFixture = r.newId === row.expected_custom_id && JSON.stringify(r.newTokens) === JSON.stringify(row.expected_tokens);
    return r;
});

const innerHtml = '<p>Inner one</p><p>Inner two</p>';
const innerStamp = NEW.generateCustomId('UI', NEW.tokenizeElement(host(innerHtml)).tokens);
const marker = NEW.CONTENT_BLOCK_MARKER_ATTR; // 'data-ls-contentblock'

const extras = [
    { id: 'x-data-tooltip', html: '<button data-tooltip="Save changes">Save</button>' },
    { id: 'x-data-tooltip-attr-only', html: '<span data-tooltip="Save changes"></span>' },
    { id: 'x-data-bs-title', html: '<button data-bs-toggle="tooltip" data-bs-title="Delete">Remove</button>' },
    { id: 'x-title-whitespace', html: '<button title="Close  window">X</button>' },
    {
        id: 'x-excluded-elements',
        html:
            '<p>Pricing</p>' +
            "<script>track('view')</script>" +
            '<style>.plan{color:#fff}</style>' +
            '<template><p>Hidden row</p></template>' +
            '<noscript><p>Enable JavaScript</p></noscript>' +
            '<p>Area <math><mi>x</mi><mo>+</mo><mn>2</mn></math> units</p>',
    },
    { id: 'x-template-only', html: '<template><p>Hidden row</p></template><p>Plans</p><p>Pricing</p>' },
    { id: 'x-c0-bel', html: '<p>Alert\u0007 sounds</p><p>Then wait</p>' },
    { id: 'x-nested-declared', html: `<p>Outer intro</p><div ${marker}><p>Inner one</p><p>Inner two</p></div><p>Outer end</p>` },
    {
        id: 'x-nested-stamped',
        html: `<p>Outer intro</p><div ${marker}="${innerStamp}"><p>Inner one</p><p>Inner two</p></div><p>Outer end</p>`,
    },
    { id: 'x-nested-inner-own', html: innerHtml },
    { id: 'x-lone-token-beside-script', html: '<p>Hello<script>x</script></p>' },
    { id: 'x-control-plain', html: '<p>Hello world</p>' },
].map((c) => measure({ ...c, category: 'UI' }));

// ---------------------------------------------------------------- attribute lists
const oldAttrs = OLD_H.TRANSLATABLE_ATTRIBUTES;
const newAttrs = NEW_H.TRANSLATABLE_ATTRIBUTES;
const added = newAttrs.filter((a) => !oldAttrs.includes(a));
const removed = oldAttrs.filter((a) => !newAttrs.includes(a));
const appendedInOrder = JSON.stringify(newAttrs.slice(0, oldAttrs.length)) === JSON.stringify(oldAttrs);

// Empirical probe: one element carrying every new-list attribute, each value naming itself.
const probeHtml = '<span ' + newAttrs.map((a) => `${a}="${a}"`).join(' ') + '></span>';
const harvestedOld = OLD.tokenizeElement(host(probeHtml)).tokens;
const harvestedNew = NEW.tokenizeElement(host(probeHtml)).tokens;

// ---------------------------------------------------------------- Translate class, with params
// The two %name% cases run through each core's real DOM `Translate` class with
// `params` passed as its options take them. Runs LAST: it makes `window` and
// `document` global, which the pure measurements above deliberately do not.
// `fetch` is stubbed, so nothing leaves the process; calls are counted.
const fetchCalls = [];
globalThis.fetch = async (url) => {
    fetchCalls.push(String(url));
    throw new Error('network disabled in this measurement');
};
const unhandled = [];
process.on('unhandledRejection', (err) => unhandled.push(String(err?.message ?? err)));
globalThis.window = window;
globalThis.document = document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.MutationObserver = window.MutationObserver;

const PARAM_CASES = [
    { id: 'p-hello-name', html: '<p>Hello %name%</p>' },
    { id: 'p-hello-name-welcome', html: '<p>Hello %name%, welcome back</p>' },
];
const PARAMS = { name: 'Ana' };
const tick = () => new Promise((r) => setTimeout(r, 0));

async function viaTranslate(core, html) {
    const el = document.createElement('div');
    el.innerHTML = html;
    document.body.appendChild(el);
    let error = null;
    let inst = null;
    try {
        inst = new core.Translate(el, { category: 'UI', params: { ...PARAMS } });
    } catch (e) {
        error = String(e?.message ?? e);
    }
    for (let i = 0; i < 5; i++) await tick();
    const out = {
        tokens: inst?.tokens ?? null, // private field, read at runtime
        customId: inst?.custom_id ?? null, // '' = no id derived on this path
        marker: el.getAttribute(NEW.CONTENT_BLOCK_MARKER_ATTR),
        rendered: el.innerHTML,
        error,
    };
    inst?.destroy?.();
    el.remove();
    return out;
}

const paramRows = [];
for (const c of PARAM_CASES) {
    const pureOld = OLD.tokenizeElement(host(c.html)).tokens;
    const pureNew = NEW.tokenizeElement(host(c.html)).tokens;
    paramRows.push({
        ...c,
        category: 'UI',
        params: PARAMS,
        old: { pureTokens: pureOld, pureId: OLD.generateCustomId('UI', pureOld), translate: await viaTranslate(OLD, c.html) },
        new: { pureTokens: pureNew, pureId: NEW.generateCustomId('UI', pureNew), translate: await viaTranslate(NEW, c.html) },
    });
}

// ---------------------------------------------------------------- upgrade render: old catalog, new core
// What an upgraded app shows: the catalog still holds what 0.6.5 stored, and the
// NEW core's Translate renders each host the way the Svelte binding constructs it
// without the build transform: { category, custom_id: '', label: '', params, register: false }.
//
// Network: an in-process fetch double (no ports). It authorizes a write-enabled
// session, answers the catalog route with the catalog currently seeded, and records
// every request, so a registration or discovery hint would be visible. A pass with
// register: true over the same cases is the positive control for that counter.
const RENDER_CASES = [
    'attr-multiline',
    'attr-nbsp',
    'attr-original-15',
    'attr-new-data-confirm',
    'attr-new-data-bs-title',
    'attr-order-two-on-one-element',
    'style-subtree',
    'script-subtree',
    'noscript-subtree',
    'math-subtree',
    'fs-in-text',
    'vt-in-text',
    'fs-in-attr',
    'x-data-tooltip',
    'x-data-bs-title',
    'x-title-whitespace',
    'x-c0-bel',
    'x-nested-declared',
    'x-lone-token-beside-script',
    'x-control-plain',
    'multi-token',
    'nbsp-in-text',
];
const CONTROL_CASES = new Set(['x-control-plain', 'multi-token', 'nbsp-in-text']);
const byId = new Map([...fixtureRows, ...extras].map((r) => [r.id, r]));

let phase = 'init';
let currentCatalog = {};
const requests = [];
const clone = (v) => JSON.parse(JSON.stringify(v));
globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const method = init.method ?? 'GET';
    requests.push({ phase, method, path: u.pathname, body: init.body ?? null });
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (method === 'GET' && u.pathname.includes('/authorize-project/')) return json({ status: true, data: { key_type: 'write', write_enabled: true } });
    if (method === 'GET' && u.pathname.endsWith('/translations')) return json({ status: true, data: clone(currentCatalog), write_enabled: true });
    if (method === 'POST' && u.pathname.endsWith('/discovery/hint')) return new Response(null, { status: 204 });
    return json({ status: true, data: {} });
};

// The catalog 0.6.5 left behind for one case: a phrase under its key, or a block under its id.
function oldCatalogFor(r) {
    const bucket = { __category__: r.category, __symbol__: r.category };
    if (r.routeOld === 'phrase') bucket[r.oldTokens[0]] = 'ES:' + r.oldTokens[0];
    else bucket[r.oldId] = Object.fromEntries(r.oldTokens.map((t) => [t, 'ES:' + t]));
    return { [r.category]: bucket };
}
function whereOld(r) {
    return r.routeOld === 'phrase' ? `phrase ${r.category}[${show([r.oldTokens[0]]).slice(1, -1)}]` : `block ${r.category}.${r.oldId.slice(0, 8)}`;
}

// What the host shows: text nodes and translatable attribute values, outside code and notation.
const HIDDEN = new Set(['script', 'style', 'template', 'noscript', 'math']);
function shownPieces(root) {
    const pieces = [];
    const walk = (parent) => {
        for (const child of Array.from(parent.childNodes)) {
            if (child.nodeType === 3) {
                const t = child.nodeValue.trim();
                if (t) pieces.push(t);
            } else if (child.nodeType === 1) {
                if (HIDDEN.has(child.localName)) continue;
                for (const a of NEW_H.TRANSLATABLE_ATTRIBUTES) {
                    const v = child.getAttribute(a);
                    if (v && v.trim()) pieces.push(`@${a}=${v}`);
                }
                walk(child);
            }
        }
    };
    walk(root);
    return pieces;
}

const settle = (ms) => new Promise((r) => setTimeout(r, ms));
const { LangsysApp: APP, createSignal } = NEW;
APP.seedCatalog({}, 'es-es');
const initResult = await APP.init({
    projectid: 'measure-project',
    key: 'measure-key',
    UserLocaleStore: createSignal('es-es'),
    baseLocale: 'en-us',
});
await settle(50);

async function renderPass(register) {
    const out = [];
    for (const id of RENDER_CASES) {
        const r = byId.get(id);
        currentCatalog = oldCatalogFor(r);
        APP.seedCatalog(clone(currentCatalog), 'es-es');
        const el = document.createElement('translate'); // the binding's default host tag
        el.innerHTML = r.html;
        document.body.appendChild(el);
        phase = `${register ? 'register-true' : 'register-false'}:${id}`;
        const inst = new NEW.Translate(el, { category: r.category, custom_id: '', label: '', params: undefined, register });
        await settle(650); // past the core's 500 ms settle window
        const pieces = shownPieces(el);
        const translatedCount = pieces.filter((p) => p.includes('ES:')).length;
        out.push({
            id,
            control: CONTROL_CASES.has(id),
            oldEntry: r.routeOld === 'phrase' ? { phrase: r.oldTokens[0] } : { block: r.oldId },
            newRoute: r.routeNew,
            newId: inst.custom_id,
            pieces,
            translated: translatedCount === 0 ? 'no' : translatedCount === pieces.length ? 'yes' : 'partial',
            innerHTML: el.innerHTML,
        });
        inst.destroy();
        el.remove();
    }
    return out;
}

const renderFalse = await renderPass(false);
const falseRequests = requests.filter((q) => q.phase.startsWith('register-false'));
const renderTrue = await renderPass(true);
phase = 'register-true:flush';
await settle(3500); // the phrase queue flushes on a 3 s interval
const trueRequests = requests.filter((q) => q.phase.startsWith('register-true'));
const summarize = (qs) => {
    const counts = {};
    for (const q of qs) counts[`${q.method} ${q.path}`] = (counts[`${q.method} ${q.path}`] ?? 0) + 1;
    return (
        Object.entries(counts)
            .map(([k, v]) => `${k} x${v}`)
            .join(', ') || 'none'
    );
};

// ---------------------------------------------------------------- output
// Code points shown as \u{XXXX} in the table: C0/C1 controls, invisible spaces, and non-BMP.
const INVISIBLE_RANGES = [
    [0x0, 0x1f],
    [0x7f, 0xa0],
    [0xad, 0xad],
    [0x180e, 0x180e],
    [0x2000, 0x200f],
    [0x2028, 0x202f],
    [0x205f, 0x205f],
    [0xfeff, 0xfeff],
    [0x10000, 0x10ffff],
];
const isInvisible = (cp) => INVISIBLE_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
const show = (tokens) =>
    JSON.stringify(tokens)
        .replace(/[^\x20-\x7e]/gu, (ch) => (isInvisible(ch.codePointAt(0)) ? `\\u{${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}}` : ch))
        .replace(/\|/g, '\\|');
const entryCell = (r) => (r.entryMoved === null ? 'none (registers nothing)' : r.entryMoved ? 'NEW ENTRY' : 'same');
const route = (r) => (r.routeOld === r.routeNew ? r.routeOld : `${r.routeOld}→${r.routeNew}`);
const rescue = (r) => (r.rescued === null ? '' : r.rescued ? 'yes' : 'no');

function table(rows) {
    const head = '| case id | old tokens | new tokens | old id | new id | moved? | route | catalog entry | fallback finds old |';
    const sep = '|---|---|---|---|---|---|---|---|---|';
    const body = rows.map(
        (r) =>
            `| ${r.id} | ${show(r.oldTokens)} | ${show(r.newTokens)} | ${r.oldId.slice(0, 8)} | ${r.newId.slice(0, 8)} | ${r.moved ? 'MOVED' : 'same'} | ${route(r)} | ${entryCell(r)} | ${rescue(r)} |`
    );
    return [head, sep, ...body].join('\n');
}

const fixtureMoved = fixtureRows.filter((r) => r.moved);
const extrasMoved = extras.filter((r) => r.moved);
const fixtureEntryMoved = fixtureRows.filter((r) => r.entryMoved);
const extrasEntryMoved = extras.filter((r) => r.entryMoved);
const control = extras.find((r) => r.id === 'x-control-plain');
const mismatches = fixtureRows.filter((r) => !r.newMatchesFixture);

const md = [
    `OLD core: ${OLD_CORE} (git ${coreSha(OLD_CORE)}, package ${JSON.parse(readFileSync(resolve(OLD_CORE, 'package.json'))).version})`,
    `NEW core: ${NEW_CORE} (git ${coreSha(NEW_CORE)})`,
    `Fixture: ${FIXTURE} (${fixtureRows.length} rows)`,
    `NEW vs fixture expected (tokens + id): ${fixtureRows.length - mismatches.length}/${fixtureRows.length} match` +
        (mismatches.length ? ` — MISMATCH: ${mismatches.map((r) => r.id).join(', ')}` : ''),
    '',
    '## Fixture rows',
    table(fixtureRows),
    '',
    '## Extra upgrade shapes (category UI)',
    table(extras),
    '',
    `Fixture rows moved: ${fixtureMoved.length}/${fixtureRows.length} (${fixtureMoved.map((r) => r.id).join(', ')})`,
    `Extra shapes moved: ${extrasMoved.length}/${extras.length} (${extrasMoved.map((r) => r.id).join(', ')})`,
    `Fixture rows whose catalog entry changes (route-aware): ${fixtureEntryMoved.length}/${fixtureRows.length} (${fixtureEntryMoved.map((r) => r.id).join(', ')})`,
    `Extra shapes whose catalog entry changes (route-aware): ${extrasEntryMoved.length}/${extras.length} (${extrasEntryMoved.map((r) => r.id).join(', ')})`,
    `Control <p>Hello world</p>: old ${control.oldId} new ${control.newId} ${control.moved ? 'MOVED' : 'unchanged'}, route ${route(control)}`,
    '',
    '## Translatable attributes',
    `old (${oldAttrs.length}): ${oldAttrs.join(', ')}`,
    `new (${newAttrs.length}): ${newAttrs.join(', ')}`,
    `added (${added.length}): ${added.join(', ')}`,
    `removed (${removed.length}): ${removed.join(', ') || 'none'}`,
    `old list is an unchanged prefix of the new one: ${appendedInOrder}`,
    `probe harvested by old (${harvestedOld.length}): ${harvestedOld.join(', ')}`,
    `probe harvested by new (${harvestedNew.length}): ${harvestedNew.join(', ')}`,
    '',
    "## %name% cases through Translate, category UI, params { name: 'Ana' }",
    ...paramRows.flatMap((r) => [
        `### ${r.id}: ${r.html}`,
        `old  tokenizeElement tokens: ${JSON.stringify(r.old.pureTokens)}  generateCustomId: ${r.old.pureId}`,
        `old  Translate: tokens ${JSON.stringify(r.old.translate.tokens)}  custom_id ${JSON.stringify(r.old.translate.customId)}  host marker ${JSON.stringify(r.old.translate.marker)}  rendered ${JSON.stringify(r.old.translate.rendered)}${r.old.translate.error ? '  ERROR ' + r.old.translate.error : ''}`,
        `new  tokenizeElement tokens: ${JSON.stringify(r.new.pureTokens)}  generateCustomId: ${r.new.pureId}`,
        `new  Translate: tokens ${JSON.stringify(r.new.translate.tokens)}  custom_id ${JSON.stringify(r.new.translate.customId)}  host marker ${JSON.stringify(r.new.translate.marker)}  rendered ${JSON.stringify(r.new.translate.rendered)}${r.new.translate.error ? '  ERROR ' + r.new.translate.error : ''}`,
    ]),
    `fetch calls attempted (stubbed): ${fetchCalls.length}${fetchCalls.length ? ' — ' + [...new Set(fetchCalls)].join(', ') : ''}`,
    `unhandled rejections: ${unhandled.length}${unhandled.length ? ' — ' + [...new Set(unhandled)].join(' | ') : ''}`,
    '',
    '## Upgrade render: catalog from 0.6.5, NEW core Translate with register: false',
    `Host <translate>, options { category, custom_id: '', label: '', params: undefined, register: false }; locale es-es seeded with LangsysApp.seedCatalog, init() against an in-process fetch double (write-enabled session). init result status: ${initResult?.status}`,
    '| case | where the old translation sits | new route | text the NEW core renders | translated? |',
    '|---|---|---|---|---|',
    ...renderFalse.map(
        (x) =>
            `| ${x.id}${x.control ? ' (control)' : ''} | ${whereOld(byId.get(x.id))} | ${x.newRoute} ${x.newId.slice(0, 8)} | ${show(x.pieces)} | ${x.translated} |`
    ),
    '',
    `register: false — requests during the render pass: ${falseRequests.length} (${summarize(falseRequests)})`,
    `register: true (positive control, same cases) — requests: ${trueRequests.length} (${summarize(trueRequests)})`,
    'register: true payloads (phrase sends flush on a timer, so their phase label can trail their case by one):',
    ...trueRequests
        .filter((q) => q.body)
        .map((q) => {
            const items = JSON.parse(q.body).translatable_items ?? [];
            return (
                `  ${q.phase} → ` +
                items
                    .map((i) =>
                        i.type === 'content_block'
                            ? `block ${i.category} ${i.custom_id.slice(0, 8)} ${show(i.phrases.map((x) => x.phrase))}`
                            : `phrase ${i.category} ${show([i.phrase])}`
                    )
                    .join(' ; ')
            );
        }),
    `register: true renders identically to register: false: ${JSON.stringify(renderTrue.map((x) => x.pieces)) === JSON.stringify(renderFalse.map((x) => x.pieces))}`,
    `all requests by phase: ${summarize(requests.map((q) => ({ ...q, path: q.phase.split(':')[0] + ' ' + q.path })))}`,
].join('\n');

writeFileSync(resolve(OUT, 'results.md'), md + '\n');
writeFileSync(
    resolve(OUT, 'results.json'),
    JSON.stringify(
        {
            oldCore: OLD_CORE,
            newCore: NEW_CORE,
            fixture: FIXTURE,
            fixtureRows,
            extras,
            paramRows,
            render: { renderFalse, renderTrue, requests },
            attributes: { oldAttrs, newAttrs, added, removed, appendedInOrder, harvestedOld, harvestedNew },
        },
        null,
        1
    ) + '\n'
);
console.log(md);
console.log(`\nresults: ${OUT}`);
process.exit(0);
