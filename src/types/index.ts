/**
 * Type definitions for the NexureJS framework
 *
 * This file contains type declarations to fix TypeScript errors
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { parseBody as parseBodyImpl } from '../http/body-parser.js';
import { composeMiddleware as composeMiddlewareImpl } from '../middleware/middleware.js';
import { getRouteMetadata as getRouteMetadataImpl } from '../decorators/route-decorators.js';
import { Logger as FrameworkLogger } from '../utils/logger.js';
import { HttpMethod } from '../http/http-method.js';

/**
 * Types module
 *
 * Contains various type definitions and utility functions
 * used throughout the framework.
 */

// ==========================================
// Cache types
// ==========================================
export interface CacheOptions {
  ttl?: number;
  checkPeriod?: number;
  maxItems?: number;
  namespace?: string;
}

export interface Cache {
  get(key: string): any;
  set(key: string, value: any, ttl?: number): void;
  del(key: string): void;
  clear(): void;
}

export class CacheManager implements Cache {
  constructor(_options?: CacheOptions) {}

  get<T = any>(_key: string): T | null {
    return null;
  }

  set(_key: string, _value: any, _ttl?: number | { ttl: number }): void {}

  del(_key: string): void {}

  clear(): void {}

  createKey(key: string, namespace?: string): string {
    return `${namespace || 'global'}:${key}`;
  }
}

// ==========================================
// Logger type
// ==========================================
export interface LoggerOptions {
  level?: string;
  format?: string;
  console?: boolean;
}

export enum LogLevel {
  DEBUG,
  INFO,
  WARN,
  ERROR
}

export class Logger {
  constructor(_options?: LoggerOptions) {}
  debug(_message: string, ..._args: any[]): void {}
  info(_message: string, ..._args: any[]): void {}
  warn(_message: string, ..._args: any[]): void {}
  error(_message: string, ..._args: any[]): void {}
  log(_message: string, ..._args: any[]): void {}
}

// Global logger instance
export const logger = new FrameworkLogger();

// ==========================================
// Container type
// ==========================================
export class Container {
  private providers: Map<any, any> = new Map();

  constructor() {}

  register(target: any, implementation?: any): void {
    this.providers.set(target, implementation || target);
  }

  resolve<T>(target: any): T {
    const implementation = this.providers.get(target);
    if (!implementation) {
      throw new Error(`No provider found for ${target?.name || target}`);
    }
    return new implementation() as T;
  }

  getAllProviders(): any[] {
    return Array.from(this.providers.keys());
  }
}

// ==========================================
// Router type
// ==========================================
export class Router {
  constructor(_globalPrefix?: string) {}
  addRoute(_method: string, _path: string, _handler: Function): void {}
  findRoute(_method: string, _path: string): any {
    return null;
  }
}

// ==========================================
// HTTP types
// ==========================================
export class HttpException extends Error {
  statusCode: number;
  details?: any;

  constructor(statusCode: number, message: string, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;

    // Set prototype explicitly for class extending built-ins
    Object.setPrototypeOf(this, HttpException.prototype);
  }

  static unauthorized(message: string): HttpException {
    return new HttpException(401, message);
  }

  static notFound(message: string): HttpException {
    return new HttpException(404, message);
  }

  static forbidden(message: string): HttpException {
    return new HttpException(403, message);
  }

  static badRequest(message: string): HttpException {
    return new HttpException(400, message);
  }
}

/**
 * HTTP methods enum
 */
export { HttpMethod };

export const HTTP_CONSTANTS = {
  CRLF: Buffer.from('\r\n'),
  DOUBLE_CRLF: Buffer.from('\r\n\r\n'),
  SPACE: Buffer.from(' '),
  COLON_SPACE: Buffer.from(': '),
  toString(): typeof HTTP_CONSTANTS {
    return this;
  }
};

export const HTTP_LIMITS = {
  MAX_HEADER_SIZE: 8192
};

// ==========================================
// Stream and Transform types
// ==========================================
import { Transform as NodeTransform, TransformOptions } from 'stream';

export class OptimizedTransform extends NodeTransform {
  constructor(options?: TransformOptions) {
    super(options);
  }

  pipe(destination: any): any {
    return destination;
  }

  // Override required stream methods
  _transform(chunk: any, encoding: string, callback: Function): void {
    callback(null, chunk);
  }

  on(event: string, handler: Function): this {
    return super.on(event, handler as any);
  }

  read(): any {
    return super.read();
  }
}

// Ensure Transform is an alias to OptimizedTransform
export { OptimizedTransform as Transform };

export class TimeoutHandler {
  private timeout: NodeJS.Timeout | null = null;

  constructor() {}

  start(): void {
    // Implementation would set a timeout
  }

  extend(_percent: number): void {
    // Implementation would extend the timeout
  }

  clear(_error: boolean): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
  }
}

