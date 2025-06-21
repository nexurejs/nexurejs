 # Contributing to NexureJS

Thank you for considering contributing to NexureJS! This document outlines the process and guidelines for contributing to the project.

## Ways to Contribute

There are many ways to contribute to NexureJS, even if you're not ready to write code:

1. **Report Issues**: Report bugs, suggest features, or ask questions
2. **Improve Documentation**: Fix typos, clarify explanations, add examples
3. **Write Code**: Implement new features or fix bugs
4. **Review Pull Requests**: Help review and test others' contributions
5. **Share Knowledge**: Write blog posts, create tutorials, or answer questions in discussions

## Issue Reporting Guidelines

### Reporting Bugs

- **Search First**: Check if the bug has already been reported in the [Issues](https://github.com/nexurejs/nexurejs/issues)
- **Use the Bug Report Template**: When creating a new issue, use the bug report template
- **Be Specific**: Include a clear title and detailed description
- **Reproduction Steps**: List step-by-step instructions to reproduce the issue
- **Expected vs. Actual Behavior**: Clearly state what you expected and what actually happened
- **System Information**: Include Node.js version, OS, and relevant environment details
- **Code Samples**: Provide minimal code examples that demonstrate the issue
- **Error Messages**: Include complete error messages and stack traces
- **Screenshots/Recordings**: If applicable, add visual evidence of the issue

### Suggesting Features

- **Search First**: Check if the feature has already been suggested
- **Use the Feature Request Template**: When creating a new issue, use the feature request template
- **Be Specific**: Clearly describe the feature and its purpose
- **Use Cases**: Explain why this feature would benefit NexureJS users
- **Implementation Ideas**: If you have ideas on how to implement the feature, share them
- **Examples**: Provide examples of how the feature might work or be used

## Pull Request Guidelines

### Before Creating a Pull Request

1. **Discuss Changes**: For significant changes, open an issue first to discuss the approach
2. **Check Roadmap**: Align your contribution with the [project roadmap](ROADMAP.md)
3. **Review Feature Planning**: For feature implementations, review the [feature planning document](FEATURE_PLANNING.md)

### Creating a Pull Request

1. **Fork and Clone**: Fork the repository and clone it locally
2. **Create a Branch**: Create a branch with a descriptive name (e.g., `fix-http-parser`, `add-graphql-support`)
3. **Make Focused Changes**: Keep changes focused on a single issue or feature
4. **Follow Code Standards**: Adhere to the project's coding style and conventions
5. **Write Tests**: Add tests for new features and ensure existing tests pass
6. **Update Documentation**: Update relevant documentation to reflect your changes
7. **Use Conventional Commits**: Follow the commit message guidelines
8. **Submit PR**: Submit a pull request with a clear description of the changes

### Pull Request Template

Your pull request should include:

- **Related Issue**: Link to any related issues (`Fixes #123` or `Relates to #123`)
- **Description**: Clear description of the changes made
- **Type of Change**: Indicate if it's a bug fix, new feature, performance improvement, etc.
- **Testing**: Describe how you tested the changes
- **Checklist**: Confirm that code standards are met, tests pass, etc.

## Development Environment Setup

### Prerequisites

- Node.js 18.0.0 or later
- npm 8.0.0 or later
- For native modules:
  - C++ compiler (GCC, Clang, or MSVC)
  - Python 2.7 or 3.x
  - node-gyp

### Platform-Specific Requirements

**Windows:**
- Visual Studio Build Tools
- Windows-build-tools: `npm install --global --production windows-build-tools`

**macOS:**
- Xcode Command Line Tools: `xcode-select --install`

**Linux:**
- Build essential: `sudo apt-get install build-essential`
- Python 3: `sudo apt-get install python3`

### Setup Steps

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/nexurejs/nexurejs.git
   cd nexurejs
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Build the Project**:
   ```bash
   npm run build
   ```

4. **Run Tests**:
   ```bash
   npm test
   ```

### Building Native Modules

To build the native modules:

```bash
npm run build:native
```

For development and testing:

```bash
npm run build:native:test
```

To build for specific platforms:

```bash
npm run build:native:linux
npm run build:native:macos
npm run build:native:windows
```

## Code Style and Quality

### Coding Standards

- TypeScript is preferred for new code
- Follow the existing code style (enforced by ESLint and Prettier)
- Keep functions small and focused on a single responsibility
- Use meaningful variable and function names
- Add comments for complex logic, but prefer self-explanatory code
- Optimize for performance where appropriate, with benchmarks to prove improvements

### Testing Requirements

- Write unit tests for all new features and bug fixes
- Ensure all tests pass before submitting a pull request
- Include integration tests for complex features
- Add performance benchmarks for performance-critical code

### Documentation

- Update relevant documentation to reflect your changes
- Add JSDoc comments to public APIs
- Include examples for new features
- Keep the API documentation up to date

## Commit Message Guidelines

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Changes that do not affect the meaning of the code
- `refactor`: Code changes that neither fix a bug nor add a feature
- `perf`: Performance improvements
- `test`: Adding or fixing tests
- `chore`: Changes to the build process or auxiliary tools
- `ci`: Changes to CI configuration files and scripts
- `build`: Changes that affect the build system

Format:
```
<type>(<scope>): <subject>

<body>

<footer>
```

Examples:
```
feat(router): add support for named parameters

Add the ability to define named parameters in route paths, making it easier
to extract values from URLs.

Closes #123
```

```
fix(http): resolve memory leak in response object

The response object wasn't being properly released after completion, leading
to memory leaks under high load.

Fixes #456
```

## Review Process

All pull requests go through the following review process:

1. **Automated Checks**: CI runs tests, lints code, and checks formatting
2. **Code Review**: At least one maintainer reviews the code
3. **Performance Review**: For performance-critical changes, benchmarks are evaluated
4. **Final Approval**: A maintainer approves and merges the changes

## Becoming a Maintainer

Regular contributors who have demonstrated expertise and commitment to the project may be invited to become maintainers. Maintainers have additional permissions and responsibilities, including:

- Reviewing and merging pull requests
- Triaging issues
- Planning releases
- Guiding the project's direction

If you're interested in becoming a maintainer, start by making consistent, high-quality contributions.

## Release Process

NexureJS follows [Semantic Versioning](https://semver.org/) for releases. See the detailed [Release Documentation](./releasing.md) for the complete process.

## Getting Help

If you need help with contributing:

- Join our [Discord community](https://discord.gg/nexurejs)
- Ask questions in GitHub Discussions
- Reach out to the maintainers

## License

By contributing to NexureJS, you agree that your contributions will be licensed under the project's [MIT License](../LICENSE).

---

Thank you for contributing to NexureJS! Your efforts help make the framework better for everyone.
