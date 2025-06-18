# Changelog

All notable changes to NexureJS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Fixed
- Fixed 3 security vulnerabilities in dependencies
- Fixed import path issues (double .js.js extensions)
- Fixed syntax errors in worker pool implementation
- Fixed missing method implementations in AdaptiveWorkerPool
- Fixed Logger import in stream middleware
- Fixed ES module compatibility in examples
- Fixed file naming issues (safe-wrapper.js.ts)

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

[Unreleased]: https://github.com/Braineanear/nexurejs/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/Braineanear/nexurejs/releases/tag/v0.3.1
