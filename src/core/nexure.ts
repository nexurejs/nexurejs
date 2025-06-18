import { createServer, Server, IncomingMessage, ServerResponse } from 'node:http';
import { Router } from '../routing/router.js';
import { MiddlewareHandler } from '../middleware/middleware.js';
import { Container } from '../di/container.js';
import {
  getNativeModuleStatus,
  configureNativeModules,
  WebSocketServer,
  WebSocketServerOptions
} from '../native/index.js';
import { setUseNativeByDefault } from '../utils/native-bindings.js';
import { v8Optimizer } from '../utils/v8-optimizer.js';

export interface NexureOptions {
  /**
   * Enable logging
   * @default true
   */
  logging?: boolean;

  /**
   * Enable pretty JSON responses
   * @default false
   */
  prettyJson?: boolean;

  /**
   * Global prefix for all routes
   * @default ''
   */
  globalPrefix?: string;

  /**
   * WebSocket options
   */
  websocket?: {
    /**
     * Enable WebSocket support
     * @default true
     */
    enabled?: boolean;

    /**
     * Advanced WebSocket configuration
     */
    config?: WebSocketServerOptions;
  };

  /**
   * Performance optimization options
   * @default { nativeModules: true, gcInterval: 0 }
   */
  performance?: {
    /**
     * Enable native modules for performance-critical operations
     * @default true
     */
    nativeModules?: boolean;

    /**
     * Force using native modules even when they might not be fully compatible
     * @default false
     */
    forceNativeModules?: boolean;

    /**
     * Native module configuration
     */
    nativeModuleConfig?: {
      /**
       * Enable verbose logging for native modules
       * @default false
       */
      verbose?: boolean;

      /**
       * Maximum size for route cache
       * @default 1000
       */
      maxCacheSize?: number;

      /**
       * Preload all available native modules on startup
       * @default true
       */
      preloadModules?: boolean;
    };

    /**
     * V8 engine optimization options
     */
    v8Optimizer?: {
      /**
       * Enable V8 engine optimizations
       * @default true
       */
      enabled?: boolean;

      /**
       * Enable hidden class optimizations for objects
       * @default true
       */
      hiddenClasses?: boolean;

      /**
       * Enable monomorphic call site optimizations
       * @default true
       */
      monomorphicCalls?: boolean;

      /**
       * Enable function optimization wrappers
       * @default true
       */
      functionOptimization?: boolean;

      /**
       * Track garbage collection events
       * @default false in production, true in development
       */
      trackGC?: boolean;

      /**
       * Enable tracking of optimization statistics
       * @default false in production, true in development
       */
      trackStatistics?: boolean;
    };

    /**
     * Interval in ms to force garbage collection if available (0 = disabled)
     * @default 0
     */
    gcInterval?: number;

    /**
     * Max memory usage in MB before forced GC (0 = disabled)
     * @default 0
     */
    maxMemoryMB?: number;
  };
}

export class Nexure {
  private server: Server;
  private router: Router;
  private middlewares: MiddlewareHandler[] = [];
  private container: Container;
  private logger: Logger;
  private options: NexureOptions;
  private wsServer?: WebSocketServer;
  private gcTimer: NodeJS.Timeout | null = null;
  private customErrorHandler?: (error: any, req: IncomingMessage, res: ServerResponse) => void;

  constructor(options: NexureOptions = {}) {
    this.options = {
      logging: true,
      prettyJson: false,
      globalPrefix: '',
      websocket: {
        enabled: true
      },
      performance: {
        nativeModules: true,
        forceNativeModules: false,
        nativeModuleConfig: {
          verbose: false,
          maxCacheSize: 1000,
          preloadModules: true
        },
        gcInterval: 0,
        maxMemoryMB: 0
      },
      ...options
    };

    // Setup logging first
    this.logger = new Logger({
      console: this.options.logging
    });

    // Initialize native modules
    this.initializeNativeModules();
    
    // Initialize V8 optimizer with configuration options
    this.initializeV8Optimizer();

    this.container = new Container();
    this.router = new Router(this.options.globalPrefix);

    this.server = createServer(this.handleRequest.bind(this));

    // Initialize WebSocket server if enabled
    if (this.options.websocket?.enabled !== false) {
      const nativeStatus = getNativeModuleStatus();
      if (nativeStatus.loaded && nativeStatus.webSocket) {
        // Create WebSocket server with configured options
        this.wsServer = new WebSocketServer(this.server, this.options.websocket?.config || {});

        // Set up WebSocket controllers
        this.setupWebSocketControllers();

        this.logger.info('Native WebSocket server initialized');
      } else {
        this.logger.warn(
          'Native WebSocket support is not available. WebSocket functionality is disabled.'
        );
      }
    }

    // Setup memory management if enabled
    this.setupMemoryManagement();
  }

