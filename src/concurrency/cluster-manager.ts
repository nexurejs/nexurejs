/**
 * Cluster manager for multi-core support
 */

import cluster, { Worker } from 'node:cluster';
import { cpus } from 'node:os';
import { EventEmitter } from 'node:events';
import { Logger } from '../utils/logger.js';

/**
 * Cluster manager options
 */
export interface ClusterManagerOptions {
  /**
   * Number of workers
   * @default Number of CPU cores
   */
  numWorkers?: number;

  /**
   * Whether to restart workers on exit
   * @default true
   */
  restartOnExit?: boolean;

  /**
   * Restart delay in milliseconds
   * @default 1000
   */
  restartDelay?: number;

  /**
   * Maximum number of restarts per worker
   * @default 10
   */
  maxRestarts?: number;
}

/**
 * Cluster manager events
 */
export interface ClusterManagerEvents {
  /**
   * Emitted when a worker is forked
   */
  fork: (worker: Worker) => void;

  /**
   * Emitted when a worker comes online
   */
  online: (worker: Worker) => void;

  /**
   * Emitted when a worker disconnects
   */
  disconnect: (worker: Worker) => void;

  /**
   * Emitted when a worker exits
   */
  exit: (worker: Worker, code: number, signal: string) => void;

  /**
   * Emitted when a message is received from a worker
   */
  message: (worker: Worker, message: any) => void;
}

/**
 * Cluster manager for multi-core support
 */
export class ClusterManager extends EventEmitter {
  private numWorkers: number;
  private restartOnExit: boolean;
  private restartDelay: number;
  private maxRestarts: number;
  private logger = new Logger();
  // Timestamps of recent worker restarts, for crash-loop detection. Counting
  // per worker.id does not work — each restarted worker gets a fresh id.
  private restartTimestamps: number[] = [];
  private readonly restartWindowMs = 60000;

  /**
   * Create a new cluster manager
   * @param options Cluster manager options
   */
  constructor(options: ClusterManagerOptions = {}) {
    super();

    this.numWorkers = options.numWorkers || cpus().length;
    this.restartOnExit = options.restartOnExit !== false;
    this.restartDelay = options.restartDelay || 1000;
    this.maxRestarts = options.maxRestarts || 10;
  }

  /**
   * Start the cluster
   */
  start(): void {
    if (!cluster.isPrimary) {
      throw new Error('ClusterManager.start() should only be called in the primary process');
    }

    this.logger.info(`Starting cluster with ${this.numWorkers} workers`);

    // Fork workers
    for (let i = 0; i < this.numWorkers; i++) {
      this.forkWorker();
    }

    // Set up event listeners
    cluster.on('fork', worker => {
      this.logger.info(`Worker ${worker.id} forked`);
      this.emit('fork', worker);
    });

    cluster.on('online', worker => {
      this.logger.info(`Worker ${worker.id} is online`);
      this.emit('online', worker);
    });

    cluster.on('disconnect', worker => {
      this.logger.info(`Worker ${worker.id} disconnected`);
      this.emit('disconnect', worker);
    });

    cluster.on('exit', (worker, code, signal) => {
      this.logger.info(`Worker ${worker.id} exited with code ${code} and signal ${signal}`);
      this.emit('exit', worker, code, signal);

      // Restart the worker if enabled, unless we are in a crash loop.
      // Restarts are counted over a recent time window (not by worker.id,
      // since every restarted worker receives a brand-new id).
      if (this.restartOnExit) {
        const now = Date.now();
        this.restartTimestamps = this.restartTimestamps.filter(
          t => now - t < this.restartWindowMs
        );

        if (this.restartTimestamps.length < this.maxRestarts) {
          this.restartTimestamps.push(now);

          this.logger.info(
            `Restarting worker (${this.restartTimestamps.length}/${this.maxRestarts} ` +
              `restarts in the last ${this.restartWindowMs / 1000}s)`
          );

          setTimeout(() => {
            this.forkWorker();
          }, this.restartDelay);
        } else {
          this.logger.warn(
            `Cluster exceeded ${this.maxRestarts} restarts within ` +
              `${this.restartWindowMs / 1000}s — crash loop detected, not restarting`
          );
        }
      }
    });

    cluster.on('message', (worker, message) => {
      this.emit('message', worker, message);
    });
  }

  /**
   * Fork a new worker
   */
  private forkWorker(): Worker {
    return cluster.fork();
  }

  /**
   * Send a message to all workers
   * @param message The message to send
   */
  broadcast(message: any): void {
    for (const id in cluster.workers) {
      const worker = cluster.workers[id];
      if (worker) {
        worker.send(message);
      }
    }
  }

  /**
   * Get the number of active workers
   */
  getWorkerCount(): number {
    return Object.keys(cluster.workers || {}).length;
  }

  /**
   * Gracefully shutdown the cluster
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down cluster');

    // Disconnect all workers
    for (const id in cluster.workers) {
      const worker = cluster.workers[id];
      if (worker) {
        worker.disconnect();
      }
    }

    // Wait for all workers to exit
    return new Promise<void>(resolve => {
      const checkInterval = setInterval(() => {
        const workerCount = this.getWorkerCount();

        if (workerCount === 0) {
          clearInterval(checkInterval);
          this.logger.info('Cluster shutdown complete');
          resolve();
        } else {
          this.logger.info(`Waiting for ${workerCount} workers to exit`);
        }
      }, 500);
    });
  }
}
