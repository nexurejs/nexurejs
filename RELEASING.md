# Releasing NexureJS

How NexureJS is validated, built, and published.

## Pipelines

Two GitHub Actions workflows own the process:

| Workflow | Trigger | What it does |
| --- | --- | --- |
| [`ci.yml`](.github/workflows/ci.yml) | push / PR to `main`, `master`, `develop` | Lint + type-check, test matrix (Node 18/20/22 on Linux, plus Windows & macOS on Node 20), coverage upload, and a build + package-verification check. |
| [`release.yml`](.github/workflows/release.yml) | push of a `v*` tag | Re-verifies (lint, type-check, tests), builds the distributable, verifies the package, publishes to npm with provenance, and creates a GitHub Release. |

CI and release are deliberately separate: CI never publishes, and the release
workflow only runs for an explicit version tag.

## One-time setup

Publishing uses **npm trusted publishing** (OIDC) — there is no `NPM_TOKEN`
secret. On npmjs.com the `nexurejs` package is configured with a trusted
publisher pointing at this repository's `release.yml` workflow; the workflow's
`publish` job carries `id-token: write`, which lets npm mint short-lived
credentials at publish time and attach build provenance automatically. The
workflow upgrades the npm CLI to the latest version because trusted publishing
requires npm >= 11.5.1.

Optional repository secret (Settings → Secrets and variables → Actions):

- `CODECOV_TOKEN` — only needed for coverage uploads in CI.

## Cutting a release

1. Make sure `main` is green in CI and your working tree is clean.
2. Run the matching release command:

   | Command | Result |
   | --- | --- |
   | `npm run release:patch` | `x.y.Z` bump |
   | `npm run release:minor` | `x.Y.0` bump |
   | `npm run release:major` | `X.0.0` bump |
   | `npm run release:pre`   | pre-release bump (e.g. `x.y.z-alpha.1`) |
   | `npm run release:dryrun` | preview only — makes no changes |

   `scripts/release.js` bumps `package.json`, updates `CHANGELOG.md`, commits,
   creates the `vX.Y.Z` tag, and pushes it.
3. Pushing the tag triggers `release.yml`. It does **not** rely on anything
   from your machine — it re-runs the full verification, builds, and publishes.

`release.js` never publishes to npm itself; pushing the tag is the only thing
that triggers a publish, which avoids double-publishing.

## What gets published

Package contents are controlled by the `files` allowlist in `package.json`:

- `dist/` — compiled ESM JavaScript + type declarations
- `bin/` — the `nexure` CLI
- `src/native/` + `binding.gyp` — C++ sources, so the native addon can be
  rebuilt on install
- `scripts/build.js`, `scripts/preinstall.js`, `scripts/postinstall.js` — install lifecycle
- `README.md`, `LICENSE`, `CHANGELOG.md`

Source TypeScript, tests, benchmarks, examples and docs are **not** published.
Inspect exactly what would ship before releasing:

```bash
npm run build:dist          # produce dist/
npm run publish:dry         # `npm publish --dry-run`
node scripts/verify-package.js
```

`prepublishOnly` runs `verify-package.js` automatically, so a missing or broken
`dist/` aborts any `npm publish`.

## dist-tags

`release.yml` picks the npm dist-tag from the version string:

- Stable version (`1.4.0`) → `latest` (`npm install nexurejs`)
- Pre-release version (`1.4.0-rc.1`) → `next` (`npm install nexurejs@next`)

This keeps pre-releases off the default install.

## The build

`npm run build:dist` (used by both the release workflow and `prepublishOnly`'s
prerequisites) compiles `src/` straight into the published `dist/` layout using
[`tsconfig.build.json`](tsconfig.build.json):

```
src/index.ts       -> dist/index.js + dist/index.d.ts
src/http/index.ts  -> dist/http/index.js
```

The package is ESM-only (`"type": "module"`); CommonJS consumers load it with a
dynamic `import()`.

The native C++ addon is optional. It is delivered as platform-specific
`optionalDependencies` (`nexurejs-native-*`) and rebuilt on install when
possible; if neither is available the framework runs on its pure-JavaScript
fallback. Building those platform packages is a separate process and is not
part of this release flow.

## Manual publish (fallback)

If the workflow is unavailable:

```bash
npm ci
npm run lint && npm run typecheck && npm test
npm run build:dist
npm publish --provenance --access public --tag latest   # or --tag next
```

## If a release fails

- **Before publish** (verification/build failed): fix the issue and push a new
  tag. Nothing was published.
- **After publish**: npm versions are immutable — do not unpublish. Fix forward
  with a new patch release. If a bad version reached `latest`, move the tag:
  `npm dist-tag add nexurejs@<good-version> latest`.
