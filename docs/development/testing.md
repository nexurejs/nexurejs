# Testing Strategy for NexureJS

This document outlines the testing strategy used to ensure NexureJS functions correctly and reliably across different environments.

## Core Testing Areas

NexureJS employs a comprehensive testing approach that focuses on several key areas:

1. **Core Functionality Testing**: Verifies that all core framework features work as expected
2. **Error Handling**: Ensures the framework handles errors gracefully without crashing
3. **Cross-Environment Compatibility**: Validates that the framework works in different Node.js versions and module systems
4. **Environment Validation**: Checks that your Node.js and system environment are correctly set up

## Running Tests

You can run the various test suites using the following npm scripts:

```bash
# Run the integrated test runner (recommended)
npm run test:run

# Run the test runner in lite mode (without native modules)
npm run test:run:lite

# Run the test runner including all tests
npm run test:run:full

# Run the simple HTTP server test (doesn't require framework build)
npm run test:server

# Run the core integration tests
npm run test:core

# Run error handling tests
npm run test:errors

# Run cross-environment compatibility tests
npm run test:compatibility

# Run all tests
npm run test:all

# Run all tests in lite mode (without native modules)
npm run test:lite
```

## Test Organization

The testing code is organized as follows:

- `test/integration/` - Integration tests that validate core framework functionality
- `test/unit/` - Unit tests for specific components
- `test/compatibility/` - Tests that validate cross-environment compatibility
- `test/simple-server.js` - Standalone HTTP server test that doesn't depend on the framework
- `test/smoke-test.js` - Quick test to verify that the framework can be imported and used
- `test/version-check.js` - Validates the Node.js version and environment compatibility
- `test/run-tests.js` - Integrated test runner that coordinates the test process

## Core Integration Tests

The core integration tests in `test/integration/core-integration.js` validate:

- Server creation and basic HTTP operations
- Middleware execution and order
- Error handling and recovery
- Request and response processing
- Router functionality including parameters and wildcards
- Content negotiation

## Error Handling Tests

The error handling tests in `test/unit/error-handling.js` specifically test:

- HTTP exceptions and their correct propagation
- Server recovery after various error conditions
- Handling of malformed requests
- Async error handling
- Edge cases like multiple response attempts

## Compatibility Tests

The compatibility tests in `test/compatibility/compatibility-test.js` verify that NexureJS works correctly across:

- ESM module system
- CommonJS module system
- With native modules enabled
- With native modules disabled (lite mode)

This ensures that the framework is flexible enough to work in different environments and configurations.

## Simple Server Test

The simple server test in `test/simple-server.js` provides:

- A minimalistic HTTP server that doesn't depend on the framework
- Validation that the Node.js environment is correctly set up
- A quick way to test that the server can listen on a port
- Basic environment information logging

## Integrated Test Runner

The integrated test runner in `test/run-tests.js` provides:

- A single entry point for all tests
- Automatic build detection and rebuilding when needed
- Smoke test execution
- Optional execution of the full test suite
- Environment variable configuration for various test modes

## Adding New Tests

When adding new features to NexureJS, you should also add appropriate tests:

1. For new core functionality, add test cases to `test/integration/core-integration.js`
2. For new error cases, add tests to `test/unit/error-handling.js`
3. For features with cross-environment implications, update `test/compatibility/compatibility-test.js`

## Continuous Testing

It's recommended to run the test suite:

- Before and after any significant changes
- When upgrading Node.js versions
- After modifying the module system or native module integration
- As part of CI/CD pipelines

## Testing Across Node.js Versions

To ensure compatibility with all supported Node.js versions, you can use Docker:

```bash
# Test with Node.js 16.14.0
docker run -it --rm -v $(pwd):/app -w /app node:16.14.0 npm run test:run

# Test with Node.js 18
docker run -it --rm -v $(pwd):/app -w /app node:18 npm run test:run

# Test with Node.js 20
docker run -it --rm -v $(pwd):/app -w /app node:20 npm run test:run
```

## Debugging Test Issues

When tests fail, check the following:

1. Look at the test output to identify which specific test failed
2. Check the error message and stack trace for clues
3. For compatibility issues, verify the Node.js version and module system
4. For native module issues, try running in lite mode (`npm run test:run:lite`)
5. Use `--inspect` for Node.js debugging: `node --inspect test/path/to/test.js`
6. Try the simple server test to see if basic HTTP functionality works: `npm run test:server`

## Testing Flags

The integrated test runner supports several flags:

- `--lite`: Disables native modules
- `--skip-build`: Skips the build check and rebuild
- `--verbose` or `-v`: Enables verbose logging
- `--full-tests`: Runs the full test suite

Example: `npm run test:run -- --lite --verbose`
