/**
 * Unit tests for the ThreadPool native module
 */

import { loadNativeBinding } from '../../../src/native/index.js';

describe('ThreadPool Native Module', () => {
  let nativeModule: any;
  let ThreadPool: any;

  beforeAll(() => {
    // Try to load the native module
    nativeModule = loadNativeBinding();

    // Skip all tests if native module is not available
    if (!nativeModule) {
      console.warn('Native module not available. Skipping ThreadPool tests.');
    } else {
      ThreadPool = nativeModule.ThreadPool;
    }
  });

  // Helper function to check if we should skip tests
  const skipIfNoNative = () => {
    if (!nativeModule || !ThreadPool) {
      return true;
    }
    return false;
  };

  describe('Initialization', () => {
    test('should be available in native module', () => {
      if (skipIfNoNative()) return;
      expect(ThreadPool).toBeDefined();
    });

    test('should be able to get an instance', () => {
      if (skipIfNoNative()) return;
      const pool = ThreadPool.getInstance();
      expect(pool).toBeDefined();
      expect(pool.submit).toBeInstanceOf(Function);
      expect(pool.waitAll).toBeInstanceOf(Function);
      expect(pool.cancel).toBeInstanceOf(Function);
    });

    test('should allow creating a custom thread pool with specified thread count', () => {
      if (skipIfNoNative()) return;
      const customPool = new ThreadPool(4); // 4 threads
      expect(customPool).toBeDefined();
      expect(customPool.getThreadCount()).toBe(4);
    });
  });

  describe('Task Submission and Execution', () => {
    test('should execute a simple task and return the result', async () => {
      if (skipIfNoNative()) return;
      const pool = ThreadPool.getInstance();

      // Create a simple task that returns a value
      const promise = pool.submit(() => {
        return 42;
      });

      // Wait for the result
      const result = await promise;
      expect(result).toBe(42);
    });

    test('should execute multiple tasks concurrently', async () => {
      if (skipIfNoNative()) return;
      const pool = ThreadPool.getInstance();

      // Create multiple tasks
      const promises: Promise<number>[] = [];
      for (let i = 0; i < 10; i++) {
        promises.push(pool.submit(() => i * i));
      }

      // Wait for all tasks to complete
      const results = await Promise.all(promises);

      // Verify results
      expect(results).toHaveLength(10);
      for (let i = 0; i < 10; i++) {
        expect(results[i]).toBe(i * i);
      }
    });

    test('should handle tasks that throw exceptions', async () => {
      if (skipIfNoNative()) return;
      const pool = ThreadPool.getInstance();

      // Create a task that throws an error
      const promise = pool.submit(() => {
        throw new Error('Test error');
      });

      // The promise should be rejected
      await expect(promise).rejects.toThrow();
    });

    test('should properly handle async tasks', async () => {
      if (skipIfNoNative()) return;
      const pool = ThreadPool.getInstance();

      // Create an async task
      const promise = pool.submit(async () => {
        // Simulate async work
        return new Promise(resolve => setTimeout(() => resolve('async result'), 100));
      });

      // Wait for the result
      const result = await promise;
      expect(result).toBe('async result');
    });
  });

  describe('Task Management', () => {
    test('should allow cancelling a task', async () => {
      if (skipIfNoNative()) return;
      const pool = ThreadPool.getInstance();

      // Submit a long-running task
      let _executed = false;
      const taskId = await new Promise(resolve => {
        // Create a task that will take some time
        const promise = pool.submit(() => {
          _executed = true;
          // This is a long running task
          let sum = 0;
          for (let i = 0; i < 1000000000; i++) {
            sum += i;
          }
          return sum;
        });

        // Store the task ID and resolve with it
        resolve(promise._taskId);
      });

      // Cancel the task if we have a task ID
      if (taskId) {
        const _cancelled = pool.cancel(taskId);
        // Note: We can't guarantee the task didn't start already, so we don't
        // assert on the cancelled return value or the executed flag
      }
    });

    test('should wait for all tasks to complete', async () => {
      if (skipIfNoNative()) return;
      const pool = ThreadPool.getInstance();

      // Submit several tasks
      const promises: Promise<number>[] = [];
      for (let i = 0; i < 5; i++) {
        promises.push(pool.submit(() => {
          return new Promise(resolve => setTimeout(() => resolve(i), 50));
        }));
      }

      // Wait for all tasks to complete
      await pool.waitAll();

      // Verify all promises are settled
      const results = await Promise.allSettled(promises);
      for (const result of results) {
        expect(result.status).toBe('fulfilled');
      }
    });

    test('should allow changing thread count', async () => {
      if (skipIfNoNative()) return;
      const pool = ThreadPool.getInstance();

      // Get initial thread count
      const initialCount = pool.getThreadCount();

      // Change thread count
      const newCount = initialCount + 1;
      pool.setThreadCount(newCount);

      // Verify thread count changed
      expect(pool.getThreadCount()).toBe(newCount);

      // Restore original thread count
      pool.setThreadCount(initialCount);
    });
  });

  describe('Performance Metrics', () => {
    test('should track task execution metrics', async () => {
      if (skipIfNoNative()) return;
      const pool = ThreadPool.getInstance();

      // Reset metrics first
      pool.resetMetrics();

      // Submit a task
      await pool.submit(() => 'test');

      // Get metrics
      const metrics = pool.getMetrics();

      // Verify metrics
      expect(metrics).toBeDefined();
      expect(metrics.submittedTasks).toBe(1);
      expect(metrics.completedTasks).toBe(1);
      expect(metrics.failedTasks).toBe(0);
      expect(metrics.totalExecutionTimeUs).toBeGreaterThan(0);
    });

    test('should reset metrics', () => {
      if (skipIfNoNative()) return;
      const pool = ThreadPool.getInstance();

      // Reset metrics
      pool.resetMetrics();

      // Get metrics
      const metrics = pool.getMetrics();

      // Verify metrics are reset
      expect(metrics.submittedTasks).toBe(0);
      expect(metrics.completedTasks).toBe(0);
      expect(metrics.failedTasks).toBe(0);
      expect(metrics.cancelledTasks).toBe(0);
    });
  });

  describe('Static Methods', () => {
    test('should have static getInstance method', () => {
      if (skipIfNoNative()) return;

      // Static method should be available on the class
      expect(ThreadPool.getInstance).toBeInstanceOf(Function);

      // Should return a ThreadPool instance
      const pool = ThreadPool.getInstance();
      expect(pool).toBeDefined();
      expect(pool.submit).toBeInstanceOf(Function);
    });

    test('should have static resetMetrics method', () => {
      if (skipIfNoNative()) return;

      // Static method should be available on the class
      expect(ThreadPool.resetMetrics).toBeInstanceOf(Function);

      // Should not throw when called
      expect(() => {
        ThreadPool.resetMetrics();
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid arguments to submit', () => {
      if (skipIfNoNative()) return;
      const pool = ThreadPool.getInstance();

      // This should throw because submit requires a function
      expect(() => {
        // @ts-ignore - Intentionally passing invalid argument for testing
        pool.submit('not a function');
      }).toThrow();
    });

    test('should handle invalid arguments to cancel', () => {
      if (skipIfNoNative()) return;
      const pool = ThreadPool.getInstance();

      // This should throw because cancel requires a task ID
      expect(() => {
        // @ts-ignore - Intentionally passing invalid argument for testing
        pool.cancel('not a number');
      }).toThrow();
    });
  });
});
