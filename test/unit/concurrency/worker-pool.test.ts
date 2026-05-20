/**
 * Tests for the WorkerPool: task execution across worker threads.
 */

import { describe, test, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { WorkerPool } from '../../../src/concurrency/worker-pool.js';

const workerScript = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../fixtures/echo-worker.mjs'
);

describe('WorkerPool', () => {
  test('executes a task on a worker and resolves with the result', async () => {
    const pool = new WorkerPool({ workerScript, numWorkers: 2 });
    try {
      const result = await pool.executeTask('echo', { value: 42 });
      expect(result).toEqual({ value: 42 });
    } finally {
      await pool.shutdown();
    }
  });

  test('executes multiple queued tasks', async () => {
    const pool = new WorkerPool({ workerScript, numWorkers: 2 });
    try {
      const results = await Promise.all([
        pool.executeTask('echo', { n: 1 }),
        pool.executeTask('echo', { n: 2 }),
        pool.executeTask('echo', { n: 3 })
      ]);
      expect(results).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
    } finally {
      await pool.shutdown();
    }
  });
});
