/**
 * This binding's contract cases on the SDK test clone (CONF-2). Every case has projects of its own,
 * with fixed ids, keys and user tokens, in the ranges langsys's `docs/sdk-test-clone.md` gives this
 * SDK: ids `7600…`, raw keys `svelte-…`, token ids 110000–119999, caller addresses 10.76.0.0/16.
 *
 * `make-seeds.mjs` writes these as the seed files the clone reads before a run (`seeds/`, one file
 * per suite). A harness reads the same cases for the projects, keys and tokens it uses, and names
 * its case to the forwarder by them (`setupOf`).
 */
import { generateCustomId } from 'langsys-js-typescript';

const pad = (n, width) => String(n).padStart(width, '0');
/** A fixed UUID per suite, case and item: `7600SSCC-0000-4000-8000-K…N`, K 0 for a project, 1 for a key. */
const uuid = (suite, kase, kind, n) => `7600${pad(suite, 2)}${pad(kase, 2)}-0000-4000-8000-${kind}${pad(n, 11)}`;
const tokenId = (suite, kase, n) => 110000 + suite * 1000 + kase * 10 + n;

// What the VAR routes render and read (`/fixture/var`, `/fixture/var-plain`, `/fixture/var/category`).
const GREET = 'Hello {name}, welcome back';
const CART = 'You have {items_count} items';
const PLAIN_ANA = 'Hello Ana, welcome back';
const PHOTO = 'Photo of {name}';
const PICTURE = 'Picture of {name}';
const BUILT = 'Built with';
const VAR_CATALOG = {
    target_locales: ['it-it'],
    phrases: [
        { category: 'VAR', phrase: GREET, translations: { 'it-it': 'Ciao {name}, bentornato' } },
        { category: 'VAR', phrase: PLAIN_ANA, translations: { 'it-it': 'Ciao Ana, bentornato' } },
        { category: 'VAR', phrase: PHOTO, translations: { 'it-it': 'Foto di {name}' } },
        { category: 'VAR', phrase: PICTURE, translations: { 'it-it': 'Immagine di {name}' } },
        { category: 'VAR2', phrase: PICTURE, translations: { 'it-it': 'Figura di {name}' } },
        { category: 'VAR', phrase: BUILT, translations: { 'it-it': 'Costruito con' } },
    ],
    blocks: [
        {
            category: 'VAR',
            custom_id: generateCustomId('VAR', [CART, 'Add one']),
            content: '<p>You have {items_count} items</p><button>Add one</button>',
            phrases: [
                { phrase: CART, translations: { 'it-it': '{items_count, plural, one {Hai # articolo} other {Hai # articoli}}' } },
                { phrase: 'Add one', translations: { 'it-it': 'Aggiungi' } },
            ],
        },
        {
            category: 'VAR',
            custom_id: generateCustomId('VAR', [PHOTO]),
            content: '<img alt="Photo of {name}">',
            phrases: [{ phrase: PHOTO, translations: { 'it-it': 'Foto di {name}' } }],
        },
        ...[
            ['VAR', 'Immagine di {name}'],
            ['VAR2', 'Figura di {name}'],
        ].map(([category, translation]) => ({
            category,
            custom_id: generateCustomId(category, [PICTURE]),
            content: '<img alt="Picture of {name}">',
            phrases: [{ phrase: PICTURE, translations: { 'it-it': translation } }],
        })),
    ],
};
const HINTS = { website_url: 'http://127.0.0.1', machine_translate_new_phrases: true, target_locales: ['es-es'] };
const READ_ONLY_REPORTER = { type: 'ip_write', report_discovered_content: true, ip_allowlist: [] };
const RACE = 'Layout phrase race';
const RACE_CATALOG = {
    target_locales: ['fr-fr', 'de-de', 'it-it', 'pt-pt'],
    phrases: [{ category: 'FX', phrase: RACE, translations: { 'fr-fr': 'Bonjour', 'de-de': 'Hallo', 'it-it': 'Ciao', 'pt-pt': 'Olá' } }],
};
const hello = (label) => ({
    target_locales: ['de-de', 'it-it'],
    website_url: `https://${label}.local`,
    phrases: [{ category: 'UI', phrase: 'Hello', translations: { 'de-de': `Hallo ${label}`, 'it-it': `Ciao ${label}` } }],
});

