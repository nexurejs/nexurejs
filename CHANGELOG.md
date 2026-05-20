# Changelog

All notable changes to NexureJS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.3.0] - 2026-05-20

### Added
- Complete CLI tool for project scaffolding and development
- Comprehensive getting started guide and documentation
- Native C++ module build system for macOS, Linux, and Windows
- Thread pool with priority-based task scheduling
- High-performance string encoder (Base64, URL, HTML)
- HTTP parser with native performance optimizations
- Radix router for fast route matching
- WebSocket server with native performance
- JSON processor with SIMD acceleration
- Compression algorithms for data optimization
- Streaming support for large data processing
- Dependency injection system
- Middleware architecture
- TypeScript-first development with full type safety
- Automatic fallback to JavaScript when native modules unavailable
- Performance monitoring and metrics collection
- Project templates (basic, API, full)
- Code generation for controllers, middleware, and services
- ES module support throughout the codebase
- Comprehensive test suite with 76 passing tests
- GitHub Actions CI/CD pipeline
- Release automation scripts

### Changed
- Reorganized project structure for better maintainability
- Moved 25 test files from root to organized test directories
- Updated all dependencies to latest secure versions
- Improved error handling and logging throughout
- Enhanced middleware system with streaming support
- Optimized build process with parallel compilation
- Updated examples to use ES modules
- Consolidated CI/CD into focused `ci.yml` (lint, test matrix, build check) and
  `release.yml` (tag-triggered publish) workflows; removed the overlapping
  `build.yml`, `tests.yml` and `ci-cd.yml`
- npm package contents are now controlled by a minimal `files` allowlist —
  source, tests, benchmarks, examples and docs are no longer published
- Aligned `package.json` (`main`, `exports`) with the real ESM build output,
  produced by the new `build:dist` script and `tsconfig.build.json`

### Fixed
- Fixed 3 security vulnerabilities in dependencies
- Fixed import path issues (double .js.js extensions)
- Fixed syntax errors in worker pool implementation
- Fixed missing method implementations in AdaptiveWorkerPool
- Fixed Logger import in stream middleware
- Fixed ES module compatibility in examples
- Fixed file naming issues (safe-wrapper.js.ts)
- Release pipeline no longer publishes a fallback stub package when the build
  fails, and the unsafe force-push / `npm unpublish` rollback job was removed
- `scripts/release.js` no longer crashes on a stale `docs/CHANGELOG.md` path and
  now bumps the version correctly from a pre-release base
- `nexure` CLI version is read from `package.json` instead of a hardcoded value
- `npm run build` no longer regenerates and overwrites the CI workflow files
- Documentation link checker (`npm run docs:check`) replaces the broken
  `docs:dev`/`docs:build`/`docs:serve`/`docs:generate` scripts

### Security
- Updated fastify to fix high-severity vulnerability
- Updated koa to fix XSS vulnerability
- Updated regex packages to fix DoS vulnerability
- Zero security vulnerabilities remaining

## [0.3.1] - 2024-03-09

### Added
- Initial public release
- Core framework functionality
- Basic HTTP server implementation
- Routing system with parameter support
- Middleware architecture
- Request/response handling
- Basic documentation

### Changed
- Improved TypeScript definitions
- Enhanced error handling

### Fixed
- Various bug fixes and improvements

[Unreleased]: https://github.com/nexurejs/nexurejs/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/nexurejs/nexurejs/compare/v0.3.1...v1.3.0
[0.3.1]: https://github.com/nexurejs/nexurejs/releases/tag/v0.3.1
