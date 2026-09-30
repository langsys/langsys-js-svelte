/**
 * VAR-6's "one line": the transform as an app imports it — `langsys-js-svelte/preprocess`, the
 * published entry, resolved through package.json's `exports` to the built `dist/` — used exactly as
 * svelte.config.js would use it. Run after `npm run package`; it reads the tarball's files, not src.
 *
 *     npm run package && node _dev_/preprocess-entry.mjs
 */
import { compile } from 'svelte/compiler';
import { langsysPreprocess } from 'langsys-js-svelte/preprocess';

const source = `<script>import { Translate } from 'langsys-js-svelte'; let name = $state('Ana');</script>
<Translate category="UI"><p>Hello {name}</p></Translate>`;

const results = [];
const check = (c, n, d) => results.push({ ok: !!c, n, d });

const out = langsysPreprocess().markup({ content: source, filename: 'Entry.svelte' });
check(out && out.code.includes('__ls={{ tree: ['), 'the published entry transforms a <Translate>', out?.code);
check(out && out.code.includes('{"comment":"ls:name"}'), 'the interpolation becomes a named marker pair', out?.code);
check(out && out.map, 'with a source map');
let compiled = true;
try {
    compile(out.code, { generate: 'server', filename: 'Entry.svelte' });
} catch (e) {
    compiled = e.message;
}
check(compiled === true, 'the output compiles', compiled);

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}${r.ok || r.d === undefined ? '' : `\n      ${r.d}`}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
