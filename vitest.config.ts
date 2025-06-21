import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Global setup and teardown
    globalSetup: './test/setup.ts',

    // Test patterns
    include: [
      'test/**/*.test.ts',
      'test/**/*.test.js',
      'src/**/*.test.ts'
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'benchmarks/**',
      'examples/**'
    ],

    // Timeout settings
    testTimeout: 30000,
    hookTimeout: 10000,
    teardownTimeout: 5000,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'test/**',
        'benchmarks/**',
        'examples/**',
        'dist/**',
        'build/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/coverage/**'
      ],
      include: [
        'src/**/*.ts',
        'src/**/*.js'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    },

    // Parallel execution
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        maxThreads: 4,
        minThreads: 1
      }
    },

    // File watching
    watch: false,
    watchExclude: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      'benchmarks/**'
    ],

    // Reporters
    reporters: ['verbose', 'json'],
    outputFile: {
      json: './test-results.json'
    },

    // Test isolation
    isolate: true,

    // Retry configuration
    retry: 2,

    // Performance
    maxConcurrency: 4,

    // Mock configuration
    clearMocks: true,
    restoreMocks: true,

    // Custom matchers and setup
    setupFiles: [
      './test/setup.ts'
    ]
  },

  // Resolve configuration
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
      '@test': resolve(__dirname, './test'),
      '@framework': resolve(__dirname, './src/framework'),
      '@native': resolve(__dirname, './src/native'),
      '@utils': resolve(__dirname, './src/utils')
    }
  },

  // Define configuration
  define: {
    __TEST__: true,
    __VERSION__: JSON.stringify('1.3.0-phase2'),
    __PHASE__: JSON.stringify('Phase 2: Advanced Optimizations')
  },

  // ESBuild configuration
  esbuild: {
    target: 'node18'
  }
});
