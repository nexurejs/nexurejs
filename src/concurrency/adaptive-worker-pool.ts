import { Worker, WorkerOptions } from 'node:worker_threads';
import { cpus } from 'node:os';
import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import { setTimeout, clearTimeout } from 'node:timers';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

// Placeholder Logger and v8Optimizer to make the skeleton self-contained
class Logger {
  constructor(private context: string) {}
  info(message: string, ...args: any[]) { console.log(`[${this.context}] INFO:`, message, ...args); }
  warn(message: string, ...args: any[]) { console.warn(`[${this.context}] WARN:`, message, ...args); }
  error(message: string, ...args: any[]) { console.error(`[${this.context}] ERROR:`, message, ...args); }
  debug(message: string, ...args: any[]) { console.debug(`[${this.context}] DEBUG:`, message, ...args); }
}

const v8Optimizer = {
  optimizeObject: (obj: any) => obj, // Placeholder
  createFastArray: <T>(_size: number, _type: string) => new Array<T>(), // Placeholder
  createInlinePropertiesObject: (obj: any) => obj, // Placeholder
  createMonomorphicCallSite: (fn: Function, _argTypes: string[]) => fn, // Placeholder
};

// --- Interfaces, Enums, Constants ---

export enum TaskPriority {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
}

export interface WorkerTask<TData = any, TResult = any> {
  id?: string;
  data: TData;
  priority?: TaskPriority;
  timeout?: number; // in milliseconds
  createdAt?: number;
  metadata?: Record<string, any>; // For CPU intensity, memory requirement, etc.
  stealable?: boolean; // Whether this task can be stolen by another worker
}

export interface WorkerTaskResult<TResult = any> {
  taskId: string;
  result?: TResult;
  error?: Error;
  workerId: number;
  executionTime: number; // in milliseconds
  queueTime: number; // in milliseconds
}

// Defines the internal representation of a task with all necessary fields populated
type InternalTask<TData, TResult> = Omit<WorkerTask<TData, TResult>, 'id' | 'priority' | 'createdAt' | 'metadata' | 'stealable' | 'timeout'> & {
  id: string;
  data: TData; // Retains TData from WorkerTask
  priority: TaskPriority;
  timeout: number | undefined; // Explicitly allow undefined, unlike Required<WorkerTask>
  createdAt: number;
  metadata: Record<string, any>;
  stealable: boolean;
  // TResult is implicitly part of the context via WorkerPool<TData, TResult>
};

interface TaskWithControls<TData, TResult> {
  task: InternalTask<TData, TResult>; // Use the more precise InternalTask type
  resolve: (value: WorkerTaskResult<TResult> | PromiseLike<WorkerTaskResult<TResult>>) => void;
  reject: (reason?: any) => void;
  timeoutId?: NodeJS.Timeout;
  addedToQueueAt?: number;
}

interface WorkerInfo {
  id: number;
  worker: Worker;
  status: 'idle' | 'busy' | 'terminating' | 'error'; // Added 'error' status
  currentTaskId?: string;
  lastTaskFinishedAt: number;
  tasksProcessed: number;
  totalExecutionTime: number;
  startedAt: number;
}

export interface WorkerPoolOptions {
  workerScript: string;
  minWorkers?: number;
  maxWorkers?: number;
  startWorkers?: boolean; // Whether to start minWorkers on initialization
  maxIdleTime?: number; // Max time a worker can be idle before being considered for termination (ms)
  checkInterval?: number; // How often to check for scaling opportunities (ms)
  scaleUpThreshold?: number; // CPU/Queue utilization threshold to scale up (0-1)
  scaleDownThreshold?: number; // CPU/Queue utilization threshold to scale down (0-1)
  taskQueueSize?: number; // Max size of the task queue before backpressure
  workerOptions?: WorkerOptions; // Options passed directly to Node.js Worker constructor
  advancedOptions?: AdvancedScalingOptions;
}

export interface AdvancedScalingOptions {
  predictiveScaling?: boolean; // Enable predictive scaling based on task patterns
  patternHistorySize?: number; // How many past task patterns to consider for prediction
  utilizationSmoothingFactor?: number; // Factor for smoothing utilization metrics (0-1, lower is smoother)
  scaleUpAggressiveness?: number; // Multiplier for how many workers to add during scale-up
  scaleDownCaution?: number; // Factor to reduce workers during scale-down (0-1, lower is more cautious)
  metricHistorySize?: number; // How many data points to keep for historical metrics
  throughputMeasurementInterval?: number; // Interval to measure task throughput (ms)
  scalingCooldown?: number; // Minimum time between scaling actions (ms)
  highPriorityQueueThreshold?: number; // Number of high priority tasks to trigger immediate worker creation
}

