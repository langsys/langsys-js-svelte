/**
 * Shared harness for the ticket-838 E2E testbed.
 *
 * Not a route — SvelteKit only treats `+page`/`+layout`/etc. as routable, so
 * this sits alongside them safely. Nothing here ships in the package; the
 * published surface is `src/lib` only.
 */
import { LangsysApp, LangsysAppAPI } from '$lib/index.js';
import { writable, type Writable } from 'svelte/store';

/**
 * Absolute in both environments, so browser traffic is a genuine cross-origin
 * request against the API's CORS config rather than a same-origin proxy hop.
 *
 * The allow-list is explicit, not a wildcard: an unlisted port or an `https://`
 * scheme gets no headers at all, and `localhost` and `127.0.0.1` are separate
 * entries despite being the same host. If this testbed moves off port 5173,
 * the new origin has to be added server-side.
 */
export const BASE_URL = import.meta.env.VITE_LANGSYS_BASE_URL ?? 'http://langsys2.test/api';
export const PROJECT_ID = import.meta.env.VITE_LANGSYS_PROJECT_ID;

export const KEYS = {
    read: import.meta.env.VITE_LANGSYS_KEY_READ,
    ip_write: import.meta.env.VITE_LANGSYS_KEY_IP_WRITE,
    write: import.meta.env.VITE_LANGSYS_KEY_WRITE,
} as const;

export type KeyName = keyof typeof KEYS;

export function isKeyName(v: string | null): v is KeyName {
    return v === 'read' || v === 'ip_write' || v === 'write';
}

/**
 * Phrases must be genuine misses for the discovery lane to fire, but a random
 * phrase every load would litter the project and make a re-run unreadable.
 *
 * So: deterministic by default, fresh on demand via `?run=<id>`. The default id
 * is worth a second run on its own — pass one, let auto-MT settle, then reload.
 * The phrases are then registered-but-untranslated (present, `null`), which is
 * exactly the state that must NOT be re-reported.
 */
export const DEFAULT_RUN = 'base';

export function phrase(test: string, n: number, run: string): string {
    return `E2E 838 · ${test} · unregistered phrase ${n} · run ${run}`;
}

export const CATEGORY = 'E2E838';

/** The locale store is shared so a locale flip re-translates every mounted test. */
export const userLocale: Writable<string> = writable('en-US');

let started: Promise<unknown> | undefined;
let startedUnder: string | undefined;

/**
 * Initialize once per page load. `LangsysApp` is a module-scope singleton, so a
 * second `init()` in the same document is not a clean slate — every lane switch
 * in this testbed is therefore a full page load, not a client-side navigation.
 */
export function initLangsys(opts: { keyName: KeyName; grant?: string; debug?: boolean }): Promise<unknown> {
    const signature = `${opts.keyName}:${opts.grant ?? ''}`;
    if (started && startedUnder === signature) return started;
    if (started) {
        return Promise.reject(new Error(`Langsys already initialized as "${startedUnder}"; reload rather than re-initializing as "${signature}".`));
    }

    startedUnder = signature;
    LangsysAppAPI.setBaseUrl(BASE_URL);
    started = LangsysApp.init({
        projectid: PROJECT_ID,
        key: KEYS[opts.keyName],
        UserLocaleStore: userLocale,
        baseLocale: 'en-US',
        debug: opts.debug ?? true,
        ...(opts.grant ? { writeGrant: opts.grant } : {}),
    });
    return started;
}

export function missingEnv(): string[] {
    const missing: string[] = [];
    if (!PROJECT_ID) missing.push('VITE_LANGSYS_PROJECT_ID');
    for (const name of ['read', 'ip_write', 'write'] as const) {
        if (!KEYS[name]) missing.push(`VITE_LANGSYS_KEY_${name.toUpperCase()}`);
    }
    return missing;
}
