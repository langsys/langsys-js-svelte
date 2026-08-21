// Flat config. ESLint 9 dropped `.eslintrc.*` and `.eslintignore`; ESLint 10 is
// what this repo has, so the legacy files were inert and `npm run lint` failed
// outright rather than linting nothing quietly. This is a faithful port of the
// old `.eslintrc.cjs` — same extends, same parsers, same (empty) rule overrides.
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import svelteParser from 'svelte-eslint-parser';

export default ts.config(
    {
        // Ported from .eslintignore, which ESLint no longer reads. `dist` is added
        // because it did not exist as a build target when the old list was written
        // and linting generated output produces noise, not findings.
        ignores: ['.DS_Store', 'node_modules/**', 'build/**', '.svelte-kit/**', 'dist/**', 'package/**', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock'],
    },

    js.configs.recommended,
    ...ts.configs.recommended,
    ...svelte.configs['flat/recommended'],
    prettier,
    ...svelte.configs['flat/prettier'],

    {
        languageOptions: {
            globals: { ...globals.browser, ...globals.node },
            parserOptions: {
                sourceType: 'module',
                ecmaVersion: 2020,
                extraFileExtensions: ['.svelte'],
            },
        },
    },

    {
        // Ambient declaration files exist to declare things consumed elsewhere by
        // the type system, so nothing references them by name in-file and
        // no-unused-vars flags every one. `interface ImportMeta` here is a real
        // augmentation: without it `import.meta.env.VITE_*` still compiles, but
        // falls through Vite's `[key: string]: any` index signature instead of
        // being typed `readonly string | undefined`. Checked before exempting it.
        files: ['**/*.d.ts'],
        rules: { '@typescript-eslint/no-unused-vars': 'off' },
    },

    {
        files: ['**/*.svelte'],
        languageOptions: {
            parser: svelteParser,
            parserOptions: { parser: ts.parser },
        },
    }
);
