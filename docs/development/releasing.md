# Release Process for NexureJS

This document outlines the process for creating and publishing new releases of NexureJS.

## Prerequisites

Before starting the release process, ensure you have:

1. Push access to the NexureJS GitHub repository
2. npm publishing rights for the NexureJS package
3. Node.js and npm installed locally
4. All tests passing on the main branch across all platforms (Ubuntu, Windows, macOS)
5. A GitHub personal access token with `repo` scope for creating releases
6. All necessary build tools installed for your platform (see platform-specific requirements)

## Version Numbering

NexureJS follows [Semantic Versioning](https://semver.org/) (SemVer):

- **Major version (X.0.0)**: Incompatible API changes
- **Minor version (0.X.0)**: New functionality in a backward-compatible manner
- **Patch version (0.0.X)**: Backward-compatible bug fixes

## Release Preparation Checklist

Before initiating the release process, ensure the following:

- [ ] All CI checks are passing on the main branch
- [ ] All planned features for this release are complete and merged
- [ ] All critical bugs are fixed
- [ ] Documentation is up-to-date
- [ ] Performance benchmarks show no regressions
- [ ] Native modules build successfully across all supported platforms

## Release Process

### 1. Prepare the Release

1. Ensure you're on the main branch and it's up to date:
   ```bash
   git checkout main
   git pull origin main
   ```

2. Run tests to ensure everything is working across all platforms:
   ```bash
   npm test
   ```

3. Build the project to ensure it compiles correctly:
   ```bash
   npm run build
   ```

4. Build native modules for all platforms:
   ```bash
   npm run build:native:all
   ```

5. Run benchmarks to ensure no performance regressions:
   ```bash
   npm run benchmark
   ```

### 2. Run the Release Script

The release process is now fully automated with a unified release script:

```bash
npm run release [major|minor|patch|<version>]
```

For example:
```bash
npm run release:patch  # For patch releases
npm run release:minor  # For minor releases
npm run release:major  # For major releases
npm run release 1.2.3  # For specific versions
```

The release script will:

1. Update the version in package.json
2. Update the docs/CHANGELOG.md file (you'll be prompted to review and edit)
3. Commit the changes
4. Create and push a git tag
5. Create a GitHub release with release notes from the docs/CHANGELOG.md
6. Upload prebuilt binaries to the GitHub release with retry logic
7. Publish the package to npm

You can also run the script with the `--dry-run` flag to see what would happen without making any changes:

```bash
npm run release:patch --dry-run
```

### 3. Manual Release Process (if needed)

If you need to perform the release steps manually:

#### 3.1 Update Version and Changelog

1. Determine the new version number based on the changes since the last release.

2. Update the version in `package.json`:
   ```bash
   npm version <new-version> --no-git-tag-version
   ```

3. Update the docs/CHANGELOG.md file with details of the changes in this release:
   - New features
   - Bug fixes
   - Performance improvements
   - Breaking changes (if any)

4. Commit the version and changelog changes:
   ```bash
   git add package.json docs/CHANGELOG.md
   git commit -m "chore: prepare release v<new-version>"
   ```

#### 3.2 Tag and Release

1. Create a git tag for the new version:
   ```bash
   git tag -a v<new-version> -m "Release v<new-version>"
   ```

2. Push the tag to GitHub:
   ```bash
   git push origin v<new-version>
   ```

3. Create a GitHub release and upload prebuilt binaries:
   ```bash
   GITHUB_TOKEN=your_token_here node scripts/release.js
   ```

   This unified script will:
   - Create a GitHub release for the current version
   - Extract release notes from docs/CHANGELOG.md
   - Upload all prebuilt binaries from the `prebuilds` directory with retry logic
   - Publish the package to npm (if you choose to)

### 4. Post-Release Verification

After the release is complete, verify the following:

1. The package is available on npm with the correct version:
   ```bash
   npm view nexurejs version
   ```

2. The GitHub release is created with:
   - Correct version tag
   - Release notes from the changelog
   - All prebuilt binaries attached

3. The package can be installed and used:
   ```bash
   mkdir test-release && cd test-release
   npm init -y
   npm install nexurejs
   node -e "console.log(require('nexurejs'))"
   ```

4. Documentation links are working correctly

### 5. Announce the Release

1. Announce the new release on:
   - GitHub Discussions
   - Twitter/X (@NexureJS)
   - Discord community server
   - Dev.to or Medium blog post (for major releases)

2. Highlight key features, improvements, and breaking changes.

3. Provide upgrade instructions for existing users.

## CI/CD Pipeline

NexureJS uses GitHub Actions for continuous integration and deployment:

1. **Test Workflow**: Runs tests on multiple platforms (Ubuntu, Windows, macOS) and Node.js versions
2. **Release Workflow**: Automates the release process
3. **npm Publish Workflow**: Publishes the package to npm

You can trigger the release workflow manually from the GitHub Actions tab.

## Handling Hotfixes

For urgent fixes that need to be released outside the normal release cycle:

1. Create a hotfix branch from the latest release tag:
   ```bash
   git checkout -b hotfix/v<current-version>.<patch> v<current-version>
   ```

2. Make the necessary fixes and commit them.

3. Update the version in `package.json` and update the docs/CHANGELOG.md.

4. Use the release script to complete the process:
   ```bash
   npm run release <current-version>.<patch>
   ```

5. After the hotfix is released, ensure the changes are also merged back to the main branch:
   ```bash
   git checkout main
   git merge hotfix/v<current-version>.<patch>
   git push origin main
   ```

## Managing Prebuilt Binaries

NexureJS provides prebuilt binaries for various platforms to avoid building from source during installation. The release process handles this automatically, but here's a manual overview:

1. Prebuilt binaries are created during the build process and stored in the `prebuilds` directory
2. Each binary follows the naming convention: `nexurejs-v{version}-{node_abi}-{platform}-{arch}.tar.gz`
3. The release script uploads these binaries to the GitHub release
4. When users install NexureJS, the installation script attempts to download a matching prebuilt binary

To manually build prebuilt binaries for all platforms:

```bash
npm run build:native:all
```

## Versioning Strategy

NexureJS follows these guidelines for version increments:

1. **Patch Version (0.0.X)**:
   - Bug fixes
   - Documentation improvements
   - Minor performance optimizations
   - Internal refactoring (no API changes)

2. **Minor Version (0.X.0)**:
   - New features
   - Non-breaking improvements
   - New APIs with backward compatibility
   - Deprecation of existing APIs (with warning)

3. **Major Version (X.0.0)**:
   - Breaking API changes
   - Removal of deprecated features
   - Significant architecture changes
   - Major rewrites or refactoring

## Long-term Support (LTS)

NexureJS will establish an LTS policy when reaching version 1.0.0, with details to be announced closer to that milestone.

## Release Checklist

- [ ] All tests passing on all platforms (Ubuntu, Windows, macOS)
- [ ] Code built successfully
- [ ] Native modules built for all platforms
- [ ] Benchmarks show no performance regressions
- [ ] Version updated in package.json
- [ ] docs/CHANGELOG.md updated
- [ ] Git tag created and pushed
- [ ] GitHub release created with release notes
- [ ] Prebuilt binaries uploaded to GitHub release
- [ ] Package published to npm
- [ ] Post-release verification completed
- [ ] Release announced to the community
