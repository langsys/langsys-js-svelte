module.exports = {
    "tabWidth": 4,
    "singleQuote": true,
    "trailingComma": "es5",
    "printWidth": 160,
    "plugins": ["prettier-plugin-svelte"],
    "overrides": [{ "files": "*.svelte", "options": { "parser": "svelte" } }]
};
