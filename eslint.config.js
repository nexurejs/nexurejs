/**
 * ESLint configuration for NexureJS
 *
 * This configuration extends the recommended TypeScript rules with additional
 * stricter rules for the src directory and legacy code.
**/

export default [
  {
    ignores: [
      'simple-server.ts',
      'dist/**',
      'node_modules/**',
      '**/*.d.ts',
      'examples/**',
      'benchmarks/**',
      // Quarantined from tsconfig (incomplete rewrite) — see CLAUDE.md
      'src/framework/**',
      'test/comprehensive/framework.test.ts',
      // Config files are not part of the typed source project
      '**/*.config.ts'
    ]
  },

  // Apply TypeScript recommended rules
  ...await (async () => {
    const ts = await import('@typescript-eslint/eslint-plugin');
    const tsParser = await import('@typescript-eslint/parser');

    return [{
      files: ['**/*.ts', '**/*.tsx'],
      languageOptions: {
        parser: tsParser.default,
        parserOptions: {
          ecmaVersion: 'latest',
          sourceType: 'module',
          ecmaFeatures: {
            jsx: true
          },
          project: './tsconfig.json'
        },
        globals: {
          // Node.js global variables
          process: 'readonly',
          console: 'readonly',
          module: 'readonly',
          require: 'readonly',
          __dirname: 'readonly',
          __filename: 'readonly',
          exports: 'writable',
          Buffer: 'readonly',
          setTimeout: 'readonly',
          clearTimeout: 'readonly',
          setInterval: 'readonly',
          clearInterval: 'readonly',
          // Testing globals
          jest: 'readonly',
          describe: 'readonly',
          it: 'readonly',
          expect: 'readonly',
          beforeEach: 'readonly',
          afterEach: 'readonly'
        }
      },
      plugins: {
        '@typescript-eslint': ts.default,
      },

      // Base configuration - less strict (recommended for getting started)
      rules: {
        // Basic recommended rules
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': ['warn', {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }],
        'no-console': 'off',
        '@typescript-eslint/no-empty-interface': 'warn',
        '@typescript-eslint/no-empty-object-type': 'warn',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-non-null-asserted-optional-chain': 'warn',
        '@typescript-eslint/no-require-imports': 'warn',
        '@typescript-eslint/ban-ts-comment': ['warn', {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': false,
          'ts-nocheck': false,
          'minimumDescriptionLength': 10
        }],
        'prefer-const': 'warn',
        'no-unused-expressions': 'warn',
        'no-duplicate-imports': 'warn',
        // Disable the rule requiring extensions in imports
        '@typescript-eslint/extension-require-in-import-files': 'off',
        '@typescript-eslint/consistent-type-imports': 'off',
        'import/extensions': 'off'
      }
    },

    // Strict configuration - applied to src directory
    {
      files: ['src/**/*.ts'],
      name: 'nexurejs:strict',
      rules: {
        // All the rules from recommended config, plus these stricter rules
        '@typescript-eslint/explicit-function-return-type': 'warn',
        '@typescript-eslint/no-unnecessary-condition': 'warn',
        'no-implicit-coercion': 'warn',
        'prefer-template': 'warn',
        'no-nested-ternary': 'warn',
        'complexity': ['warn', { max: 20 }],
        'max-depth': ['warn', { max: 4 }],
        'max-lines-per-function': ['warn', { max: 200 }],
        '@typescript-eslint/extension-require-in-import-files': 'off',
        '@typescript-eslint/consistent-type-imports': 'off',
        'import/extensions': 'off'
      }
    },

    // Legacy code configuration - more lenient
    {
      files: ['legacy/**/*.ts'],
      name: 'nexurejs:legacy',
      rules: {
        // Disable most strict rules for legacy code
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/strict-boolean-expressions': 'off',
        'no-console': 'off',
        '@typescript-eslint/naming-convention': 'off'
      }
    }];
  })(),

  // Linter options
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error'
    }
  }
];
