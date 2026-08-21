import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [sveltekit()],
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