export interface PoolStats {
  activeWorkers: number;
  idleWorkers: number;
  totalWorkers: number;
  pendingTasks: number;
  highPriorityPendingTasks: number;
  tasksProcessedTotal: number;
  tasksFailedTotal: number;
  averageTaskExecutionTime: number;
  averageTaskQueueTime: number;
  currentCpuUtilization?: number; // System-wide or per-worker average
  currentMemoryUtilization?: number; // System-wide or per-worker average
  currentThroughput: number; // Tasks per second
  scalingActions: number;
}

export interface WorkerPool<TData = any, TResult = any> extends EventEmitter {
  execute(task: WorkerTask<TData, TResult>): Promise<WorkerTaskResult<TResult>>;
  executeAll(tasks: WorkerTask<TData, TResult>[]): Promise<WorkerTaskResult<TResult>[]>;
  shutdown(): Promise<void>;
  getStats(): PoolStats;
  on<K extends keyof WorkerPoolEvents>(event: K, listener: WorkerPoolEvents[K]): this;
  once<K extends keyof WorkerPoolEvents>(event: K, listener: WorkerPoolEvents[K]): this;
  emit<K extends keyof WorkerPoolEvents>(event: K, ...args: Parameters<WorkerPoolEvents[K]>): boolean;
}

export interface WorkerPoolEvents {
  'task:queued': (task: Required<WorkerTask<any, any>>) => void;
  'task:scheduled': (taskId: string, workerId: number) => void;
  'task:completed': (result: WorkerTaskResult<any>) => void;
  'task:failed': (taskId: string, workerId: number, error: Error) => void;
  'task:timeout': (taskId: string) => void;
  'worker:created': (workerId: number) => void;
  'worker:ready': (workerId: number) => void;
  'worker:terminated': (workerId: number, reason?: string) => void;
  'worker:error': (workerId: number, error: Error) => void;
  'pool:scaledUp': (newSize: number, reason: string) => void;
  'pool:scaledDown': (newSize: number, reason: string) => void;
  'pool:backpressure': (queueSize: number) => void;
  'pool:resumed': () => void;
  'pool:shutdown': () => void;
  'error': (error: Error) => void;
}

// Default values for options
const DEFAULT_MIN_WORKERS = 1;
const DEFAULT_MAX_WORKERS = cpus().length;
const DEFAULT_START_WORKERS = true;
const DEFAULT_MAX_IDLE_TIME = 60 * 1000; // 60 seconds
const DEFAULT_CHECK_INTERVAL = 5 * 1000; // 5 seconds
const DEFAULT_SCALE_UP_THRESHOLD = 0.75; // 75% utilization
const DEFAULT_SCALE_DOWN_THRESHOLD = 0.25; // 25% utilization
const DEFAULT_TASK_QUEUE_SIZE = Infinity;

// Default values for advanced options
const DEFAULT_ADV_PREDICTIVE_SCALING = false;
const DEFAULT_ADV_PATTERN_HISTORY_SIZE = 100;
const DEFAULT_ADV_UTILIZATION_SMOOTHING_FACTOR = 0.5;
const DEFAULT_ADV_SCALE_UP_AGGRESSIVENESS = 1.5;
const DEFAULT_ADV_SCALE_DOWN_CAUTION = 0.75;
const DEFAULT_ADV_METRIC_HISTORY_SIZE = 200;
const DEFAULT_ADV_THROUGHPUT_MEASUREMENT_INTERVAL = 10 * 1000; // 10 seconds
const DEFAULT_ADV_SCALING_COOLDOWN = 30 * 1000; // 30 seconds
const DEFAULT_ADV_HIGH_PRIORITY_QUEUE_THRESHOLD = 0; // Disabled by default

interface TimestampedMetric {
  timestamp: number;
  value: number;
}

// --- AdaptiveWorkerPool Class ---