  /**
   * Register a controller or a module
   * @param target The controller or module to register
   */
  register(target: any): this {
    this.container.register(target);
    this.router.registerRoutes(target, this.container);
    return this;
  }

  /**
   * Add a middleware to the middleware pipeline
   * @param middleware The middleware to add
   */
  use(middleware: MiddlewareHandler): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Start the server
   * @param port The port to listen on
   * @param callback Callback function to execute when the server starts
   */
  listen(port: number, callback?: () => void): Server {
    this.server.listen(port, () => {
      this.logger.info(`Server running at http://localhost:${port}/`);

      // Log native module status
      const moduleStatus = getNativeModuleStatus();
      if (moduleStatus.loaded) {
        this.logger.info(
          `Native modules enabled: ${Object.entries(moduleStatus)
            .filter(([key, value]) => key !== 'loaded' && value === true)
            .map(([key]) => key)
            .join(', ')}`
        );
      } else {
        this.logger.info('Running in pure JavaScript mode (native modules not loaded)');
      }

      if (callback) callback();
    });

    // Start WebSocket server if initialized
    this.wsServer?.start();

    return this.server;
  }

  /**
   * Get metrics about native module usage
   */
  getNativeModuleMetrics(): Record<string, any> {
    // We'll use the existing function without requiring an import
    try {
      if (typeof getNativeModuleMetrics === 'function') {
        return getNativeModuleMetrics();
      }
      // Fallback if function doesn't exist
      return { status: getNativeModuleStatus() };
    } catch {
      return { status: getNativeModuleStatus() };
    }
  }

  /**
   * Enable or disable native modules at runtime
   * @param enabled Whether to enable native modules
   * @param force Whether to force reload modules
   */
  setNativeModulesEnabled(enabled: boolean, force: boolean = false): void {
    setUseNativeByDefault(enabled);
    if (force) {
      this.initializeNativeModules();
    }
  }

  /**
   * Check if native modules are enabled
   */
  isNativeModulesEnabled(): boolean {
    return getUseNativeByDefault();
  }

  /**
   * Handle incoming HTTP requests
   * @param req The incoming request
   * @param res The server response
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const startTime = process.hrtime();

    try {
      // Set default headers
      res.setHeader('X-Powered-By', 'NexureJS');
      res.setHeader('Content-Type', 'application/json');

      // Run middleware pipeline
      let middlewareIndex = 0;
      const next = async (): Promise<void> => {
        if (middlewareIndex < this.middlewares.length) {
          const middleware = this.middlewares[middlewareIndex++];
          await middleware(req, res, next);
        } else {
          // Process the route after all middleware has run
          await this.router.process(req, res);
        }
      };

      await next();
    } catch (error) {
      this.handleError(error, req, res);
    } finally {
      // Log request completion
      const [seconds, nanoseconds] = process.hrtime(startTime);
      const duration = seconds * 1000 + nanoseconds / 1000000;
      this.logger.info(`${req.method} ${req.url} - ${res.statusCode} - ${duration.toFixed(2)}ms`);
    }
  }

  /**
   * Handle errors that occur during request processing
   * @param error The error that occurred
   * @param req The incoming request
   * @param res The server response
   */
  private handleError(error: any, req: IncomingMessage, res: ServerResponse): void {
    this.logger.error(`Error processing ${req.method} ${req.url}: ${error.message}`);

    // If custom error handler is defined, use it
    if (this.customErrorHandler) {
      return this.customErrorHandler(error, req, res);
    }

    // Default error handling
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Internal Server Error';

    res.statusCode = statusCode;
    res.end(
      JSON.stringify(
        {
          statusCode,
          message,
          timestamp: new Date().toISOString(),
          path: req.url
        },
        null,
        this.options.prettyJson ? 2 : 0
      )
    );
  }

  /**
   * Set a custom error handler for the server
   * @param handler The error handler function
   */
  setErrorHandler(handler: (error: any, req: IncomingMessage, res: ServerResponse) => void): this {
    this.customErrorHandler = handler;
    return this;
  }

  /**
   * Alias for setErrorHandler for API consistency
   * @param handler The error handler function
   */
  onError(handler: (error: any, req: IncomingMessage, res: ServerResponse) => void): this {
    return this.setErrorHandler(handler);
  }

