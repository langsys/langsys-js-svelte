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

export default defineConfig({
    plugins: [varTransform(), sveltekit()],
    server: {
        // Dev-only: the contract fixture (`contract-fixture/server.mjs`) sends no CORS headers,
        // so the /fixture testbed reaches it through this same-origin path. The double still
        // answers every request; the proxy only carries it. See `_dev_/contract/README.md`.
        proxy: {
            '/__fx': {
                target: 'http://127.0.0.1:8787', // the port `_dev_/contract/verify-contract.mjs` starts the double on
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
        include: ['src/**/*.{test,spec}.{js,ts}'],
    },
});
