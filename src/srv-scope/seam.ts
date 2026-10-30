/**
 * The request-scope seam (SRV-7), behind one adapter so the SvelteKit wiring in
 * `src/hooks.server.ts` does not change with the scope underneath it.
 *
 * The shipped wiring is `createLangsysHandle` (`src/lib/kit/server.ts`); `SRV_SEAM=core` uses it
 * directly. The seams here stand in for broken ones, so `_dev_/e2e/srv-scope.mjs` can show it
 * fails without a scope. Selected by `SRV_SEAM` in the dev server's environment:
 *
 *   core    — the core's request scope (`createRequestScope`, with an AsyncLocalStorage the
 *             binding supplies through `setRequestScopeStorage`).
 *   global  — no scope: seed the process-global signals, then render. What a scope replaces.
 *   shared  — SRV-7's own mutation: one core scope reused for every request.
 *
 * `_dev_/e2e/srv-scope.mjs` runs SRV-7's Test against whichever is selected.
 */
import * as core from 'langsys-js-typescript';
import type { iCategories } from 'langsys-js-typescript';

/** What the hook needs from a scope: render inside it, hand its seed to the page, close it after. */
export interface OpenScope {
    run<T>(render: () => Promise<T>): Promise<T>;
    seed(): { locale: string; catalog: iCategories };
    close(): Promise<unknown>;
}

export interface RequestScopeSeam {
    readonly name: string;
    open(options: { locale: string; catalog: iCategories; url: string }): Promise<OpenScope>;
}

const globalSeed: RequestScopeSeam = {
    name: 'global',
    async open({ locale, catalog }) {
        core.sTranslations.set(catalog);
        core.currentlyLoadedLocale.set(locale);
        return { run: (render) => render(), seed: () => ({ locale, catalog }), close: async () => undefined };
    },
};

/**
 * The core's API as SRV-7 decided it. Read off the module rather than imported by name, so this
 * testbed type-checks against a core that has not shipped it yet and names what is missing at
 * run time instead.
 */
interface CoreRequestScope {
    locale: string;
    run<T>(fn: () => T): T;
    seed(): { locale: string; catalog: iCategories };
    close(): Promise<unknown>;
}
interface CoreScopeApi {
    setRequestScopeStorage(storage: unknown): void;
    createRequestScope(options: { locale: string; catalog?: iCategories; url?: string }): Promise<CoreRequestScope>;
}

let storageSet = false;
const coreScope: RequestScopeSeam = {
    name: 'core',
    async open({ locale, catalog, url }) {
        const api = core as unknown as Partial<CoreScopeApi>;
        if (typeof api.createRequestScope !== 'function' || typeof api.setRequestScopeStorage !== 'function') {
            throw new Error('SRV_SEAM=core: this core build has no createRequestScope / setRequestScopeStorage (SRV-7 not landed).');
        }
        if (!storageSet) {
            // The core never imports node:async_hooks; the binding supplies the storage, so `load`'s
            // awaits stay inside the scope. Reached through `process` because this project carries no
            // Node type definitions.
            const proc = (globalThis as unknown as { process: { getBuiltinModule(id: string): { AsyncLocalStorage: new () => unknown } } }).process;
            api.setRequestScopeStorage(new (proc.getBuiltinModule('node:async_hooks').AsyncLocalStorage)());
            storageSet = true;
        }
        const scope = await api.createRequestScope({ locale, catalog, url });
        return { run: (render) => scope.run(render), seed: () => scope.seed(), close: () => scope.close() };
    },
};

let shared: OpenScope | undefined;
const sharedScope: RequestScopeSeam = {
    name: 'shared',
    // The mutation: the first request's core scope serves every later one.
    async open(options) {
        shared ??= await coreScope.open(options);
        return shared;
    },
};

const SEAMS: Record<string, RequestScopeSeam> = { global: globalSeed, shared: sharedScope, core: coreScope };

export function selectSeam(name: string | undefined): RequestScopeSeam {
    return SEAMS[name ?? 'global'] ?? globalSeed;
}