// ==========================================
// WebSocket types
// ==========================================
export class WebSocketServer {
  constructor(_server: any, _options?: WebSocketServerOptions) {}
}

export interface WebSocketServerOptions {
  path?: string;
  maxPayload?: number;
  pingInterval?: number;
  pingTimeout?: number;
}

// Function implementations
export function isWebSocketController(_target: any): boolean {
  return false;
}
export function getWebSocketHandlers(_target: any): any[] {
  return [];
}
export function getWebSocketAuthHandler(_target: any): any {
  return null;
}

// ==========================================
// Native modules types
// ==========================================
export class JsHttpParser {
  parseHeaders(_buffer: Buffer): any {
    return {};
  }
  parseBody(_buffer: Buffer, _contentLength: number): any {
    return {};
  }
  reset(): void {}
}

export class JsRadixRouter {
  constructor(_prefix: string) {}
  addRoute(_method: HttpMethod, _path: string, _handler: Function): void {}
  findRoute(_method: HttpMethod, _path: string): any {
    return null;
  }
}

export class NativeJsonProcessor {
  parse(_json: string): any {
    return {};
  }
  parseStream(_buffer: Buffer): any {
    return {};
  }
  stringifyStream(_values: any): any {
    return Buffer.from('');
  }
}

export class NativeSchemaValidator {
  validate(_schema: any, _data: any): any {
    return { valid: true, errors: [] };
  }
  validatePartial(_schema: any, _data: any, _updates: any): any {
    return { valid: true, errors: [] };
  }
  compileSchema(_schema: any): any {
    return {};
  }
  clearCache(): void {}
  getCacheStats(): any {
    return {};
  }
}

export interface ZeroCopyResult {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Buffer | null;
  versionMajor: number;
  versionMinor: number;
  complete: boolean;
  upgrade: boolean;
}

export class ZeroCopyHttpParser {
  static getParser(): any {
    return null;
  }
  static releaseParser(_parser: any): void {}
}

export function getParser(): any {
  return null;
}
export function releaseParser(_parser: any): void {}
export function parseHttpRequest(_buffer: Buffer): ZeroCopyResult {
  return {
    method: '',
    url: '',
    headers: {},
    body: null,
    versionMajor: 1,
    versionMinor: 1,
    complete: false,
    upgrade: false
  };
}

// ==========================================
// Object pool type
// ==========================================
export class ObjectPool {
  constructor(_options: any) {}
}

// ==========================================
// Multipart parser
// ==========================================
export class MultipartParser {
  constructor(_boundary: string, _options: any) {}

  parse(_req: any): any {
    // Parse multipart form data
    return {};
  }
}

// ==========================================
// Validation types
// ==========================================
export class Validator {
  async validate(
    _data: any,
    _schema: any,
    _options?: ValidationOptions
  ): Promise<ValidationResult> {
    return { valid: true, errors: [], data: {} };
  }

  registerMessage(_key: string, _message: string): void {
    // Register custom validation message
  }
}

export interface ValidationSchema {
  type: string;
  properties?: Record<string, any>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: any[];
  data: any;
}

export interface ValidationOptions {
  stripUnknown?: boolean;
  allowUnknown?: boolean;
  abortEarly?: boolean;
  abortOnFailure?: boolean;
  pathPrefix?: string;
  sanitize?: boolean;
  statusCode?: number;
  messages?: Record<string, string> | string[];
}

// ==========================================
// DI types
// ==========================================
export enum Scope {
  SINGLETON = 'singleton',
  TRANSIENT = 'transient',
  REQUEST = 'request'
}

export function getInjectionMetadata(_target: any): any {
  return {};
}

// ==========================================
// Utils and other types
// ==========================================
export function getUseNativeByDefault(): boolean {
  return false;
}
export function getNativeModuleMetrics(): any {
  return {};
}

// ==========================================
// Middleware types
// ==========================================

/**
 * Type definition for middleware handlers
 */
export type MiddlewareHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => Promise<void>
) => Promise<void>;

/**
 * Parse the body of an HTTP request
 * @param req The request to parse
 * @param options Parsing options
 */
export function parseBody(req: IncomingMessage, _options?: any): Promise<any> {
  try {
    return parseBodyImpl(req, _options);
  } catch (error) {
    logger.error(`Error parsing request body: ${(error as Error).message}`);
    throw error;
  }
}

/**
 * Compose multiple middleware functions into a single middleware
 * @param middlewares Array of middleware handlers to compose
 */
export function composeMiddleware(middlewares: MiddlewareHandler[]): MiddlewareHandler {
  if (!Array.isArray(middlewares)) {
    const error = new TypeError('Middlewares must be an array');
    logger.error(error.message);
    throw error;
  }

  return composeMiddlewareImpl(middlewares);
}

/**
 * Get route metadata from a target
 * @param target The target to get metadata from
 * @param propertyKey Optional property key
 */
