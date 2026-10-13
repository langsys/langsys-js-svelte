# Upgrade audit from 3.6.17

`AUDIT.md` is the table: what an app on 3.6.17 (core 0.6.5) observes on this branch, row by row,
with each row's class and evidence. The scripts below are that evidence.

Two of them compare two core builds. Build each from a detached worktree of the core:

```bash
git -C ../langsys-js-typescript worktree add --detach /tmp/core-065 v0.6.5
git -C ../langsys-js-typescript worktree add --detach /tmp/core-pin <the "Core under test" SHA in CONFORMANCE.md>
(cd /tmp/core-065 && npm ci && npm run build) && (cd /tmp/core-pin && npm ci && npm run build)
export OLD_CORE=/tmp/core-065 NEW_CORE=/tmp/core-pin
```

- `peer-probe.mjs`: whether npm installs this package into an app on SvelteKit 2.9.0 and 2.10.0,
  with this tree's peer fields and with 3.6.17's. Needs the npm registry; no core builds. Run
  `node _dev_/upgrade/peer-probe.mjs`. Backs row 1.
- `core-surface.mjs`: what the surface a 3.6.17 app uses answers on both cores. That covers locale
  values, `detectPreferredLocale` and console output with debug off. It also checks every name and
  member 3.6.17 published, read from its tag, against this tree, and gives the tree path's id for
  `%name%`. Run `node _dev_/upgrade/core-surface.mjs`. Backs rows 2, 7, 8, 9 and 15.
- `id-moves.mjs`: the tokens, id, route and catalog entry each core derives for the 41
  canonicalization rows and twelve more shapes. It also records what the pinned core renders, and
  sends, for a block whose translation 0.6.5 stored. Run `node _dev_/upgrade/id-moves.mjs`, which
  writes `results.md` and `results.json` to `$OUT`, or to a temp directory. Takes about 35 s.
  Backs rows 6, 7, 10 and 11.
