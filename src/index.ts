/**
 * Nexure.js API
 *
 * Main exports for the Nexure.js framework.
 *
 * This is a pure library entry point: importing it has NO side effects —
 * no console output, no argv parsing, no process.exit(). CLI behavior
 * lives in bin/nexure.js.
 */

// Import from native modules - they handle fallback internally
import {
  HttpParser,
  ObjectPool,
  RadixRouter,
  JsonProcessor,
  UrlParser,
  WebSocketServer,
  SchemaValidator,
  Compression,
  getNativeModuleStatus,
  configureNativeModules,
  getAllPerformanceMetrics,
  resetAllPerformanceMetrics,
  getNativeModuleMetrics
} from './native/index.js';

// Create URL parsing function exports for convenience
const urlParserInstance = new UrlParser();

// Export native modules and utilities
export {
  // Native modules
  HttpParser,
  ObjectPool,
  RadixRouter,
  JsonProcessor,
  UrlParser,
  WebSocketServer,
  SchemaValidator,
  Compression,

  // Native module management
  getNativeModuleStatus,
  configureNativeModules,
  getAllPerformanceMetrics,
  resetAllPerformanceMetrics,
  getNativeModuleMetrics
};

// Export URL parsing convenience functions
export const parseUrl = (url: string) => urlParserInstance.parse(url);
export const parseQueryString = (qs: string) => urlParserInstance.parseQueryString(qs);

// Export compression and cache wrappers
export { CompressionWrapper } from './native/compression-wrapper.js';
export { LRUCacheWrapper } from './native/lru-cache-wrapper.js';

// Core exports
export { Nexure } from './core/nexure.js';
export { Router } from './routing/router.js';
export { Container, Scope } from './di/container.js';

// HTTP utilities
export * from './http/constants.js';
export * from './http/body-parser.js';
export * from './http/http-utils.js';
export * from './http/http-method.js';
export * from './http/http-exception.js';

// Validation
export * from './validation/index.js';

// Serialization
export * from './serialization/index.js';

// Core utilities
export { logger, LogLevel } from './utils/logger.js';
export { crypto } from './utils/crypto-service.js';
export { globalPool as bufferPool } from './utils/buffer-pool.js';
export {
  readFileContents,
  readTextFile,
  writeFileContents,
  writeTextFile,
  ensureDirectory,
  getFileMetadata,
  fileExists,
  copyFile,
  streamFile,
  getTempDirectory,
  getTempFilePath,
  saveStreamToFile,
  deleteFile,
  getMimeType,
  type FileOptions,
  type FileMetadata
} from './utils/file-utils.js';

// Error handling
export {
  HttpError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  MethodNotAllowedError,
  NotAcceptableError,
  ConflictError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  UnprocessableEntityError,
  TooManyRequestsError,
  InternalServerError,
  NotImplementedError,
  ServiceUnavailableError,
  createHttpError,
  isHttpError,
  toHttpError
} from './errors/http-errors.js';

// Middleware
export * from './middleware/middleware.js';
export {
  createStreamMiddleware,
  stream,
  streamToBuffer,
  BufferCollector,
  type StreamOptions,
  type StreamResult
} from './middleware/stream-middleware.js';
export {
  errorHandler,
  developmentErrorHandler,
  createErrorHandler
} from './middleware/error-handler.js';

// Decorators
export * from './decorators/route-decorators.js';
export * from './decorators/injection-decorators.js';

// Additional exports from other modules
// Note: concurrency, security, and protocol modules are work in progress

// Export version information and native module status
const moduleStatus = getNativeModuleStatus();

export const version = '0.3.1';
export const isNative = moduleStatus.loaded;
export const isNativeAvailable = (): boolean => moduleStatus.loaded;

// Function to get native module information
export function getNativeInfo(): {
  version: string;
  isNative: boolean;
  nativeModules: Record<string, boolean>;
} {
  return {
    version,
    isNative: moduleStatus.loaded,
    nativeModules: {
      httpParser: moduleStatus.httpParser,
      radixRouter: moduleStatus.radixRouter,
      jsonProcessor: moduleStatus.jsonProcessor,
      urlParser: moduleStatus.urlParser,
      schemaValidator: moduleStatus.schemaValidator,
      objectPool: moduleStatus.objectPool,
      compression: moduleStatus.compression,
      webSocket: moduleStatus.webSocket,
      stringEncoder: moduleStatus.stringEncoder,
      threadPool: moduleStatus.threadPool,
      validationEngine: moduleStatus.validationEngine
    }
  };
}