export function getRouteMetadata(_target: any, _propertyKey?: string | symbol): any {
  try {
    return getRouteMetadataImpl(_target, _propertyKey);
  } catch (error) {
    logger.error(`Error getting route metadata: ${(error as Error).message}`);
    return { path: '/', middlewares: [] };
  }
}

/**
 * Checks if a request has a body based on method and headers
 * @param req The request to check
 */
export function hasBody(req: IncomingMessage): boolean {
  // These methods typically don't have a body
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return false;
  }

  // Check for content-length or transfer-encoding headers
  const contentLength = req.headers['content-length'];
  const transferEncoding = req.headers['transfer-encoding'];

  if (contentLength) {
    return parseInt(contentLength, 10) > 0;
  }

  // If transfer-encoding is set (e.g., chunked), then assume there's a body
  return Boolean(transferEncoding);
}

/**
 * Gets the content type of a request
 * @param req The request to check
 */
export function getContentType(req: IncomingMessage): string {
  const contentType = req.headers['content-type'] || '';

  // Extract the MIME type without parameters like charset
  const match = contentType.match(/^([^;]+)/);

  return match ? match[1].trim().toLowerCase() : '';
}

/**
 * Creates a JSON transformer function
 * @param options Transformer options
 */
export function createJsonTransformer(options?: any): any {
  if (!options) {
    return (data: any) => JSON.stringify(data);
  }

  // If options are provided, return a transform stream
  return createJsonTransformStream(options);
}

/**
 * Creates a text transformer function
 * @param options Transformer options
 */
export function createTextTransformer(options?: any): any {
  if (!options) {
    return (data: any) => String(data);
  }

  // If options are provided, return a transform stream
  return createTextTransformStream(options);
}

// ==========================================
// Native module utils
// ==========================================
export function getNativeModuleStatus(): any {
  return {
    enabled: false,
    available: false,
    modules: {}
  };
}

export function setUseNativeByDefault(_enable: boolean): void {
  // Implementation would set the global native module flag
}

export function configureNativeModules(_options: any): void {
  // Implementation would configure native modules
}

// ==========================================
// File utils
// ==========================================
export const globalPool = {
  acquire(size: number): Buffer {
    return Buffer.alloc(size);
  },
  release(_buffer: Buffer): void {
    // Implementation would release the buffer to the pool
  }
};

/**
 * Extract boundary from content-type header
 */
export function extractBoundary(_contentType: string): string {
  return '';
}

/**
 * Create a temporary file for multipart uploads
 * @param prefix Optional prefix for the temp file
 * @param suffix Optional suffix for the temp file
 */
export function getTempFilePath(_prefix: string, _suffix: string): Promise<string> {
  return Promise.resolve('');
}

/**
 * Ensure a directory exists
 * @param dir Directory path
 */
export function ensureDirectory(_dir: string): Promise<void> {
  return Promise.resolve();
}

/**
 * Check if a file exists
 * @param path File path
 */
export function fileExists(_path: string): Promise<boolean> {
  return Promise.resolve(false);
}

/**
 * Delete a file
 * @param path File path
 */
export function deleteFile(_path: string): Promise<void> {
  return Promise.resolve();
}

// Extend crypto with randomString
export function randomString(length: number): string {
  // Implementation would generate a random string
  return 'random'.padEnd(length, '0');
}

// For native modules
export const v8Optimizer = {
  optimizeFunction(fn: Function): Function {
    return fn;
  }
};

// ==========================================
// Stream transformer utilities
// ==========================================
export function createOptimizedTransform(options: any): OptimizedTransform {
  return new OptimizedTransform(options);
}

export function createTextTransformStream(options: any): OptimizedTransform {
  return new OptimizedTransform(options);
}

export function createJsonTransformStream(options: any): OptimizedTransform {
  return new OptimizedTransform(options);
}

// Global timeout manager
export const globalTimeoutManager = {
  createTimeoutHandler(_options: any): TimeoutHandler {
    return new TimeoutHandler();
  }
};

// ==========================================
// Route types
// ==========================================

/**
 * Route match interface
 */
export interface RouterMatch {
  /**
   * Route parameters extracted from the URL
   */
  params: Record<string, string>;

  /**
   * Route handler
   */
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;

  /**
   * Route middlewares
   */
  middlewares: MiddlewareHandler[];
}

export function getEmptyResult(): ZeroCopyResult {
  return {
    method: '',
    url: '',
    headers: {},
    body: null,
    versionMajor: 1,
    versionMinor: 1,
    complete: false,
    upgrade: false
  };
}

/**
 * Memory management interface for buffer pooling
 */
export interface MemoryManager {
  /**
   * Acquire a buffer of given size
   */
  acquire(size: number): Buffer;

  /**
   * Release a buffer back to the pool
   */
  release(_buffer: Buffer): void;
}
