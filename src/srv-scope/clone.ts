/**
 * The contract fixture for a test file that drives the core against an SDK test clone (CONF-2):
 * `contract-fixture/forwarder.mjs` in a process of its own, with every case of
 * `_dev_/contract/cases.mjs` named to it. Without `LANGSYS_CONTRACT_TARGET` and
 * `LANGSYS_CONTRACT_CLONE_ROOT` it throws, so a contract test never passes by skipping.
 *
 * This repo carries no Node types, so the child's shape is stated here, and `node:child_process`
 * and the case list are loaded at run time, as kit/server.ts loads `node:async_hooks`.
 */
interface Child {
    stdout: { on(event: 'data', listener: (chunk: Uint8Array) => void): void };
    once(event: 'exit', listener: (code: number | null) => void): void;
    kill(): void;
}

/** A case of `cases.mjs`, resolved: each project and key by its label. */
export interface Case {
    projects: Record<string, { id: string; user: { token: string; device_id: string } }>;
    keys: Record<string, { id: string; key: string; project: string }>;
    caller: string;
}

export interface Clone {
    /** The API base URL to hand the core. */
    base: string;
    /** A case of `cases.mjs`, by suite and case number. */
    caseOf(suite: number, kase: number): Case;
    /** Changes a case's setup, named by its keys: the fields given replace the case's, and the rest stay. */
    update(c: Case, fields: Record<string, unknown>): Promise<void>;
    /** The phrases a project's catalog serves at a locale, read with `key`. */
    phrases(key: string, project: string, locale: string): Promise<string[]>;
    stop(): void;
}

interface Cases {
    caseOf(suite: number, kase: number): Case;
    allCases(): Case[];
    setupOf(c: Case, extra?: Record<string, unknown>): unknown;
}

/** The fetch this module loaded with: a test's own reads are not the SDK's traffic, so a test spying on `fetch` never sees them. */
const directFetch = globalThis.fetch.bind(globalThis);

const env = (globalThis as unknown as { process: { env: Record<string, string | undefined>; execPath: string } }).process;

export async function startClone(): Promise<Clone> {
    const target = env.env.LANGSYS_CONTRACT_TARGET;
    const cloneRoot = env.env.LANGSYS_CONTRACT_CLONE_ROOT;
    const log = env.env.LANGSYS_CONTRACT_LOG;
    if (!target || !cloneRoot) {
        throw new Error(
            'The contract tests run against an SDK test clone (spec CONF-2), and none is named: set LANGSYS_CONTRACT_TARGET to its origin, ' +
                'LANGSYS_CONTRACT_CLONE_ROOT to its langsys checkout, and NODE_EXTRA_CA_CERTS to the CA it serves with (_dev_/contract/README.md).'
        );
    }
    const id = 'node:child_process';
    const { spawn } = (await import(/* @vite-ignore */ id)) as { spawn: (command: string, args: string[]) => Child };
    const cases = (await import(/* @vite-ignore */ new URL('../../_dev_/contract/cases.mjs', import.meta.url).href)) as Cases;

    const child = spawn(env.execPath, ['contract-fixture/forwarder.mjs', '--target', target, '--clone-root', cloneRoot, ...(log ? ['--log', log] : [])]);
    // The forwarder's first line on stdout names its two URLs.
    const line = await new Promise<string>((resolve, reject) => {
        let out = '';
        child.stdout.on('data', (chunk) => {
            out += new TextDecoder().decode(chunk);
            if (out.includes('\n')) resolve(out.slice(0, out.indexOf('\n')));
        });
        child.once('exit', (code) => reject(new Error(`the forwarder exited (${code}): is the clone up?`)));
    });
    const { base_url: base, fixture_url: fixture } = JSON.parse(line) as { base_url: string; fixture_url: string };
    const post = async (body: unknown) => {
        const res = await directFetch(`${fixture}/setup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) throw new Error(`the forwarder refused a setup: ${res.status} ${await res.text()}`);
    };
    for (const c of cases.allCases()) await post(cases.setupOf(c));

    return {
        base,
        caseOf: cases.caseOf,
        update: (c, fields) => post({ keys: Object.values(c.keys).map((k) => k.key), ...fields }),
        phrases: async (key, project, locale) => {
            const res = await directFetch(`${base}/translations?project_id=${encodeURIComponent(project)}&locale=${encodeURIComponent(locale)}`, {
                headers: { accept: 'application/json', 'x-authorization': key },
            });
            const body = (await res.json().catch(() => null)) as { data?: Record<string, Record<string, unknown>> } | null;
            if (!res.ok || !body) throw new Error(`the catalog read answered ${res.status}`);
            return Object.values(body.data && !Array.isArray(body.data) ? body.data : {}).flatMap((entries) =>
                Object.entries(entries ?? {})
                    .filter(([, value]) => !value || typeof value !== 'object')
                    .map(([phrase]) => phrase)
            );
        },
        stop: () => child.kill(),
    };
}