export class AdaptiveWorkerPool<TData = any, TResult = any>
  extends EventEmitter
  implements WorkerPool<TData, TResult>
{
  private readonly logger: Logger;
  private readonly options: Required<WorkerPoolOptions>;
  private readonly advancedOptions: Required<AdvancedScalingOptions>;

  private workers: Map<number, WorkerInfo> = new Map();
  private nextWorkerId: number = 1;
  private isShuttingDown: boolean = false;

  private taskQueue: TaskWithControls<TData, TResult>[] = [];
  private highPriorityQueue: TaskWithControls<TData, TResult>[] = [];
  private pendingTasks: Map<string, TaskWithControls<TData, TResult>> = new Map(); // Tasks assigned to workers

  // Metrics for scaling and monitoring
  private utilizationHistory: TimestampedMetric[] = [];
  private throughputHistory: TimestampedMetric[] = [];
  private queueTimeHistory: TimestampedMetric[] = [];
  private lastScalingActionTime: number = 0;
  private monitoringInterval?: NodeJS.Timeout;
  private isCurrentlyScalingUp: boolean = false;
  private isCurrentlyScalingDown: boolean = false;
  private lastCPULoad: { user: number, system: number } = { user: 0, system: 0 };
  private lastCPUTime: number = 0;

  private totalTasksProcessedSinceLastThroughputCalc: number = 0;
  private lastThroughputCalcTime: number = 0;

  private scalingActionsCount: number = 0;


  constructor(options: WorkerPoolOptions) {
    super();
    this.logger = new Logger('AdaptiveWorkerPool');

    const advOpts = options.advancedOptions || {};
    this.advancedOptions = {
      predictiveScaling: advOpts.predictiveScaling ?? DEFAULT_ADV_PREDICTIVE_SCALING,
      patternHistorySize: advOpts.patternHistorySize ?? DEFAULT_ADV_PATTERN_HISTORY_SIZE,
      utilizationSmoothingFactor: advOpts.utilizationSmoothingFactor ?? DEFAULT_ADV_UTILIZATION_SMOOTHING_FACTOR,
      scaleUpAggressiveness: advOpts.scaleUpAggressiveness ?? DEFAULT_ADV_SCALE_UP_AGGRESSIVENESS,
      scaleDownCaution: advOpts.scaleDownCaution ?? DEFAULT_ADV_SCALE_DOWN_CAUTION,
      metricHistorySize: advOpts.metricHistorySize ?? DEFAULT_ADV_METRIC_HISTORY_SIZE,
      throughputMeasurementInterval: advOpts.throughputMeasurementInterval ?? DEFAULT_ADV_THROUGHPUT_MEASUREMENT_INTERVAL,
      scalingCooldown: advOpts.scalingCooldown ?? DEFAULT_ADV_SCALING_COOLDOWN,
      highPriorityQueueThreshold: advOpts.highPriorityQueueThreshold ?? DEFAULT_ADV_HIGH_PRIORITY_QUEUE_THRESHOLD,
    };

    this.options = {
      workerScript: options.workerScript,
      minWorkers: options.minWorkers ?? DEFAULT_MIN_WORKERS,
      maxWorkers: options.maxWorkers ?? DEFAULT_MAX_WORKERS,
      startWorkers: options.startWorkers ?? DEFAULT_START_WORKERS,
      maxIdleTime: options.maxIdleTime ?? DEFAULT_MAX_IDLE_TIME,
      checkInterval: options.checkInterval ?? DEFAULT_CHECK_INTERVAL,
      scaleUpThreshold: options.scaleUpThreshold ?? DEFAULT_SCALE_UP_THRESHOLD,
      scaleDownThreshold: options.scaleDownThreshold ?? DEFAULT_SCALE_DOWN_THRESHOLD,
      taskQueueSize: options.taskQueueSize ?? DEFAULT_TASK_QUEUE_SIZE,
      workerOptions: options.workerOptions || {},
      advancedOptions: this.advancedOptions, // Already processed
    };

    this.validateOptions();
    this.resolveWorkerScript();

    if (this.options.startWorkers) {
      this.initializeWorkers(this.options.minWorkers);
    }
    this.startMonitoring();
    this.lastThroughputCalcTime = Date.now();
    this.logger.info('AdaptiveWorkerPool initialized.', { options: this.options });
  }

  private validateOptions(): void {
    if (!this.options.workerScript) {
      throw new Error('workerScript path is required.');
    }
    if (this.options.minWorkers < 0) {
      throw new Error('minWorkers cannot be negative.');
    }
    if (this.options.maxWorkers < this.options.minWorkers) {
      throw new Error('maxWorkers cannot be less than minWorkers.');
    }
    if (this.options.maxIdleTime <= 0) {
      throw new Error('maxIdleTime must be positive.');
    }
    if (this.options.checkInterval <= 0) {
      throw new Error('checkInterval must be positive.');
    }
    if (this.options.scaleUpThreshold <= 0 || this.options.scaleUpThreshold > 1) {
      throw new Error('scaleUpThreshold must be between 0 (exclusive) and 1 (inclusive).');
    }
    if (this.options.scaleDownThreshold < 0 || this.options.scaleDownThreshold >= 1) {
      throw new Error('scaleDownThreshold must be between 0 (inclusive) and 1 (exclusive).');
    }
    if (this.options.scaleDownThreshold >= this.options.scaleUpThreshold) {
      throw new Error('scaleDownThreshold must be less than scaleUpThreshold.');
    }
    this.logger.debug('Options validated successfully.');
  }

  private resolveWorkerScript(): void {
    if (!path.isAbsolute(this.options.workerScript)) {
      // Attempt to resolve relative to the current working directory or require.main.filename
      const basePath = require.main?.filename ? path.dirname(require.main.filename) : process.cwd();
      const resolvedPath = path.resolve(basePath, this.options.workerScript);
      this.logger.debug(`Resolved relative workerScript '${this.options.workerScript}' to '${resolvedPath}'`);
      this.options.workerScript = resolvedPath;
    }
    // TODO: Add a check to ensure the script file actually exists, though fs.existsSync is sync.
    // Consider an async check during initialization or first worker creation.
  }

  private initializeWorkers(count: number): void {
    this.logger.debug(`Initializing ${count} workers.`);
    for (let i = 0; i < count; i++) {
      if (this.workers.size < this.options.maxWorkers) {
        this.createWorker();
      } else {
        this.logger.warn('Reached maxWorkers limit during initial worker creation.');
        break;
      }
    }
  }

  public async execute(taskData: WorkerTask<TData, TResult>): Promise<WorkerTaskResult<TResult>> {
    this.logger.debug('Received task for execution:', { taskId: taskData.id });
    if (this.isShuttingDown) {
      this.logger.warn('Task submission rejected: pool is shutting down.', { taskId: taskData.id });
      throw new Error('Worker pool is shutting down.');
    }

    const task: InternalTask<TData, TResult> = {
      id: taskData.id || randomUUID(),
      data: taskData.data,
      priority: taskData.priority ?? TaskPriority.MEDIUM,
      timeout: taskData.timeout,
      createdAt: taskData.createdAt || Date.now(),
      metadata: taskData.metadata || {},
      stealable: taskData.stealable ?? true,
    };

    return new Promise<WorkerTaskResult<TResult>>((resolve, reject) => {
      const taskWithControls: TaskWithControls<TData, TResult> = {
        task,
        resolve,
        reject,
        addedToQueueAt: Date.now(),
      };

      if (task.timeout && task.timeout > 0) {
        taskWithControls.timeoutId = setTimeout(() => {
          this.handleTaskTimeout(task.id);
        }, task.timeout);
      }

      this.enqueueTask(taskWithControls);
      this.tryScheduleTasks();
    });
  }

  public async executeAll(tasksData: WorkerTask<TData, TResult>[]): Promise<WorkerTaskResult<TResult>[]> {
    this.logger.debug(`Received ${tasksData.length} tasks for bulk execution.`);
    if (this.isShuttingDown) {
      this.logger.warn('Bulk task submission rejected: pool is shutting down.');
      throw new Error('Worker pool is shutting down.');
    }
    return Promise.all(tasksData.map(task => this.execute(task)));
  }

  public async shutdown(): Promise<void> {
    this.logger.info('Initiating worker pool shutdown.');
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress.');
      return;
    }

    this.isShuttingDown = true;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
      this.logger.debug('Monitoring interval stopped.');
    }

    // Reject all queued tasks
    const shutdownError = new Error('Worker pool is shutting down.');
    [...this.taskQueue, ...this.highPriorityQueue].forEach(twc => {
      if (twc.timeoutId) clearTimeout(twc.timeoutId);
      twc.reject(shutdownError);
    });
    this.taskQueue = [];
    this.highPriorityQueue = [];
    this.logger.debug('All queued tasks rejected.');

    // Gracefully terminate all workers
    const terminationPromises: Promise<void>[] = [];
    this.workers.forEach(workerInfo => {
      const originallyBusy = Boolean(workerInfo.currentTaskId); // Check if worker was busy before marking status
      workerInfo.status = 'terminating'; // Mark for termination

      if (!originallyBusy) { // If not busy (no current task), terminate immediately
         terminationPromises.push(this.terminateWorker(workerInfo.id, 'shutdown'));
      } else {
        // Worker is busy
        this.logger.debug(`Worker ${workerInfo.id} is busy with task ${workerInfo.currentTaskId}, will terminate after completion or timeout.`);
        // Add a promise that resolves when the worker eventually terminates
        terminationPromises.push(new Promise<void>(resolve => {
          const onTerminated = (terminatedWorkerId: number) => {
            if (terminatedWorkerId === workerInfo.id) {
              this.off('worker:terminated', onTerminated as any);
              resolve();
            }
          };
          this.on('worker:terminated', onTerminated as any);
        }));
      }
    });

    this.logger.debug(`Waiting for ${terminationPromises.length} workers to terminate.`);
    await Promise.all(terminationPromises);

    this.workers.clear();
    this.pendingTasks.clear();
    this.emit('pool:shutdown');
    this.logger.info('Worker pool shutdown complete.');
    // Ensure all listeners are removed to prevent memory leaks if the pool instance is kept.
    this.removeAllListeners();
  }

  public getStats(): PoolStats {
    const activeWorkers = this.workers.size;
    const idleWorkers = Array.from(this.workers.values()).filter(w => w.status === 'idle').length;
    const totalTasksProcessed = Array.from(this.workers.values()).reduce((sum, w) => sum + w.tasksProcessed, 0);
    const totalExecutionTime = Array.from(this.workers.values()).reduce((sum, w) => sum + w.totalExecutionTime, 0);

    let totalQueueTime = 0;
    // Note: queueTimeHistory stores individual task queue times. Need to sum them up if that's the intent.
    // For now, let's consider it as an average if we store it that way.
    // This part needs refinement based on how queueTimeHistory is populated.
    if (this.queueTimeHistory.length > 0) {
      totalQueueTime = this.queueTimeHistory.reduce((sum, metric) => sum + metric.value, 0);
    }

    // tasksFailedTotal calculation removed as it was unused and inaccurate.
    // Proper failure tracking will be implemented separately.

    const currentThroughput = this.calculateCurrentThroughput();

    return {
      activeWorkers,
      idleWorkers,
      totalWorkers: activeWorkers, // Same as activeWorkers as Map.size is current workers
      pendingTasks: this.taskQueue.length,
      highPriorityPendingTasks: this.highPriorityQueue.length,
      tasksProcessedTotal: totalTasksProcessed,
      tasksFailedTotal: 0, // Placeholder - needs proper tracking
      averageTaskExecutionTime: totalTasksProcessed > 0 ? totalExecutionTime / totalTasksProcessed : 0,
      averageTaskQueueTime: totalTasksProcessed > 0 ? totalQueueTime / totalTasksProcessed : 0, // Needs correct totalQueueTime
      currentCpuUtilization: this.utilizationHistory.length > 0 ? this.utilizationHistory[this.utilizationHistory.length -1].value : undefined,
      currentMemoryUtilization: undefined, // Placeholder
      currentThroughput: currentThroughput,
      scalingActions: this.scalingActionsCount,
    };
  }

  // --- Private Helper Methods (Stubs for now) ---

  private createWorker(): void {
    if (this.isShuttingDown) {
      this.logger.debug('Cannot create worker: pool is shutting down.');
      return;
    }

    if (this.workers.size >= this.options.maxWorkers) {
      this.logger.warn(`Cannot create new worker: maxWorkers limit of ${this.options.maxWorkers} reached.`);
      return;
    }

    const workerId = this.nextWorkerId++;
    this.logger.info(`Creating worker ${workerId}...`);

    const nodeWorkerOptions: WorkerOptions = {
      ...this.options.workerOptions,
      workerData: {
        ...(this.options.workerOptions.workerData || {}), // Preserve existing workerData if any
        workerId: workerId, // Add our own workerId
      },
    };

    try {
      const actualWorker = new Worker(this.options.workerScript, nodeWorkerOptions);

      const workerInfo: WorkerInfo = {
        id: workerId,
        worker: actualWorker,
        status: 'idle', // Initial status, will be confirmed by 'online'
        currentTaskId: undefined,
        lastTaskFinishedAt: 0,
        tasksProcessed: 0,
        totalExecutionTime: 0,
        startedAt: Date.now(),
      };

      this.workers.set(workerId, workerInfo);

      actualWorker.on('message', (message) => this.handleWorkerMessage(workerId, message));
      actualWorker.on('error', (error) => this.handleWorkerError(workerId, error));
      actualWorker.on('exit', (exitCode) => this.handleWorkerExit(workerId, exitCode));

      actualWorker.on('online', () => {
        this.logger.info(`Worker ${workerId} is online and ready.`);
        // Ensure the status is correctly set in the map entry
        const currentWorkerInfo = this.workers.get(workerId);
        if (currentWorkerInfo) {
          currentWorkerInfo.status = 'idle';
        } else {
            // This case should ideally not happen if worker is added before 'online'
            this.logger.warn(`Worker ${workerId} reported online, but not found in workers map. This might indicate a race condition or premature removal.`);
            // Re-add or handle appropriately if necessary, for now, log and proceed with event.
        }
        this.emitSafe('worker:ready', workerId);
        this.tryScheduleTasks(); // A new worker is ready, try to assign tasks
      });

      this.emitSafe('worker:created', workerId);
      // Note: 'worker:ready' is emitted upon the 'online' event.

    } catch (error) {
      this.logger.error(`Failed to create worker ${workerId}:`, error);
      // Clean up if workerId was used but worker creation failed before adding to map
      // If it was added, handleWorkerError/Exit should eventually clean it up.
      // For now, just log. If this.nextWorkerId was incremented, it stays incremented.
      this.emitSafe('error', new Error(`Failed to create worker ${workerId}: ${error instanceof Error ? error.message : String(error)}`));
    }
  }

  private async terminateWorker(workerId: number, reason: string): Promise<void> {
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo) {
      this.logger.warn(`Attempted to terminate non-existent worker ${workerId}.`);
      return;
    }

    this.logger.info(`Terminating worker ${workerId} due to: ${reason}. Current status: ${workerInfo.status}`);
    workerInfo.status = 'terminating';

    // If there's a task currently assigned, it should ideally be handled.
    // For now, we assume the worker will finish or the task will be re-queued/failed by handleWorkerExit.
    if (workerInfo.currentTaskId) {
      this.logger.warn(`Worker ${workerId} is being terminated while processing task ${workerInfo.currentTaskId}. This task may need manual requeue or will be handled by exit handler.`);
      // Future: Consider more proactive task handling here, e.g., trying to re-queue if stealable.
    }

    try {
      // Attempt graceful shutdown. The 'exit' event will handle final cleanup.
      // The `terminate()` method returns a Promise that resolves with the exit code.
      await workerInfo.worker.terminate();
      this.logger.info(`Worker ${workerId} terminated successfully via API call.`);
      // Note: The 'exit' handler (handleWorkerExit) will do the actual removal from the map
      // and emit 'worker:terminated'. This is to ensure cleanup happens after the worker
      // process has truly exited. If terminate() itself guarantees 'exit' is called,
      // then we might not need to do much more here. Let's rely on 'exit' handler.
    } catch (error) {
      this.logger.error(`Error during explicit termination of worker ${workerId}:`, error);
      // If termination fails, the 'exit' handler might still be called, or the worker might be stuck.
      // For robustness, ensure cleanup even if terminate() throws.
      // However, deleting here might conflict with handleWorkerExit. Best to let handleWorkerExit manage removal.
      // this.workers.delete(workerId); // Potentially problematic: let handleWorkerExit do this.
      this.emitSafe('worker:terminated', workerId, `error during termination: ${error instanceof Error ? error.message : String(error)}`);
      this.emitSafe('error', new Error(`Failed to terminate worker ${workerId}: ${error instanceof Error ? error.message : String(error)}`));
    }
    // The actual removal from `this.workers` and `worker:terminated` event
    // should be consistently handled by `handleWorkerExit` to avoid race conditions
    // or duplicate cleanup. `worker.terminate()` should trigger 'exit'.
  }

  private enqueueTask(taskWithControls: TaskWithControls<TData, TResult>): void {
    const taskId = taskWithControls.task.id;
    const taskPriority = taskWithControls.task.priority;
    this.logger.debug(`Enqueuing task ${taskId} with priority ${TaskPriority[taskPriority]}.`);

    if (this.isShuttingDown) {
        this.logger.warn(`Attempted to enqueue task ${taskId} while pool is shutting down. Rejecting.`);
        taskWithControls.reject(new Error('Pool is shutting down. Task rejected.'));
        if (taskWithControls.timeoutId) clearTimeout(taskWithControls.timeoutId);
        return;
    }

    const currentQueueSize = this.taskQueue.length + this.highPriorityQueue.length;
    if (currentQueueSize >= this.options.taskQueueSize) {
      this.logger.warn(`Task queue is full (size: ${currentQueueSize}, limit: ${this.options.taskQueueSize}). Task ${taskId} rejected due to backpressure.`);
      this.emitSafe('pool:backpressure', currentQueueSize);
      taskWithControls.reject(new Error('Task queue is full. Task rejected due to backpressure.'));
      if (taskWithControls.timeoutId) clearTimeout(taskWithControls.timeoutId);
      return;
    }

    if (taskPriority === TaskPriority.HIGH) {
      this.highPriorityQueue.push(taskWithControls);
      this.logger.debug(`Task ${taskId} added to high priority queue. High priority queue size: ${this.highPriorityQueue.length}`);
      } else {
      this.taskQueue.push(taskWithControls);
      this.logger.debug(`Task ${taskId} added to normal priority queue. Queue size: ${this.taskQueue.length}`);
    }

    this.emitSafe('task:queued', taskWithControls.task);
    this.tryScheduleTasks(); // Try to assign this task immediately if workers are available
  }

  private getIdleWorkerCount(): number {
  let count = 0;
  for (const workerInfo of this.workers.values()) {
    if (workerInfo.status === 'idle') {
      count++;
      }
    }
    return count;
  }

  private handleWorkerError(workerId: number, error: Error): void {
    this.logger.error(`Unhandled error from worker ${workerId}:`, error);
    this.emitSafe('worker:error', workerId, error);

    const workerInfo = this.workers.get(workerId);
    if (workerInfo) {
      // If the worker was busy, its current task needs to be failed.
      if (workerInfo.currentTaskId) {
        const taskError = new Error(error.message || 'Unknown error from worker');
        const finalResult: WorkerTaskResult<TResult> = {
          taskId: workerInfo.currentTaskId,
          result: undefined,
          error: taskError,
          workerId: workerId,
          executionTime: 0,
          queueTime: 0,
        };
        const taskWithControls = this.pendingTasks.get(workerInfo.currentTaskId);
        if (taskWithControls) {
          taskWithControls.reject(finalResult);
          this.emitSafe('task:failed', workerInfo.currentTaskId, workerId, taskError);
        }
      }
    }
  }

  // Helper method to update historical metrics
  private updateMetricsOnTaskCompletion(taskResult: WorkerTaskResult<TResult>): void {
    this.logger.debug(`Updating metrics on completion of task ${taskResult.taskId}`);
    // Add to queueTimeHistory, potentially executionTime for averaging
    if (taskResult.queueTime > 0) {
        this.addMetric(this.queueTimeHistory, taskResult.queueTime);
    }
    // Further metric updates (e.g., task-specific execution times) can be added here.
  }

  // Helper method to add a metric to a history array, ensuring size limits
  private addMetric(historyArray: TimestampedMetric[], value: number): void {
    historyArray.push({ timestamp: Date.now(), value });
    if (historyArray.length > this.advancedOptions.metricHistorySize) {
      historyArray.shift(); // Keep history size bounded
    }
  }

  private emitSafe(event: keyof WorkerPoolEvents, ...args: any[]): void {
    try {
      this.emit(event, ...args);
    } catch (error) {
      this.logger.error(`Error emitting event '${event}':`, error);
      // Optionally emit a generic 'error' event for critical event emission failures
      if (event !== 'error') {
        this.emit('error', new Error(`Failed to emit event ${event}: ${error instanceof Error ? error.message : String(error)}`));
      }
    }
  }

  private startMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(() => {
      this.monitorAndScale();
    }, this.options.checkInterval);

    this.logger.debug('Monitoring started');
  }

  private monitorAndScale(): void {
    // Basic monitoring and scaling logic
    const stats = this.getStats();
    const utilization = stats.pendingTasks / Math.max(stats.totalWorkers, 1);

    // Record utilization history
    this.addMetric(this.utilizationHistory, utilization);

    // Scale up if needed
    if (utilization > this.options.scaleUpThreshold &&
        stats.totalWorkers < this.options.maxWorkers &&
        !this.isCurrentlyScalingUp) {
      this.scaleUp('High utilization');
    }

    // Scale down if needed
    if (utilization < this.options.scaleDownThreshold &&
        stats.totalWorkers > this.options.minWorkers &&
        !this.isCurrentlyScalingDown) {
      this.scaleDown('Low utilization');
    }
  }

  private scaleUp(reason: string): void {
    this.isCurrentlyScalingUp = true;
    const workersToAdd = Math.floor(this.advancedOptions.scaleUpAggressiveness);

    for (let i = 0; i < workersToAdd && this.workers.size < this.options.maxWorkers; i++) {
      this.createWorker();
    }

    this.scalingActionsCount++;
    this.lastScalingActionTime = Date.now();
    this.emitSafe('pool:scaledUp', this.workers.size, reason);
    this.logger.info(`Scaled up: ${reason}. Current workers: ${this.workers.size}`);

    // Reset scaling flag after cooldown
    setTimeout(() => {
      this.isCurrentlyScalingUp = false;
    }, this.advancedOptions.scalingCooldown);
  }

  private scaleDown(reason: string): void {
    this.isCurrentlyScalingDown = true;
    const workersToRemove = Math.max(1, Math.floor(this.workers.size * (1 - this.advancedOptions.scaleDownCaution)));

    let removed = 0;
    for (const [workerId, workerInfo] of this.workers) {
      if (removed >= workersToRemove) break;
      if (workerInfo.status === 'idle') {
        this.terminateWorker(workerId, 'scale down');
        removed++;
      }
    }

    this.scalingActionsCount++;
    this.lastScalingActionTime = Date.now();
    this.emitSafe('pool:scaledDown', this.workers.size, reason);
    this.logger.info(`Scaled down: ${reason}. Current workers: ${this.workers.size}`);

    // Reset scaling flag after cooldown
    setTimeout(() => {
      this.isCurrentlyScalingDown = false;
    }, this.advancedOptions.scalingCooldown);
  }

  private handleTaskTimeout(taskId: string): void {
    this.logger.warn(`Task ${taskId} timed out`);

    const taskWithControls = this.pendingTasks.get(taskId);
    if (taskWithControls) {
      if (taskWithControls.timeoutId) {
        clearTimeout(taskWithControls.timeoutId);
      }

      taskWithControls.reject(new Error(`Task ${taskId} timed out`));
      this.pendingTasks.delete(taskId);
      this.emitSafe('task:timeout', taskId);
    }
  }

  private tryScheduleTasks(): void {
    // Get available workers
    const idleWorkers = Array.from(this.workers.values()).filter(w => w.status === 'idle');

    if (idleWorkers.length === 0) {
      return; // No available workers
    }

    // Process high priority queue first
    while (this.highPriorityQueue.length > 0 && idleWorkers.length > 0) {
      const taskWithControls = this.highPriorityQueue.shift()!;
      const worker = idleWorkers.shift()!;
      this.assignTaskToWorker(taskWithControls, worker);
    }

    // Process normal priority queue
    while (this.taskQueue.length > 0 && idleWorkers.length > 0) {
      const taskWithControls = this.taskQueue.shift()!;
      const worker = idleWorkers.shift()!;
      this.assignTaskToWorker(taskWithControls, worker);
    }
  }

  private assignTaskToWorker(taskWithControls: TaskWithControls<TData, TResult>, workerInfo: WorkerInfo): void {
    const { task } = taskWithControls;

    workerInfo.status = 'busy';
    workerInfo.currentTaskId = task.id;

    this.pendingTasks.set(task.id, taskWithControls);

    // Send task to worker
    try {
      workerInfo.worker.postMessage({
        type: 'task',
        taskId: task.id,
        data: task.data
      });

      this.emitSafe('task:scheduled', task.id, workerInfo.id);
      this.logger.debug(`Assigned task ${task.id} to worker ${workerInfo.id}`);
    } catch (error) {
      this.logger.error(`Failed to send task ${task.id} to worker ${workerInfo.id}:`, error);
      this.handleTaskFailure(task.id, workerInfo.id, error as Error);
    }
  }

  private handleTaskFailure(taskId: string, workerId: number, error: Error): void {
    const taskWithControls = this.pendingTasks.get(taskId);
    if (taskWithControls) {
      if (taskWithControls.timeoutId) {
        clearTimeout(taskWithControls.timeoutId);
      }

      const result: WorkerTaskResult<TResult> = {
        taskId,
        error,
        workerId,
        executionTime: 0,
        queueTime: Date.now() - (taskWithControls.addedToQueueAt || Date.now())
      };

      taskWithControls.reject(result);
      this.pendingTasks.delete(taskId);
      this.emitSafe('task:failed', taskId, workerId, error);
    }

    // Reset worker status
    const workerInfo = this.workers.get(workerId);
    if (workerInfo) {
      workerInfo.status = 'idle';
      workerInfo.currentTaskId = undefined;
    }
  }

  private calculateCurrentThroughput(): number {
    const now = Date.now();
    const timeDiff = now - this.lastThroughputCalcTime;

    if (timeDiff < this.advancedOptions.throughputMeasurementInterval) {
      return this.throughputHistory.length > 0 ?
        this.throughputHistory[this.throughputHistory.length - 1].value : 0;
    }

    const throughput = this.totalTasksProcessedSinceLastThroughputCalc / (timeDiff / 1000);
    this.addMetric(this.throughputHistory, throughput);

    this.totalTasksProcessedSinceLastThroughputCalc = 0;
    this.lastThroughputCalcTime = now;

    return throughput;
  }

  private handleWorkerMessage(workerId: number, message: any): void {
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo) {
      this.logger.warn(`Received message from unknown worker ${workerId}`);
      return;
    }

    try {
      if (message.type === 'result') {
        this.handleTaskResult(workerId, message);
      } else if (message.type === 'error') {
        this.handleTaskError(workerId, message);
      } else {
        this.logger.warn(`Unknown message type from worker ${workerId}:`, message.type);
      }
    } catch (error) {
      this.logger.error(`Error handling worker message from ${workerId}:`, error);
      this.handleWorkerError(workerId, error as Error);
    }
  }

  private handleTaskResult(workerId: number, message: any): void {
    const { taskId, result, metrics } = message;
    const taskWithControls = this.pendingTasks.get(taskId);

    if (!taskWithControls) {
      this.logger.warn(`Received result for unknown task ${taskId} from worker ${workerId}`);
      return;
    }

    if (taskWithControls.timeoutId) {
      clearTimeout(taskWithControls.timeoutId);
    }

    const queueTime = Date.now() - (taskWithControls.addedToQueueAt || Date.now());
    const taskResult: WorkerTaskResult<TResult> = {
      taskId,
      result,
      workerId,
      executionTime: metrics?.executionTime || 0,
      queueTime
    };

    taskWithControls.resolve(taskResult);
    this.pendingTasks.delete(taskId);

    // Update worker info
    const workerInfo = this.workers.get(workerId);
    if (workerInfo) {
      workerInfo.status = 'idle';
      workerInfo.currentTaskId = undefined;
      workerInfo.tasksProcessed++;
      workerInfo.totalExecutionTime += taskResult.executionTime;
      workerInfo.lastTaskFinishedAt = Date.now();
    }

    this.totalTasksProcessedSinceLastThroughputCalc++;
    this.updateMetricsOnTaskCompletion(taskResult);
    this.emitSafe('task:completed', taskResult);
    this.tryScheduleTasks(); // Try to assign more tasks
  }

  private handleTaskError(workerId: number, message: any): void {
    const { taskId, error } = message;
    this.handleTaskFailure(taskId, workerId, new Error(error));
  }

  private handleWorkerExit(workerId: number, exitCode: number | null): void {
    this.logger.info(`Worker ${workerId} exited with code ${exitCode}`);

    const workerInfo = this.workers.get(workerId);
    if (!workerInfo) {
      this.logger.warn(`Worker ${workerId} exit event received but worker not found in map`);
      return;
    }

    // Handle any pending task
    if (workerInfo.currentTaskId) {
      this.handleTaskFailure(
        workerInfo.currentTaskId,
        workerId,
        new Error(`Worker ${workerId} exited unexpectedly`)
      );
    }

    // Remove worker from map
    this.workers.delete(workerId);

    const reason = exitCode === 0 ? 'normal exit' : `exit code ${exitCode}`;
    this.emitSafe('worker:terminated', workerId, reason);

    // Replace worker if not shutting down and below minimum
    if (!this.isShuttingDown && this.workers.size < this.options.minWorkers) {
      this.logger.info(`Worker count below minimum, creating replacement worker`);
      this.createWorker();
    }
  }
}
