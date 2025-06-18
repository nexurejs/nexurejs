/**
 * Worker script for the AdaptiveWorkerPool
 *
 * This script handles task execution in a worker thread.
 * Optimized for V8 performance.
 */

import { parentPort, workerData } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
// Import V8 optimizer utilities - use a safe dynamic import approach to avoid circular dependencies
let v8Optimizer: any;

// Use Function constructor to avoid ESLint require() warnings while maintaining dynamic loading
try {
  // This approach allows dynamic loading while complying with lint rules
  const importV8 = new Function('return import("../utils/v8-optimizer.js")');
  importV8().then((module: any) => {
    v8Optimizer = module.v8Optimizer;
  }).catch((_err: any) => {
    // Fallback implementation if main optimizer isn't available
    v8Optimizer = {
      createInlinePropertiesObject: <T>(obj: T): T => ({ ...obj }),
      createMonomorphicCallSite: <T extends Function>(fn: T): T => fn
    };
  });
} catch (_err) {
  // Immediate fallback implementation if dynamic import fails
  v8Optimizer = {
    createInlinePropertiesObject: <T>(obj: T): T => ({ ...obj }),
    createMonomorphicCallSite: <T extends Function>(fn: T): T => fn
  };
}

// Define types for messages and tasks
interface WorkerData {
  id: number;
}

interface TaskMessage {
  type: 'task';
  taskId: string;
  data: TaskData;
}

interface TerminateMessage {
  type: 'terminate';
}

type WorkerMessage = TaskMessage | TerminateMessage;

interface TaskData {
  type: 'fibonacci' | 'sleep' | 'mixed';
  data: number | number[] | any;
}

interface ResultMetrics {
  executionTime: number;
  cpuUsage: number;
  memoryUsage: number;
  workerId: number;
  wasStolen: boolean;
}

interface ResultMessage {
  type: 'result';
  taskId: string;
  result: any;
  metrics: ResultMetrics;
}

interface ErrorMessage {
  type: 'error';
  taskId: string | null;
  error: string;
}

interface ReadyMessage {
  type: 'ready';
  workerId: number;
}

// Initialize worker
const workerId = (workerData as WorkerData).id || 0;

// Send ready message to parent with optimized object creation
const readyMessage = v8Optimizer?.createInlinePropertiesObject({
  type: 'ready',
  workerId
}) || { type: 'ready', workerId };

parentPort!.postMessage(readyMessage as ReadyMessage);