/**
 * Suite → case → what it seeds. A project names its label; a key names its project's label and
 * its kind. Base locale `en-us` unless a project says otherwise.
 */
const SUITES = {
    1: {
        name: 'verify-contract',
        harness: '_dev_/contract/verify-contract.mjs',
        cases: {
            1: {
                name: 'HINT-13: a persistent layout is reported for page B',
                projects: { app: { ...HINTS, phrases: [{ category: 'FX', phrase: 'Page A only 1' }] } },
                keys: { reporter: { project: 'app', ...READ_ONLY_REPORTER } },
            },
            2: {
                name: 'HINT-13 control: page-A-only content records nothing at B',
                projects: { app: { ...HINTS, phrases: [{ category: 'FX', phrase: 'Layout phrase 2' }] } },
                keys: { reporter: { project: 'app', ...READ_ONLY_REPORTER } },
            },
        },
    },
    2: {
        name: 'var',
        harness: '_dev_/e2e/var.mjs',
        cases: {
            1: {
                name: 'SRV-1: served translated, the ICU plural for 1 and 5',
                projects: { app: VAR_CATALOG },
                keys: { read: { project: 'app', type: 'read' } },
            },
            2: {
                name: 'VAR-1, VAR-3, VAR-6: two users register one placeholder phrase, and blocks their content; the {#await} blocks and the route without the transform register nothing (SRV-5, VAR-7)',
                projects: { app: { target_locales: ['it-it'] } },
                keys: { write: { project: 'app', type: 'write' } },
            },
            3: {
                name: 'SRV-3: a server render alone registers after the response',
                projects: { app: { target_locales: ['it-it'] } },
                keys: { write: { project: 'app', type: 'write' } },
            },
            4: {
                name: 'TOK-1, MARK-4, VAR-7: rendered from the catalog, with and without the transform',
                projects: { app: VAR_CATALOG },
                keys: { read: { project: 'app', type: 'read' } },
            },
            5: {
                name: 'VAR-6: served and hydrated, a unit keeps the block’s category',
                projects: { app: VAR_CATALOG },
                keys: { read: { project: 'app', type: 'read' } },
            },
            6: {
                name: 'VAR-6: rendered by the client, a read session follows the block’s category',
                projects: { app: VAR_CATALOG },
                keys: { read: { project: 'app', type: 'read' } },
            },
            7: {
                name: 'VAR-6: rendered by the client, a write session follows the block’s category',
                projects: { app: VAR_CATALOG },
                keys: { write: { project: 'app', type: 'write' } },
            },
        },
    },
    3: {
        name: 'srv-flush',
        harness: '_dev_/e2e/srv-flush.mjs',
        cases: {
            1: {
                name: 'SRV-3: a write key’s flush lands after the response',
                projects: { app: { target_locales: ['it-it', 'de-de'] } },
                keys: { write: { project: 'app', type: 'write' } },
            },
            2: {
                name: 'SRV-3: a read key sends nothing',
                projects: { app: { target_locales: ['it-it', 'de-de'] } },
                keys: { read: { project: 'app', type: 'read' } },
            },
        },
    },
    4: {
        name: 'credentials',
        harness: 'src/srv-scope/credentials.contract.test.ts',
        cases: {
            1: {
                name: 'SRV-2: two concurrent requests under their own keys, and one under init()’s',
                projects: { zero: hello('zero'), one: hello('one'), two: hello('two') },
                keys: {
                    zero: { project: 'zero', type: 'write' },
                    one: { project: 'one', type: 'write' },
                    two: { project: 'two', type: 'write' },
                },
            },
            2: {
                name: 'SRV-2: a read key renders under its own project and sends nothing',
                projects: { two: hello('two') },
                keys: { write: { project: 'two', type: 'write' }, read: { project: 'two', type: 'read' } },
            },
        },
    },
    5: {
        name: 'srv-hydrate',
        harness: '_dev_/contract/srv-hydrate.mjs',
        cases: {
            1: {
                name: 'SRV-7, SRV-1: a block the server rendered and did not send lands under the server’s id once the client registers it',
                projects: { app: { target_locales: ['it-it'] } },
                keys: { server: { project: 'app', type: 'read' }, browser: { project: 'app', type: 'write' } },
            },
        },
    },
    6: {
        name: 'locale-race',
        harness: '_dev_/e2e/locale-race.mjs',
        cases: {
            1: { name: 'a slow fr-fr overtaken by a de-de that fails', projects: { app: RACE_CATALOG }, keys: { read: { project: 'app', type: 'read' } } },
            2: { name: 'a slow it-it overtaken by a pt-pt that succeeds', projects: { app: RACE_CATALOG }, keys: { read: { project: 'app', type: 'read' } } },
        },
    },
    7: {
        name: 'reference-reads',
        harness: 'src/srv-scope/reference-reads.contract.test.ts',
        cases: {
            1: {
                name: 'REF-1: the binding forwards the core’s reference lists',
                projects: { app: { target_locales: ['fr-fr'], locale_code_format: 'lowercase-hyphen' } },
                keys: { read: { project: 'app', type: 'read' } },
            },
        },
    },
};

