# NexureJS CI/CD Pipeline

This document describes the automated Continuous Integration and Continuous Deployment (CI/CD) pipeline set up for NexureJS.

## Overview

The CI/CD pipeline automates the build, test, benchmark, and release process, making it more robust and reducing manual work. The pipeline is implemented using GitHub Actions and consists of the following stages:

1. **Lint**: Validates code style and quality
2. **Security Scan**: Detects security vulnerabilities
3. **Build & Test**: Builds and tests the code on multiple platforms and Node.js versions
4. **Benchmark**: Runs and compares performance benchmarks
5. **Release Preparation**: Validates, versions, and prepares the package
6. **Publishing**: Publishes to npm with verification
7. **Notifications**: Reports on success or failure

## Enhanced Security and Quality Features

The new pipeline includes several enhanced security and quality features:

- **Permission Restrictions**: GitHub Actions use minimum required permissions
- **Security Scanning**: Separate job for vulnerability detection
- **Release Validation**: Extensive validation before releasing
- **Package Verification**: Verification before publishing to npm
- **Dependency Checks**: Validation of dependencies for security issues
- **Build Artifacts Caching**: Faster builds through caching

## Automated Workflows

### On Pull Requests and Pushes to Development Branches

1. **Lint**: Code is checked for style and quality issues
   - Results are stored as artifacts
   - Maximum warning level enforcement

2. **Security Scan**:
   - npm audit for vulnerability detection
   - Results stored as artifacts

3. **Build & Test**: Code is built and tested on:
   - Operating Systems: Ubuntu Linux, Windows, and macOS
   - Node.js versions: 18.x and 20.x
   - Coverage reports generated and uploaded to Codecov
   - Build artifacts stored for 7 days

### On Pushes to Main Branch

4. **Benchmark**:
   - Performance benchmarks are run
   - Results are compared with previous runs
   - Performance regressions are detected and reported
   - Long-term benchmark history is maintained

### Manual Workflow Dispatch for Releases

5. **Prepare Release**: Creates a new version based on the chosen release type:
   - Validates readiness (tests, dependencies, security)
   - Updates version in package.json
   - Updates CHANGELOG.md
   - Generates comprehensive release notes
   - Commits changes and creates a git tag
   - Creates a GitHub Release with all build artifacts

6. **Publish**: Publishes the package to npm:
   - Verifies package contents
   - Checks for sensitive information
   - Publishes to npm
   - Verifies successful publication

7. **Notify**: Sends notifications:
   - Creates GitHub issues for failed releases
   - Reports success or failure

## New Scripts

The following new scripts have been added to enhance the CI/CD process:

| Script | Description |
|--------|-------------|
| `validate` | Validates release readiness |
| `verify` | Verifies package contents before publishing |
| `generate:notes` | Generates rich release notes |
| `compare:benchmarks` | Compares benchmark results with previous runs |
| `ci:release:patch` | Automates patch release in CI |
| `ci:release:minor` | Automates minor release in CI |
| `ci:release:major` | Automates major release in CI |
| `ci:release:pre` | Automates pre-release in CI |

## How to Use

### Creating a New Release

To create a new release:

1. Go to the "Actions" tab in the GitHub repository
2. Select the "CI/CD Pipeline" workflow
3. Click "Run workflow"
4. From the dropdown, select the branch (usually `main`)
5. Select the release type:
   - `patch`: For bug fixes (0.0.x)
   - `minor`: For new features (0.x.0)
   - `major`: For breaking changes (x.0.0)
   - `pre`: For pre-releases (e.g., 0.1.0-alpha.1)
6. Click "Run workflow"

The release process will run automatically with multiple validation steps.

### Running Scripts Locally

You can also use the scripts locally for development and testing:

```bash
# Validate release readiness
npm run validate

# Verify package contents before publishing
npm run verify

# Generate release notes
npm run generate:notes

# Compare benchmark results
npm run compare:benchmarks
```

### Reviewing Benchmark Results

After a push to main:

1. Go to the "Actions" tab in the GitHub repository
2. Find the most recent "CI/CD Pipeline" run
3. Check the "Benchmark" job
4. View the logs for performance comparison
5. Download the benchmark results artifact for detailed analysis

The benchmark comparison script automatically detects performance regressions and provides detailed reporting.

## Troubleshooting

If the CI/CD pipeline fails, check:

1. **Lint Errors**: Review the lint report artifact
2. **Security Issues**: Check the security report artifact
3. **Build Failures**: Review logs for compilation errors
4. **Test Failures**: Check test logs and coverage reports
5. **Benchmark Regressions**: Look for performance degradation warnings
6. **Release Validation**: Ensure validation criteria are met
7. **Package Verification**: Review package contents warnings

## Required Secrets

The following secrets must be configured in the GitHub repository:

- `GITHUB_TOKEN`: Automatically provided by GitHub Actions
- `NPM_TOKEN`: Your npm access token for publishing
- `CODECOV_TOKEN`: Token for uploading coverage to Codecov (optional)

## Customization

To customize the CI/CD pipeline:

1. Edit `.github/workflows/ci-cd.yml` for workflow changes
2. Modify the validation scripts in `scripts/` directory:
   - `validate-release.js`: Edit validation criteria
   - `verify-package.js`: Customize package verification
   - `generate-release-notes.js`: Change release notes format
   - `compare-benchmarks.js`: Adjust benchmark comparison thresholds
