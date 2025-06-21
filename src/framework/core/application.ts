/**
 * NexureJS Application Core
 *
 * Main application class that orchestrates all framework components
 * with advanced optimization and native acceleration capabilities.
 */

import { EventEmitter } from 'events';
import { Server } from 'http';
import type {
  ApplicationOptions,
  NexureConfig,
  MiddlewareFunction,
  RouteHandler,
  HttpContext
} from '../types/index.js';
import { NexureRouter } from './router.js';
import { NexureServer } from './server.js';
import { MiddlewareChain } from './middleware.js';
import { PerformanceMonitor } from '../performance/monitor.js';
import { SecurityManager } from '../security/manager.js';
import { Logger } from '../utils/logger.js';

/**
 * Main NexureJS Application Class
 *
 * Provides a high-level API for building high-performance web applications
 * with built-in optimization, security, and monitoring capabilities.
 */
export class NexureApplication extends EventEmitter {
  private readonly config: NexureConfig;
  private readonly router: NexureRouter;
  private readonly server: NexureServer;
  private readonly middleware: MiddlewareChain;
  private readonly performance: PerformanceMonitor;
  private readonly security: SecurityManager;
  private readonly logger: Logger;
  private isInitialized = false;
  private isStarted = false;

  constructor(options: ApplicationOptions = {}) {
    super();

    this.config = this.mergeConfig(options);
    this.logger = new Logger(this.config.logging);
    this.router = new NexureRouter(this.config.routing);
    this.server = new NexureServer(this.config.server);
    this.middleware = new MiddlewareChain(this.config.middleware);
    this.performance = new PerformanceMonitor(this.config.performance);
    this.security = new SecurityManager(this.config.security);

    this.setupEventHandlers();
    this.logger.info('NexureJS Application created', {
      version: '1.3.0-phase2',
      phase: 'Phase 2: Advanced Optimizations'
    });
  }

  /**
   * Initialize the application with all components
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('Application already initialized');
      return;
    }

    try {
      this.logger.info('Initializing NexureJS Application...');

      // Initialize components in dependency order
      await this.performance.initialize();
      await this.security.initialize();
      await this.middleware.initialize();
      await this.router.initialize();
      await this.server.initialize();

      this.isInitialized = true;
      this.emit('initialized');
      this.logger.info('Application initialization complete');
    } catch (error) {
      this.logger.error('Application initialization failed', error);
      throw error;
    }
  }

  /**
   * Start the application server
   */
  async start(port?: number, hostname?: string): Promise<Server> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (this.isStarted) {
      throw new Error('Application is already started');
    }

    try {
      const serverInstance = await this.server.start(
        port || this.config.server.port,
        hostname || this.config.server.hostname
      );

      this.isStarted = true;
      this.emit('started', { port, hostname });

      this.logger.info('Application started successfully', {
        port: port || this.config.server.port,
        hostname: hostname || this.config.server.hostname,
        pid: process.pid
      });

      return serverInstance;
    } catch (error) {
      this.logger.error('Failed to start application', error);
      throw error;
    }
  }

  /**
   * Stop the application gracefully
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      this.logger.warn('Application is not started');
      return;
    }

    try {
      this.logger.info('Stopping application...');

      await this.server.stop();
      await this.performance.shutdown();

      this.isStarted = false;
      this.emit('stopped');

      this.logger.info('Application stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping application', error);
      throw error;
    }
  }

  /**
   * Add global middleware
   */
  use(middleware: MiddlewareFunction): this {
    this.middleware.use(middleware);
    return this;
  }

  /**
   * Add route handlers
   */
  get(path: string, handler: RouteHandler): this {
    this.router.get(path, handler);
    return this;
  }

  post(path: string, handler: RouteHandler): this {
    this.router.post(path, handler);
    return this;
  }

  put(path: string, handler: RouteHandler): this {
    this.router.put(path, handler);
    return this;
  }

  delete(path: string, handler: RouteHandler): this {
    this.router.delete(path, handler);
    return this;
  }

  patch(path: string, handler: RouteHandler): this {
    this.router.patch(path, handler);
    return this;
  }

  /**
   * Add route with specific method
   */
  route(method: string, path: string, handler: RouteHandler): this {
    this.router.route(method, path, handler);
    return this;
  }

  /**
   * Get application configuration
   */
  getConfig(): Readonly<NexureConfig> {
    return Object.freeze({ ...this.config });
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return this.performance.getMetrics();
  }

  /**
   * Get application status
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      started: this.isStarted,
      uptime: this.isStarted ? process.uptime() : 0,
      memory: process.memoryUsage(),
      pid: process.pid,
      version: '1.3.0-phase2'
    };
  }

  /**
   * Handle HTTP requests
   */
  async handleRequest(context: HttpContext): Promise<void> {
    try {
      // Performance monitoring
      const startTime = process.hrtime.bigint();

      // Security checks
      await this.security.validateRequest(context);

      // Middleware chain
      await this.middleware.execute(context);

      // Route handling
      await this.router.handle(context);

      // Performance tracking
      const endTime = process.hrtime.bigint();
      this.performance.recordRequest(Number(endTime - startTime) / 1e6);

    } catch (error) {
      this.logger.error('Request handling error', error);
      await this.handleError(context, error);
    }
  }

  /**
   * Handle application errors
   */
  private async handleError(context: HttpContext, error: any): Promise<void> {
    this.emit('error', error, context);

    if (!context.response.headersSent) {
      context.response.status = 500;
      context.response.body = {
        error: 'Internal Server Error',
        message: this.config.development ? error.message : 'Something went wrong'
      };
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Graceful shutdown
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));

    // Error handling
    process.on('uncaughtException', (error) => {
      this.logger.error('Uncaught exception', error);
      this.gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason) => {
      this.logger.error('Unhandled rejection', reason);
    });
  }

  /**
   * Graceful shutdown handler
   */
  private async gracefulShutdown(signal: string): Promise<void> {
    this.logger.info(`Received ${signal}, starting graceful shutdown...`);

    try {
      await this.stop();
      process.exit(0);
    } catch (error) {
      this.logger.error('Error during graceful shutdown', error);
      process.exit(1);
    }
  }

  /**
   * Merge user options with default configuration
   */
  private mergeConfig(options: ApplicationOptions): NexureConfig {
    const defaultConfig: NexureConfig = {
      development: process.env.NODE_ENV !== 'production',
      server: {
        port: 3000,
        hostname: 'localhost',
        backlog: 511,
        keepAliveTimeout: 5000,
        headersTimeout: 60000,
        requestTimeout: 30000,
        ...options.server
      },
      routing: {
        caseSensitive: false,
        mergeParams: false,
        strict: false,
        ...options.routing
      },
      middleware: {
        trustProxy: false,
        ...options.middleware
      },
      security: {
        helmet: true,
        cors: true,
        rateLimit: true,
        ...options.security
      },
      performance: {
        monitoring: true,
        profiling: false,
        simd: true,
        nativeAcceleration: true,
        ...options.performance
      },
      logging: {
        level: 'info',
        format: 'json',
        destination: 'console',
        ...options.logging
      }
    };

    return defaultConfig;
  }
}
