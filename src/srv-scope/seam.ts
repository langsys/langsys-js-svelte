/**
 * The request-scope seam (SRV-7), behind one adapter so the SvelteKit wiring in
 * `src/hooks.server.ts` does not change when the core's API arrives.
 *
 * SRV-7 puts the seam in the TypeScript core: a scope per request with its own locale, catalog
 * view, miss collection and post-response flush, and its own hydration seed. This binding only
 * wires SvelteKit's request lifecycle to it. Until the core ships the API, the one implementation
 * here that exists is `global` — README-SSR's process-global seed placed in a request hook,
 * which is exactly the shape a scope has to replace. `_dev_/e2e/srv-scope.mjs` runs against
 * whichever adapter is selected; against `global` its concurrency case is expected to fail.
 *
 * Selected by `SRV_SEAM` in the dev server's environment:
 *   core    — the core's request scope. Not landed: throws, naming what is missing.
 *   global  — no scope: seed the process-global signals, then render (the default until `core`).
 *   shared  — SRV-7's own mutation: one scope for every request.
 */
import { currentlyLoadedLocale, sTranslations, type iCategories } from 'langsys-js-typescript';

export interface RequestScopeSeam {
    readonly name: string;
    /** Run one request's render inside a scope for `locale`, holding `catalog`. */
    run<T>(locale: string, catalog: iCategories, render: () => Promise<T>): Promise<T>;
}

const globalSeed: RequestScopeSeam = {
    name: 'global',
    run(locale, catalog, render) {
        sTranslations.set(catalog);
        currentlyLoadedLocale.set(locale);
        return render();
    },
};

let sharedOpened = false;
const sharedScope: RequestScopeSeam = {
    name: 'shared',
    // The mutation: the first request's scope is reused for every later one.
    run(locale, catalog, render) {
        if (!sharedOpened) {
            sharedOpened = true;
            return globalSeed.run(locale, catalog, render);
        }
        return render();
    },
};

const coreScope: RequestScopeSeam = {
    name: 'core',
    run() {
        // Wire here when the core announces the seam: open its scope for (locale, catalog), render
        // inside it, attach its hydration seed, and let it flush after the response.
        throw new Error('SRV_SEAM=core: the core has not shipped its request-scope API yet (SRV-7).');
    },
};

const SEAMS: Record<string, RequestScopeSeam> = { global: globalSeed, shared: sharedScope, core: coreScope };

export function selectSeam(name: string | undefined): RequestScopeSeam {
    return SEAMS[name ?? 'global'] ?? globalSeed;
}
