/**
 * Worker pool for CPU-intensive tasks
 * Optimized for V8 performance
 */

import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import { EventEmitter } from 'node:events';
import { v8Optimizer } from '../utils/v8-optimizer.js';

/**
 * Worker task
 */
export interface WorkerTask<T = any, _R = any> {
  /**
   * Task ID
   */
  id: string;

  /**
   * Task data
   */
  data: T;

  /**
   * Task type
   */
  type: string;
}

/**
 * Worker result
 */
export interface WorkerResult<R = any> {
  /**
   * Task ID
   */
  taskId: string;

  /**
   * Result data
   */
  data: R;

  /**
   * Error message (if any)
   */
  error?: string;
}

/**
 * Worker pool options
 */
export interface WorkerPoolOptions {
  /**
   * Number of workers
   * @default Number of CPU cores
   */
  numWorkers?: number;

  /**
   * Worker script path
   */
  workerScript: string;

  /**
   * Worker initialization data
   */
  workerData?: any;

  /**
   * Task timeout in milliseconds
   * @default 30000 (30 seconds)
   */
  taskTimeout?: number;
}

/**
 * Worker pool for CPU-intensive tasks
 */
export class WorkerPool extends EventEmitter {
  // Use stable object shapes for V8 optimization
  private workers: Worker[];
  private workerScript: string;
  private workerData: any;
  private taskQueue: WorkerTask[];
  private taskCallbacks: Map<
    string,
    {
      resolve: (result: any) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >;
  private taskTimeout: number;
  private logger: any;
  private isShuttingDown: boolean;

  // Track which workers are busy
  private busyWorkers: Set<Worker>;

  /**
   * Create a new worker pool
   * @param options Worker pool options
   */
  constructor(options: WorkerPoolOptions) {
    super();

    // Get worker count
    const workerCount = options.numWorkers || cpus().length;
    
    // Initialize properties with their final types for V8 hidden class optimization
    this.workers = v8Optimizer.createFastArray<Worker>(workerCount);
    this.workerScript = options.workerScript;
    this.workerData = options.workerData || v8Optimizer.createInlinePropertiesObject({});
    this.taskQueue = v8Optimizer.createFastArray<WorkerTask>(50, 'object');
    this.taskCallbacks = new Map();
    this.taskTimeout = options.taskTimeout || 30000;
    this.logger = new Logger();
    this.isShuttingDown = false;
    this.busyWorkers = new Set<Worker>();

    this.logger.info(`Creating worker pool with ${workerCount} workers`);
    for (let i = 0; i < workerCount; i++) {
      this.addWorker();
    }
  }

  /**
   * Add a worker to the pool
   */
  private addWorker(): void {
    try {
      // Use optimized object for worker initialization
      const workerConfig = v8Optimizer.createInlinePropertiesObject({
        workerData: this.workerData
      });
      
      const worker = new Worker(this.workerScript, workerConfig);

      // Use monomorphic call sites for event handlers
      const messageHandler = v8Optimizer.createMonomorphicCallSite(
        (result: WorkerResult) => {
          this.handleWorkerResult(result);
        },
        ['object']
      );
      
      worker.on('message', messageHandler);

      // Error handler optimized for consistent type patterns
      const errorHandler = v8Optimizer.createMonomorphicCallSite(
        (error: Error) => {
          this.logger.error(`Worker error: ${error.message}`);

          // Remove the worker from the pool
          const index = this.workers.indexOf(worker);
          if (index !== -1) {
            this.workers.splice(index, 1);
          }

          // Add a new worker if not shutting down
          if (!this.isShuttingDown) {
            this.addWorker();
          }
        },
        ['object']
      );
      
      worker.on('error', errorHandler);

      // Exit handler optimized for consistent type patterns
      const exitHandler = v8Optimizer.createMonomorphicCallSite(
        (code: number) => {
          this.logger.info(`Worker exited with code ${code}`);

          // Remove the worker from the pool
          const index = this.workers.indexOf(worker);
          if (index !== -1) {
            this.workers.splice(index, 1);
          }

          // Add a new worker if not shutting down
          if (!this.isShuttingDown) {
            this.addWorker();
          }
        },
        ['number']
      );
      
      worker.on('exit', exitHandler);

      this.workers.push(worker);

      // Process any pending tasks
      this.processPendingTasks();
    } catch (error) {
      this.logger.error(`Failed to create worker: ${(error as Error).message}`);
    }
  }

  /**
   * Handle a worker result
   * @param result The worker result
   */
  private handleWorkerResult(result: WorkerResult): void {
    // Use monomorphic property access pattern
    const taskId = result.taskId;
    const callback = this.taskCallbacks.get(taskId);

    if (!callback) {
      this.logger.warn(`Received result for unknown task: ${taskId}`);
      return;
    }

    // Clear the timeout with consistent call pattern
    clearTimeout(callback.timer);

    // Remove the callback
    this.taskCallbacks.delete(taskId);

    // Create stable property access patterns for V8 optimization
    const error = result.error;
    const data = result.data;
    const reject = callback.reject;
    const resolve = callback.resolve;

    // Handle the result with consistent branching patterns
    if (error) {
      reject(new Error(error));
    } else {
      resolve(data);
    }

    // Process any pending tasks
    this.processPendingTasks();
  }

  /**
   * Process pending tasks
   */
  private processPendingTasks(): void {
    // Pre-check for common early-return conditions using consistent type patterns
    if (!this.workers.length || !this.taskQueue.length) {
      return;
    }
    
    // Find an available worker with optimized iteration
    let availableWorker: Worker | undefined = undefined;
    for (let i = 0; i < this.workers.length; i++) {
      const worker = this.workers[i];
      if (!this.busyWorkers.has(worker)) {
        availableWorker = worker;
        break;
      }
    }

    // Early return if no worker is available
    if (!availableWorker) {
      return;
    }

    // Get the next task with consistent access pattern
    const task = this.taskQueue.shift();

    // Re-validate task exists (should always be true at this point but maintains type safety)
    if (!task) {
      return;
    }

    // Mark worker as busy - must happen before sending message for proper state tracking
    this.busyWorkers.add(availableWorker);

    // Create a stable optimized message handler with monomorphic calls
    const messageHandler = v8Optimizer.createMonomorphicCallSite(
      (result: WorkerResult): void => {
        // Use direct property access rather than destructuring for V8 optimization
        const resultTaskId = result.taskId;
        const taskId = task.id;
        
        if (resultTaskId === taskId) {
          // Mark worker as available - maintain consistent object shapes
          this.busyWorkers.delete(availableWorker!);
          availableWorker!.removeListener('message', messageHandler);

          // Process next task asynchronously but with consistent timing
          // Use monomorphic function call
          const scheduleNext = (): void => { this.processPendingTasks(); };
          setTimeout(scheduleNext, 0);
        }
      },
      ['object']
    );

    // Attach the handler first for proper event ordering
    availableWorker.on('message', messageHandler);
    
    // Send the task to the worker after handler is attached
    availableWorker.postMessage(task);
  }

  /**
   * Execute a task on a worker
   * @param type The task type
   * @param data The task data
   */
  async executeTask<T = any, R = any>(type: string, data: T): Promise<R> {
    // Use stable promise creation pattern for V8 optimization
    return new Promise<R>((resolve, reject) => {
      // Create a task ID with consistent string pattern
      const timestamp = Date.now().toString();
      const randomPart = Math.random().toString(36).substr(2, 9);
      const taskId = `${timestamp}-${randomPart}`;

      // Create a task using optimized object creation
      const task = v8Optimizer.createInlinePropertiesObject<WorkerTask<T>>({ 
        id: taskId,
        type,
        data
      });

      // Create a timeout handler with consistent function shape
      const timeoutHandler = v8Optimizer.createMonomorphicCallSite(() => {
        // Remove the callback with consistent access pattern
        this.taskCallbacks.delete(taskId);

        // Create error message once for reuse
        const timeoutMs = this.taskTimeout;
        const errorMessage = `Task ${taskId} timed out after ${timeoutMs}ms`;
        
        // Reject the promise with consistent error object pattern
        reject(new Error(errorMessage));
      });
      
      // Create a timeout with consistent timing pattern
      const timer = setTimeout(timeoutHandler, this.taskTimeout);

      // Create a stable callback object for V8 hidden class optimization
      const callbackObj = v8Optimizer.createInlinePropertiesObject({
        resolve,
        reject,
        timer
      });

      // Store the callback with stable Map access pattern
      this.taskCallbacks.set(taskId, callbackObj);

      // Add the task to the queue with consistent array method
      this.taskQueue.push(task);

      // Process pending tasks immediately after queue modification
      this.processPendingTasks();
    });
  }

  /**
   * Shutdown the worker pool
   */
  async shutdown(): Promise<void> {
    // Set shutdown flag with consistent property access
    this.isShuttingDown = true;

    // Use a pre-allocated array for better performance
    const workerCount = this.workers.length;
    const terminationPromises = v8Optimizer.createFastArray<Promise<any>>(workerCount, 'object');
    
    // Terminate all workers with consistent iteration pattern
    for (let i = 0; i < workerCount; i++) {
      const worker = this.workers[i];
      terminationPromises[i] = worker.terminate();
    }

    // Wait for all workers to terminate with stable promise handling
    await Promise.all(terminationPromises);

    // Clear the task queue with stable object type
    this.taskQueue = v8Optimizer.createFastArray<WorkerTask>(0, 'object');

    // Create error message once for reuse
    const shutdownError = new Error('Worker pool is shutting down');
    
    // Reject all pending tasks using the Map iterator
    // Using Array.from to create a stable iteration pattern
    const entries = Array.from(this.taskCallbacks.entries());
    for (let i = 0; i < entries.length; i++) {
      const [taskId, callback] = entries[i];
      clearTimeout(callback.timer);
      callback.reject(shutdownError);
      this.taskCallbacks.delete(taskId);
    }

    this.logger.info('Worker pool shutdown complete');
  }
}
