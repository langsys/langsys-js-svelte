# Contract harness

Dev-only. Runs the binding rows graded `contract` — HINT-13 and GATE-10 — in a real browser,
through SvelteKit's own router, against the shared API double in `contract-fixture/`.

```bash
npm run dev                                   # 127.0.0.1:5173, freshly started
node _dev_/contract/verify-contract.mjs       # starts the double on 127.0.0.1:8787 itself
```

No `.env` and no API: the harness seeds the double, and every assertion reads the double's
**accepted state** (`GET /__fixture/state`) — stored hints, registered phrases and blocks —
never what the browser sent.

**Why the proxy.** The double sends no CORS headers, so a page on `:5173` cannot call it
directly. The `/fixture` testbed points `apiUrl` at `/__fx/api` on its own origin, and
`vite.config.ts` proxies `/__fx` to the double. The double answers every request.

**`contract-fixture/` is vendored byte-exact** from langsys-js-typescript and cited by git tree
id in `CONFORMANCE.md`. Never edit or reformat it (it is in `.prettierignore` and eslint's
ignores); re-vendor it with `git -C ../langsys-js-typescript archive <sha> contract-fixture | tar -x`.

**The testbed** is `src/routes/fixture/`: a persistent `+layout.svelte` that calls
`syncNavigation()` and holds one phrase, pages `a` and `b` for the navigation, and `gate10` for
the resolved-subtree shapes.

**Mutations** run in a copy of the tree on another port (`E2E_BASE_URL=http://127.0.0.1:5175`).
Prove the copy passes unmutated first: a copy Vite refuses to serve — a symlinked
`node_modules` outside its allow list — fails every case and reads as a red mutation.
