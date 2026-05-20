# NexureJS

High-performance Node.js web framework. TypeScript with native C++ addons
(SIMD, memory pooling) and an automatic pure-JavaScript fallback. ESM-first.
Published to npm as `nexurejs`. Author: Mahmoud Yasser.

## Tech Stack
- **Language**: TypeScript — `target: ES2022`, `module: NodeNext`, Node.js ≥18
- **Native layer**: C++ addons built with `node-addon-api` + `node-gyp` (`binding.gyp`)
- **Tests**: Vitest (`test/` + `src/**/*.test.ts`); native tests run as `.cjs` scripts
- **Tooling**: ESLint flat config (`eslint.config.js`) + Prettier; Husky, commitlint, commitizen

## Build & Run
- `npm run build:ts` — TypeScript only; fast, enough for most JS-side edits
- `npm run build:native` — compile the C++ addon (`scripts/build.js` → node-gyp)
- `npm run build:all` — native + TS + bundle
- `npm run build` — full build via `scripts/build.js`
- `npm run dev` — build TS then run `dist/index.js`
- `npm test` — Vitest run; `npm run test:coverage` (80% thresholds enforced)
- `npm run test:native` — native module integration tests
- `npm run lint` / `npm run typecheck`
- Raw `tsc` emits to `dist/build/`; only `npm run build` assembles the
  publishable `dist/` layout (`scripts/build.js` post-processes import paths).
  Prefer the npm scripts over invoking `tsc` directly when you need a runnable build.

## Architecture
- `src/index.ts` — package entry; re-exports native modules plus `Nexure`, `Router`, `Container`
- `src/core/nexure.ts` — the `Nexure` application class: HTTP server, middleware
  pipeline, DI container, routing, WebSocket, V8 + memory optimizers
- `src/native/<module>/` — every native feature ships C++ sources (`.cc`/`.h`)
  **and** a TypeScript wrapper with a pure-JS fallback. `src/native/loader.ts`
  safely loads the compiled `.node` binary; `src/native/index.ts` is the facade
  that picks native vs. JS at runtime
- `src/routing`, `src/middleware`, `src/di`, `src/http`, `src/security`,
  `src/validation`, `src/serialization`, `src/decorators` — JS-side framework modules
- `bin/nexure.js` — `nexure` CLI for project scaffolding (`create`, `init`)

## Working with native modules
- C++ sources live in `src/native/<module>/`. A file is only compiled if it is
  listed under `sources` in `binding.gyp`. Many `.cc` files present (e.g.
  `http_parser.cc`, `json_processor.cc`, `radix_router.cc`) are **not** in
  `binding.gyp` and are not built — check there before assuming a file is live.
- Several modules have variants (`*_fixed.cc`, `*_safe.cc`, `*_optimized.cc`,
  `*_original.cc`). The one referenced in `binding.gyp` is authoritative.
- A prebuilt binary may exist at `prebuilds/<platform>/nexurejs_native.node`.
  If the native build fails, the framework runs in pure-JS mode — keep the JS
  fallbacks correct and in sync with the C++ behavior.
- `binding.gyp` now **compiles** on arm64: the x86-only `-mavx2`/`-msse4.2`
  flags are arch-gated to `target_arch=='x64'`, and a bogus `nothing` target
  that referenced a non-existent `nothing.c` (the cause of the old
  `make: No rule to make target nothing.o` failure) was removed.
- The compiled native addon **works for the framework**: with `build/` present
  the full app runs end-to-end on it (routing, body parsing, JSON) and the
  Vitest suite is green. It is not built by default (no committed `build/`),
  so the loader finds no `.node` and falls back to pure JS — both modes are
  verified by the suite.
- Known standalone native defect: `ThreadPool.submit(fn)` aborts V8 —
  *"Cannot create a handle without a HandleScope"*: it invokes JS callbacks
  from C++ worker threads with no `napi_threadsafe_function` bridge. The
  framework never calls the native ThreadPool, so runtime is unaffected;
  `thread_pool.test.ts` skip-guards it. A proper fix needs `submit` rewritten
  around a thread-safe function.
- The `HttpParser` wrapper normalizes both backends to one contract (validates
  input, fills `versionMajor`/`versionMinor`/`body`), so native and JS behave
  identically — `http-parser.test.ts` runs green against both.

## Conventions
- File names: kebab-case `.ts`; classes PascalCase
- ESM throughout — **relative imports must include the `.js` extension** (NodeNext)
- Path alias `@/*` → `src/*`
- `tsconfig.json` is intentionally loose (`strict: false`, `noImplicitAny: false`,
  but `strictNullChecks: true`) — don't rely on the type checker to catch much
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:` …); `npx cz` for guided commits
- HTTP error classes live in `src/http/http-exception.ts`; `core/nexure.ts`
  serializes uncaught errors to a JSON body with `statusCode`/`message`/`path`

## Gotchas
- `src/framework/` is an **incomplete parallel rewrite**: its `index.ts` exports
  `NexureApplication`/`NexureServer`/etc. from subdirectories that are mostly
  empty. The *real, wired-up* framework is the top-level `src/` modules reached
  from `src/index.ts`. Don't edit `src/framework/` expecting it to take effect.
- `jest.config.js` and `jest.integration.config.js` are **stale** — the project
  migrated to Vitest. Use Vitest; ignore the jest configs.
- Empty placeholder directories exist: `src/architecture`, `src/config`,
  `src/memory`, `src/monitoring`, `src/process`, `src/streaming`.
- Version strings disagree across files: `package.json` `1.3.0-phase2`,
  `bin/nexure.js` `0.3.1`, `CHANGELOG.md` still `[Unreleased]`.
- Generated — never hand-edit: `dist/`, `prebuilds/`, `coverage/`,
  `benchmark-results/`, `logs/`, `node_modules/`.
