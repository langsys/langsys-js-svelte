module.exports = {
    tabWidth: 4,
    singleQuote: true,
    trailingComma: 'es5',
    printWidth: 160,
    plugins: ['prettier-plugin-svelte'],
    overrides: [
        { files: '*.svelte', options: { parser: 'svelte' } },
        {
            // Markdown ONLY. Do not format code inside fences: Prettier rewrites the
            // ```svelte samples in README.md at printWidth 160, joining separate
            // elements onto one line and pulling trailing HTML comments onto their
            // own lines, which wrecks examples written to be read.
            //
            // This MUST stay scoped to markdown. Setting it globally breaks
            // prettier-plugin-svelte, which relies on embedded formatting to print
            // <script> blocks -- it fails with "unknown node type: Script" on every
            // .svelte file. Verified both ways.
            files: '*.md',
            options: { embeddedLanguageFormatting: 'off' },
        },
    ],
};
