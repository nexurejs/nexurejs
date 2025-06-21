/**
 * NexureJS Framework - Main Entry Point
 *
 * A high-performance, SIMD-optimized Node.js framework with advanced
 * memory management and native acceleration capabilities.
 *
 * @version 1.3.0-phase2
 * @author NexureJS Team
 * @license MIT
 */

// Core Framework Components
export { NexureApplication } from './core/application';
export { NexureServer } from './core/server';
export { NexureRouter } from './core/router';
export { NexureMiddleware } from './core/middleware';

// HTTP Components
export {
  HttpRequest,
  HttpResponse,
  HttpContext,
  HttpMethod,
  HttpStatus
} from './http';

// Routing System
export {
  Router,
  Route,
  RouteHandler,
  RouteParams,
  RouteMiddleware
} from './routing';

// Middleware System
export {
  MiddlewareFunction,
  MiddlewareChain,
  MiddlewareContext,
  ErrorHandler,
  RequestLogger,
  SecurityMiddleware,
  CompressionMiddleware,
  StaticFileMiddleware
} from './middleware';

// Performance & Optimization
export {
  PerformanceMonitor,
  MemoryOptimizer,
  SIMDProfiler,
  CacheManager,
  CompressionEngine
} from './performance';

// Security Components
export {
  SecurityManager,
  JWTService,
  CryptoService,
  RateLimiter,
  CSRFProtection
} from './security';

// Validation & Serialization
export {
  ValidationEngine,
  SchemaValidator,
  JSONProcessor,
  DataTransformer
} from './validation';

// Concurrency & Threading
export {
  WorkerPool,
  ThreadManager,
  TaskScheduler,
  AsyncHandler
} from './concurrency';

// Native Acceleration
export {
  NativeModules,
  SIMDOperations,
  AdvancedMemory,
  NativeBindings
} from './native';

// Utilities
export {
  Logger,
  ConfigManager,
  FileUtils,
  StreamUtils,
  CryptoUtils
} from './utils';

// Types & Interfaces
export type {
  NexureConfig,
  ApplicationOptions,
  ServerOptions,
  MiddlewareOptions,
  SecurityOptions,
  PerformanceOptions
} from './types';

// Framework Constants
export const FRAMEWORK_VERSION = '1.3.0-phase2';
export const FRAMEWORK_NAME = 'NexureJS';
export const OPTIMIZATION_PHASE = 'Phase 2: Advanced Optimizations';

/**
 * Create a new NexureJS application instance
 *
 * @param options - Application configuration options
 * @returns Configured NexureJS application
 */
export function createApp(options?: ApplicationOptions): NexureApplication {
  return new NexureApplication(options);
}

/**
 * Create a high-performance server instance
 *
 * @param options - Server configuration options
 * @returns Configured NexureJS server
 */
export function createServer(options?: ServerOptions): NexureServer {
  return new NexureServer(options);
}

/**
 * Framework feature detection and capabilities
 */
export const capabilities = {
  simd: true,
  nativeAcceleration: true,
  advancedMemory: true,
  phase2Optimizations: true,
  crossPlatform: true
} as const;

// Re-export everything for convenience
export * from './core';
export * from './http';
export * from './routing';
export * from './middleware';
export * from './performance';
export * from './security';
export * from './validation';
export * from './concurrency';
export * from './native';
export * from './utils';
export * from './types';