/**
 * One case, resolved: `projects[label]` and `keys[label]` as the API knows them, each project's
 * user token, and the address the case calls from.
 */
export function caseOf(suite, kase) {
    const def = SUITES[suite]?.cases[kase];
    if (!def) throw new Error(`no case ${kase} in suite ${suite}`);
    const labels = Object.keys(def.projects);
    const projects = Object.fromEntries(
        labels.map((label, i) => {
            const id = tokenId(suite, kase, i + 1);
            const { phrases = [], blocks = [], ...rest } = def.projects[label];
            return [
                label,
                {
                    id: uuid(suite, kase, 0, i + 1),
                    title: `${SUITES[suite].name} ${kase} ${label}`,
                    base_locale: 'en-us',
                    ...rest,
                    phrases,
                    blocks,
                    user: { token: `${id}|svelte-token-${id}`, device_id: `svelte-device-${id}` },
                },
            ];
        })
    );
    const keys = Object.fromEntries(
        Object.entries(def.keys).map(([label, { project, ...rest }], i) => [
            label,
            { id: uuid(suite, kase, 1, i + 1), key: `svelte-${pad(suite, 2)}-${pad(kase, 2)}-${label}`, project: projects[project].id, ...rest },
        ])
    );
    return { name: def.name, projects, keys, caller: `10.76.${suite}.${kase}` };
}

/** The forwarder's setup for a case (`POST /__fixture/setup`): its keys, projects, tokens and address. */
export function setupOf(c, extra = {}) {
    return {
        keys: Object.values(c.keys).map((k) => k.key),
        projects: Object.values(c.projects).map((p) => p.id),
        tokens: Object.values(c.projects).map((p) => p.user.token),
        caller: c.caller,
        ...extra,
    };
}

/** Every case of every suite. */
export const allCases = () => Object.entries(SUITES).flatMap(([suite, { cases }]) => Object.keys(cases).map((kase) => caseOf(Number(suite), Number(kase))));

/** Every suite's seed document: `{ projects, keys }`, as the clone's seeder reads it. */
export function seeds() {
    return Object.entries(SUITES).map(([suite, { name, cases }]) => {
        const resolved = Object.keys(cases).map((kase) => caseOf(Number(suite), Number(kase)));
        return {
            file: `${pad(suite, 2)}-${name}.json`,
            doc: { projects: resolved.flatMap((c) => Object.values(c.projects)), keys: resolved.flatMap((c) => Object.values(c.keys)) },
        };
    });
}
