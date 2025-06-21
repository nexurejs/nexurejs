# Changelog

All notable changes to NexureJS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.1] - 2025-04-02

### Added

- Added full integration for native HttpParser, RadixRouter, and JsonProcessor modules
- Implemented automatic fallbacks to JavaScript implementations when native modules unavailable
- Added method name mapping between native and JavaScript interfaces
- HTTP Parser: 10.9x faster file upload processing with 12.38 MB less memory usage
- RadixRouter: Added HTTP method-based routing with better parameter handling
- JsonProcessor: Implemented memory-efficient batch processing for JSON operations
- Added streaming capabilities to JsonProcessor with fallback support
- Improved RadixRouter API with HTTP method support in route definitions
- Enhanced HTTP parser with better header handling and memory management
- Fixed TypeScript build errors in benchmark code
- Resolved memory management issues in native module bindings
- Addressed ESLint warnings across the codebase
- Optimized performance showing 2.77x faster than Express, 1.13x faster than Fastify
- Enhanced route parameter handling outperforming all other tested frameworks
- Improved general HTTP parsing with better memory efficiency for large payloads

## [0.3.0] - 2025-04-01

### Added

- Implemented native module configuration and status functions for improved performance
- Added comprehensive HTTP utilities with zero-copy parsing and improved error handling
- Enhanced routing capabilities with optimized RadixRouter implementation
- Introduced unified JSON processing with native and JS fallback implementations
- Added support for both ESM and CommonJS environments
- Implemented BufferPool with adaptive sizing and recycling capabilities
- Added ObjectPool for efficient HTTP component management
- Enhanced worker pool functionality with advanced scaling features
- Introduced Stream Optimizer utilities for efficient stream processing
- Added AdaptiveTimeoutManager for dynamic timeout adjustments
- Implemented CryptoService with AES-256-GCM encryption and key rotation
- Enhanced security headers middleware with comprehensive CSP options
- Added rate limiting middleware with token bucket algorithm and Redis integration
- Improved HTTP parser with enhanced buffer validation and security measures
- Added comprehensive testing framework supporting unit, integration, compatibility, and performance tests
- Implemented Jest configuration with TypeScript support
- Added test runner script with support for various test types
- Enhanced benchmarking capabilities with CPU and memory profiling tools
- Enhanced documentation with performance benchmarks and native modules
- Improved build process with unified build script generation
- Added ESLint configuration for TypeScript with stricter rules
- Streamlined project structure and configuration files
- Added content type detection and transformation middleware
- Implemented static file serving with optimized buffer pool
- Enhanced validation middleware with comprehensive request validation
- Added multipart form data parser for file uploads
- Implemented stream transformation middleware
- Added GitHub Actions workflows for benchmarking, building, testing, and releasing
- Enhanced build process with improved TypeScript configuration
- Added support for native modules and improved build scripts
- Streamlined dependency management and project setup

## [0.2.0] - 2025-03-20

### Added

- Enhanced documentation across the entire codebase
- Detailed versioning strategy in release documentation
- Long-term support (LTS) planning information
- Post-release verification process
- Comprehensive release preparation checklist

### Changed

- Improved release process documentation with more detailed steps
- Updated roadmap with clearer development phases
- Enhanced contribution guidelines with more specific instructions
- Better organization of technical documentation

### Fixed

- Documentation formatting inconsistencies
- Missing steps in release verification process
- Outdated references in API documentation
- Improved cross-referencing between documentation files

## [0.1.9] - 2025-03-10

### Added

- Support for Node.js 23.x

### Changed

- Moved configuration files to root directory for better compatibility with build tools
- Updated TypeScript configuration for improved build process
- Improved ESLint configuration to reduce warnings and errors

### Fixed

- Fixed release script to correctly handle CHANGELOG.md in docs folder
- Fixed native module build process for cross-platform compatibility
- Resolved linting errors in prebuild.js script
- Fixed TypeScript configuration paths for proper module resolution

## [0.1.6] - 2025-03-09

### Added

- Multi-platform CI testing (Ubuntu, Windows, macOS)
- Automated build tools installation for different platforms
- Build artifacts collection on test failures
- C++17 standard enforcement across all platforms

### Changed

- Enhanced test workflow with parallel testing on multiple Node.js versions
- Improved error handling and debugging in CI pipeline
- Better naming and organization of test jobs

### Fixed

- Missing stdexcept header in HTTP parser
- Build tools setup for Windows and Ubuntu environments
- Cross-platform C++ compilation issues

## [0.1.5] - 2025-03-09

### Added

- Enhanced release script with improved GitHub release management
- Automated prebuilt binary uploads to GitHub releases
- Improved npm publishing workflow
- Better error handling and retry logic for asset uploads
- Progress tracking for binary uploads
- Dry run mode for testing release process

### Changed

- Combined separate release scripts into a single unified script
- Improved release process documentation
- Enhanced error messages and user feedback
- Better handling of GitHub API interactions

### Fixed

- Release script ES module compatibility
- Asset upload reliability with chunked uploads
- GitHub release creation error handling
- npm publishing version conflict handling

## [0.1.1] - 2025-03-09

### Added

- Initial documentation for native modules
- Performance metrics tracking for all native modules
- Comprehensive release documentation and process
- GitHub Actions workflows for automated releases and testing

### Fixed

- ES Module compatibility in build and installation scripts
- Native module building and loading in ES Module environment
- RadixRouter C++ code to use correct Node-API methods
- Installation and prebuild scripts for better cross-platform support

## [0.1.0] - 2023-11-15

### Added

- Initial release of NexureJS framework
- HTTP Parser native module for fast HTTP request parsing
- Radix Router native module for efficient route matching
- JSON Processor native module for high-performance JSON operations
- Basic server functionality with middleware support
- TypeScript support and type definitions
- Comprehensive documentation
- Example applications

### Changed

- Native modules are now enabled by default for maximum performance
- Default configuration includes maxCacheSize of 1000 for route caching

### Fixed

- HTTP Parser streaming functionality for handling large requests
- Native module loading path resolution for various environments
