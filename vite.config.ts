import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vitest/config';
import { langsysPreprocess } from './src/lib/preprocess/index.js';

/**
 * Testbed only: the VAR-6 transform, applied to the routes and fixtures that measure a
 * registering <Translate> or <Phrase> — the VAR routes, and GATE-10's, whose controls register — and
 * to no other file, so `/fixture/var-plain` and every other route keep measuring the package without
 * it. An app enables it with one line in svelte.config.js instead; this runs the same `markup` step
 * on the same source, just before vite-plugin-svelte reads it.
 */
function varTransform(): Plugin {
    const transform = langsysPreprocess({ from: ['$lib/index.js'] });
    const scoped = /\/src\/(routes\/fixture\/(var|gate10)|ssr-measure\/var)\/[^?]*\.svelte$/;
    return {
        name: 'testbed-var-transform',
        enforce: 'pre',
        transform(code, id) {
            if (!scoped.test(id)) return null;
            const out = transform.markup({ content: code, filename: id });
            return out ? { code: out.code, map: out.map as never } : null;
        },
    };
}

// This repo carries no Node types: the process's environment, reached as kit/server.ts reaches Node.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const contract = Boolean(env.LANGSYS_CONTRACT_SUITE);

export default defineConfig({
    plugins: [varTransform(), sveltekit()],
    server: {
        // Dev-only: the /fixture testbed reaches the contract fixture's forwarder
        // (`contract-fixture/forwarder.mjs`, in front of an SDK test clone) through this same-origin
        // path, since the forwarder sends no CORS headers. The proxy only carries each request; the
        // forwarder routes it to its case by the key it carries. See `_dev_/contract/README.md`.
        proxy: {
            '/__fx': {
                target: `http://127.0.0.1:${env.LANGSYS_FX_PORT ?? 8787}`, // where `_dev_/contract/clone.mjs` starts the forwarder
                rewrite: (path) => path.replace(/^\/__fx/, ''),
            },
        },
    },
    test: {
        // Only the real sources. `svelte-package` copies `src/lib/` verbatim into
        // `dist/` and `.svelte-kit/__package__/`, test files included — so once
        // `npm run package` has run, vitest's default glob finds three copies of
        // every `src/lib/*.test.ts` and reports a count that is mostly duplicates
        // (19 real tests read as 55). The tarball is unaffected: the `files`
        // allowlist already excludes `dist/**/*.test.*`. This keeps `npm test`
        // honest about how many distinct tests exist.
        //
        // A `*.contract.test.ts` file runs against an SDK test clone (CONF-2), so it is left out
        // here and run on its own with `LANGSYS_CONTRACT_SUITE=1` (`_dev_/contract/README.md`).
        include: contract ? ['src/**/*.contract.test.ts'] : ['src/**/*.{test,spec}.{js,ts}'],
        exclude: contract ? [] : ['src/**/*.contract.test.ts'],
        ...(contract ? { testTimeout: 60_000, hookTimeout: 60_000 } : {}),
    },
});