  /**
   * Initialize native modules
   */
  private initializeNativeModules(): void {
    const useNative = this.options.performance?.nativeModules !== false;

    // Set global preference for native modules
    setUseNativeByDefault(useNative);

    if (useNative) {
      configureNativeModules({
        enabled: true,
        verbose: Boolean(this.options.logging),
        maxCacheSize: this.options.performance?.nativeModuleConfig?.maxCacheSize || 1000
      });

      const moduleStatus = getNativeModuleStatus();
      if (moduleStatus.loaded) {
        this.logger.info('Native modules successfully initialized');
      } else {
        this.logger.warn('Native modules could not be loaded, using JavaScript fallbacks');
      }
    } else {
      configureNativeModules({ enabled: false });
      this.logger.info('Native modules disabled, using JavaScript implementations');
    }
  }

  /**
   * Setup memory management
   */
  private setupMemoryManagement(): void {
    const gcInterval = this.options.performance?.gcInterval || 0;
    const maxMemoryMB = this.options.performance?.maxMemoryMB || 0;

    // Only setup if either option is enabled
    if (gcInterval <= 0 && maxMemoryMB <= 0) return;

    // Check if we can access the garbage collector
    if (global.gc) {
      if (gcInterval > 0) {
        this.gcTimer = setInterval(() => {
          this.checkMemoryUsage();
        }, gcInterval);
      }

      if (this.options.logging) {
        this.logger.info(
          `Memory management enabled: interval=${gcInterval}ms, maxMemory=${maxMemoryMB}MB`
        );
      }
    } else if (this.options.logging) {
      this.logger.warn(
        'Memory management options set but garbage collector not available. Run with --expose-gc flag.'
      );
    }
  }

  /**
   * Check memory usage and run garbage collection if needed
   */
  private checkMemoryUsage(): void {
    const maxMemoryMB = this.options.performance?.maxMemoryMB || 0;
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);

    if (maxMemoryMB > 0 && heapUsedMB > maxMemoryMB) {
      if (this.options.logging) {
        this.logger.debug(
          `Memory threshold exceeded: ${heapUsedMB}MB > ${maxMemoryMB}MB. Running garbage collection.`
        );
      }
      global.gc?.();
    } else if (this.options.performance?.gcInterval && this.options.performance.gcInterval > 0) {
      // If interval is set, run GC regardless of memory usage
      global.gc?.();
    }
  }

  /**
   * Clean up resources when shutting down
   */
  cleanup(): void {
    // Stop memory management
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }

    // Close WebSocket server if exists
    this.wsServer?.stop();
    
    // Reset V8 optimizer
    v8Optimizer.reset();
  }
  
  /**
   * Initialize V8 optimizer with configuration options
   */
  private initializeV8Optimizer(): void {
    const v8Options = this.options.performance?.v8Optimizer || {};
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Configure V8 optimizer
    v8Optimizer.configure({
      enabled: v8Options.enabled !== false,
      hiddenClassOptimization: v8Options.hiddenClasses !== false,
      monomorphicCallOptimization: v8Options.monomorphicCalls !== false,
      functionOptimization: v8Options.functionOptimization !== false,
      trackGC: v8Options.trackGC ?? !isProduction,
      trackStats: v8Options.trackStatistics ?? !isProduction
    });
    
    if (this.options.logging) {
      this.logger.info('V8 optimizer initialized');
    }
  }
  
  /**
   * Get V8 optimization statistics
   * @returns The current V8 optimization statistics
   */
  getV8OptimizationStats(): Record<string, any> {
    return v8Optimizer.getOptimizationStats();
  }

  /**
   * Get the WebSocket server instance
   * @returns The WebSocket server instance or undefined if WebSocket support is disabled
   */
  getWebSocketServer(): WebSocketServer | undefined {
    return this.wsServer;
  }

  /**
   * Set up WebSocket controllers
   */
  private setupWebSocketControllers(): void {
    if (!this.wsServer) {
      return;
    }

    // Get all controllers with WebSocket handlers
    for (const target of this.container.getAllProviders()) {
      if (isWebSocketController(target)) {
        const handlers = getWebSocketHandlers(target);

        // Register each handler
        for (const { event, handler } of handlers) {
          this.wsServer.on(event, (context: any) => {
            const controller = this.container.resolve(target);
            if (controller) {
              try {
                handler.call(controller, context);
              } catch (error) {
                this.logger.error(
                  `Error handling WebSocket event ${event}: ${(error as Error).message}`
                );
              }
            }
          });
        }

        // Register authentication handler if defined
        const authHandler = getWebSocketAuthHandler(target);
        if (authHandler) {
          this.wsServer.setAuthenticationHandler(async (token, connection) => {
            try {
              const controller = this.container.resolve(target);
              return await authHandler.call(controller, { token, connection, success: false });
            } catch (error) {
              this.logger.error(`WebSocket authentication error: ${(error as Error).message}`);
              return false;
            }
          });
        }
      }
    }
  }
}
