# Publishing langsys-js-svelte

Releases are CI-driven through npm **trusted publishing** (OIDC): there is no npm token in the
repo, in CI secrets or on a maintainer's machine. The release script prepares the version, the tag
and the GitHub release; the GitHub release starts the workflow that publishes to npm.

## Before a release

- You are on `main`, with the release's work merged and **not pushed**. The script amends the last
  commit with the version bump, so it refuses when there is nothing unpushed.
- `main` is up to date with `origin/main`. The script refuses when `origin/main` holds commits you
  do not have: its push is a force-push with lease, and after its own fetch the lease would accept
  overwriting them.
- `CHANGELOG.md` has a `## X.Y.Z - unreleased` section for the version. Preview the release body
  with `bash _dev_/publish.sh --notes X.Y.Z` (the version defaults to the unreleased section's).
- The GitHub CLI is installed and authenticated (`gh auth status`; see `GITHUB_CLI_SETUP.md`).

## Running it

```bash
npm run release        # runs ./_dev_/publish.sh
```

It takes no arguments. It asks for the version, suggesting the next patch, and then
`Ready to publish version X.Y.Z? (y/N)`.

## What it does

1. **Checks**: `gh` is installed and authenticated, the branch is `main`, `origin/main` has nothing
   you lack, and there is at least one unpushed commit.
2. **Refuses before changing anything** a version that is not `x.y.z` or `x.y.z-tag`, one that
   exists as a tag, a version with no CHANGELOG section, and release notes over GitHub's 125,000
   characters.
3. **Bumps** `package.json`, stamps the date into the `## X.Y.Z - unreleased` heading, so it matches
   the publish, and runs `npm install` (the lockfile) and `npm run build`.
4. **Amends** the last commit with the bump (its message gains `[Version bumped to X.Y.Z]`), pushes
   `main` with `--force-with-lease`, and creates and pushes the annotated tag `vX.Y.Z`.
5. **Creates the GitHub release** `vX.Y.Z`. Its body is the version's CHANGELOG section, the
   install line and the compare link from the previous version.

If a step fails after the version changed, the script offers a rollback: `package.json` and the
CHANGELOG heading restored, the commit from before the amend restored (and force-pushed back if
it was pushed), and the tag deleted locally and on `origin`.

The script does not publish to npm. The release's `published` event runs
`.github/workflows/publish.yml` in the `npm-publish` environment: `npm ci`, `npm run check`,
`npm test -- --run`, `npm run package`, then `npm publish --provenance`.

## Trusted publishing

Three settings must agree, or the workflow fails at the publish step:

- the GitHub Environment `npm-publish`;
- npm's trusted publisher for the package: environment `npm-publish`, workflow `publish.yml`;
- `environment: npm-publish` in `.github/workflows/publish.yml`.

Publishing through OIDC needs npm 11.5.1 or later; the workflow installs the latest npm, because
Node 22 ships npm 10.

## After the release

- The Publish run: https://github.com/langsys/langsys-js-svelte/actions
- The published version: `npm view langsys-js-svelte@X.Y.Z version dist.integrity`, and its date,
  which the CHANGELOG heading carries: `npm view langsys-js-svelte time --json`.

## When the publish fails

The GitHub release and the tag stay, and no npm version exists for them. A re-run of the workflow
publishes the tag's commit, so:

- A cause outside the code, such as the trusted-publisher settings or a registry outage: fix it,
  then re-run the failed job from the Actions tab.
- A cause in the code: fix it on `main` and release the next version. The script refuses a
  version whose tag exists.