// Create optimized message handler function that provides consistent shape for V8 optimization
const handleMessage = v8Optimizer?.createMonomorphicCallSite(
  async (message: WorkerMessage) => {
    // Early validation with consistent type checking
    if (typeof message !== 'object') {
      return sendError('Invalid message format');
    }

    // Use direct property access for better V8 optimization
    const messageType = message.type;

    // Use if/else instead of switch for more predictable V8 optimization
    if (messageType === 'task') {
      // Use direct property access for stable hidden class patterns
      const taskMessage = message as TaskMessage;
      const taskId = taskMessage.taskId;
      const taskData = taskMessage.data;

      try {
        // Start measuring performance with consistent method calls
        const startTime = performance.now();
        const startCpuUsage = process.cpuUsage();
        const startMemUsage = process.memoryUsage();

        // Consistent type checking pattern
        const taskType = taskData.type;
        let result;

        // Use if/else instead of switch for better branch prediction
        if (taskType === 'fibonacci') {
          // Direct numeric cast for consistent type handling
          const n = Number(taskData.data);
          result = fibonacci(n);
        }
        else if (taskType === 'sleep') {
          // Direct numeric cast for consistent type handling
          const ms = Number(taskData.data);
          result = await sleep(ms);
        }
        else if (taskType === 'mixed') {
          // Use stable array access pattern
          const mixedData = taskData.data as number[];

          // Consistent validation pattern
          if (Array.isArray(mixedData) &&
              mixedData.length >= 2 &&
              typeof mixedData[0] === 'number' &&
              typeof mixedData[1] === 'number') {
            // Direct property access for consistent types
            const cpuIntensity = mixedData[0];
            const ioTime = mixedData[1];
            result = await mixedWorkload(cpuIntensity, ioTime);
          } else {
            throw new Error('Invalid mixed workload data');
          }
        }
        else {
          // Stable error creation pattern
          throw new Error(`Unknown task type: ${taskType}`);
        }

        // Calculate metrics
        const endTime = performance.now();
        const cpuUsage = process.cpuUsage(startCpuUsage);
        const memUsage = process.memoryUsage();

        // Create optimized result metrics object
        const metrics = v8Optimizer?.createInlinePropertiesObject({
          executionTime: endTime - startTime,
          cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000,
          memoryUsage: memUsage.heapUsed - startMemUsage.heapUsed,
          workerId,
          wasStolen: false
        }) || {
          executionTime: endTime - startTime,
          cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000,
          memoryUsage: memUsage.heapUsed - startMemUsage.heapUsed,
          workerId,
          wasStolen: false
        };

        // Create optimized result message object
        const resultMessage = v8Optimizer?.createInlinePropertiesObject({
          type: 'result',
          taskId,
          result,
          metrics
        }) || {
          type: 'result',
          taskId,
          result,
          metrics
        };

        // Send result back to parent
        parentPort!.postMessage(resultMessage as ResultMessage);
      } catch (error) {
        sendError((error as Error).message, taskId);
      }
    }
    else if (messageType === 'terminate') {
      // Clean up and exit
      process.exit(0);
    }
  },
  ['object']
) || (async (message: WorkerMessage) => {
  // Fallback implementation if v8Optimizer is not available
  if (typeof message !== 'object') {
    return sendError('Invalid message format');
  }

  switch (message.type) {
    case 'task': {
      const { taskId, data } = message;

      try {
        // Start measuring performance
        const startTime = performance.now();
        const startCpuUsage = process.cpuUsage();
        const startMemUsage = process.memoryUsage();

        // Execute the task based on its type
        let result;
        switch (data.type) {
          case 'fibonacci':
            result = fibonacci(data.data as number);
            break;
          case 'sleep':
            result = await sleep(data.data as number);
            break;
          case 'mixed':
            const mixedData = data.data as number[];
            if (
              mixedData.length >= 2 &&
              typeof mixedData[0] === 'number' &&
              typeof mixedData[1] === 'number'
            ) {
              result = await mixedWorkload(mixedData[0], mixedData[1]);
            } else {
              throw new Error('Invalid mixed workload data');
            }
            break;
          default:
            throw new Error(`Unknown task type: ${(data as any).type}`);
        }

        // Calculate metrics
        const endTime = performance.now();
        const cpuUsage = process.cpuUsage(startCpuUsage);
        const memUsage = process.memoryUsage();

        // Send result back to parent
        parentPort!.postMessage({
          type: 'result',
          taskId,
          result,
          metrics: {
            executionTime: endTime - startTime,
            cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000,
            memoryUsage: memUsage.heapUsed - startMemUsage.heapUsed,
            workerId,
            wasStolen: false
          }
        } as ResultMessage);
      } catch (error) {
        sendError((error as Error).message, taskId);
      }
      break;
    }
    case 'terminate':
      // Clean up and exit
      process.exit(0);
  }
});

// Attach the optimized message handler
parentPort!.on('message', handleMessage);

// Helper function to send error messages
function sendError(errorMessage: string, taskId: string | null = null): void {
  parentPort!.postMessage({
    type: 'error',
    taskId,
    error: errorMessage
  } as ErrorMessage);
}

// Task implementations

// Fibonacci calculation (CPU-intensive)
function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

// Sleep function (IO-bound)
function sleep(ms: number): Promise<number> {
  return new Promise(resolve => setTimeout(() => resolve(ms), ms));
}

// Mixed workload
async function mixedWorkload(cpuIntensity: number, ioTime: number): Promise<number> {
  // CPU work
  const fibResult = fibonacci(cpuIntensity);

  // IO work
  await sleep(ioTime);

  return fibResult;
}
