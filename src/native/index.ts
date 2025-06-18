/**
 * NexureJS Native Module
 *
 * This module provides high-performance C++ implementations of core components.
 */

import { dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath, URL, URLSearchParams } from 'node:url';
import { performance } from 'node:perf_hooks';
import { Server as HttpServer } from 'node:http';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { loadNativeBinding as safeLoadNativeBinding } from './loader.js';
import { JsHttpParser } from '../http/index.js';
import { JsRadixRouter } from '../routing/js-router.js';
import type {
  HttpParseResult,
  NativeHttpParser,
  NativeObjectPool,
  ObjectPoolOptions,
  PoolInfo
} from '../types/native.js';

// Get dirName equivalent in ESM/CJS compatible way
let _dirName: string;
let _customRequire: NodeRequire;

// Handle both ESM and CommonJS environments
if (typeof __dirname !== 'undefined') {
  // CommonJS
  _dirName = __dirname;
  _customRequire = require;
} else {
  // ESM - handle import.meta.url with typeof check for CJS compatibility
  try {
    // @ts-ignore - Conditionally use import.meta.url
    const metaUrl = typeof import.meta !== 'undefined' ? import.meta.url : '';
    if (metaUrl) {
      const filename = fileURLToPath(metaUrl);
      _dirName = dirname(filename);
      _customRequire = createRequire(metaUrl);
    } else {
      // Fallback if import.meta is not available (during CJS build)
      _dirName = process.cwd();
      _customRequire = require;
    }
  } catch (_err) {
    // Final fallback
    _dirName = process.cwd();
    _customRequire = require;
  }
}

/**
 * Configuration options for native modules
 */
export interface NativeModuleOptions {
  /** Whether native modules are enabled (default: true) */
  enabled?: boolean;
  /** Whether to log verbose information (default: false) */
  verbose?: boolean;
  /** Path to the native module (default: auto-detected) */
  modulePath?: string;
  /** Maximum size for route cache (default: 1000) */
  maxCacheSize?: number;
  /** Object pool options */
  objectPoolOptions?: ObjectPoolOptions;
}

// Define WebSocket connection interface
export interface WebSocketConnection {
  id: number;
  send(message: string | object): void;
  sendBinary(data: Buffer): void;
  close(code?: number, reason?: string): void;
  joinRoom(roomName: string): void;
  leaveRoom(roomName: string): void;
  leaveAllRooms(): void;
  isInRoom(roomName: string): boolean;
  getRooms(): string[];
  isAlive: boolean;
  isAuthenticated: boolean;
  user?: any;
  data: Record<string, any>;
  lastHeartbeat: number;
  ping(): void;
}

// Define WebSocket message interface
export interface WebSocketMessage {
  type: string;
  data: any;
  room?: string;
}

// Define authentication options
export interface WebSocketAuthOptions {
  /** Whether authentication is required (default: false) */
  required: boolean;

  /** Timeout in milliseconds to authenticate after connection (default: 10000) */
  timeout: number;

  /** Authentication handler function */
  handler: (token: string, connection: WebSocketConnection) => Promise<any>;
}

// Define heartbeat options
export interface WebSocketHeartbeatOptions {
  /** Whether to enable heartbeat (default: true) */
  enabled: boolean;

  /** Interval in milliseconds to send ping messages (default: 30000) */
  interval: number;

  /** Timeout in milliseconds to wait for pong response (default: 10000) */
  timeout: number;
}

// Define WebSocket server options
export interface WebSocketServerOptions {
  /** Authentication options */
  auth?: Partial<WebSocketAuthOptions>;

  /** Heartbeat options */
  heartbeat?: Partial<WebSocketHeartbeatOptions>;

  /** Maximum connections allowed (0 = unlimited, default: 0) */
  maxConnections?: number;

  /** Maximum clients per room (0 = unlimited, default: 0) */
  maxClientsPerRoom?: number;
}

// Define WebSocket event context
export interface WebSocketEventContext {
  connection: WebSocketConnection;
  message?: WebSocketMessage;
  room?: string;
  binary?: Buffer;
}

/**
 * WebSocket connection statistics interface
 */
export interface WebSocketConnectionStats {
  /** Total number of connections */
  totalConnections: number;

  /** Number of authenticated connections */
  authenticatedConnections: number;

  /** Total bytes sent */
  totalBytesSent: number;

  /** Total bytes received */
  totalBytesReceived: number;

  /** Number of rooms */
  roomCount: number;
}

// Stream Processor interfaces
export interface StreamProcessorOptions {
  chunkSize?: number;
  maxBufferSize?: number;
  autoFlush?: boolean;
  flushInterval?: number;
}

export interface StreamProcessorMetrics {
  totalBytesProcessed: number;
  totalChunksProcessed: number;
  avgProcessingTimeMs: number;
  maxProcessingTimeMs: number;
  totalFlushes: number;
  bufferOverflows: number;
}

// Compression Engine interfaces
export interface CompressionEngineOptions {
  algorithm?: 'gzip' | 'deflate' | 'brotli' | 'lz4';
  level?: number;
  chunkSize?: number;
  dictionary?: Buffer;
}

export interface CompressionEngineMetrics {
  totalBytesCompressed: number;
  totalBytesDecompressed: number;
  compressionRatio: number;
  avgCompressionTimeMs: number;
  avgDecompressionTimeMs: number;
  totalCompressOperations: number;
  totalDecompressOperations: number;
}

// Rate Limiter interfaces
export interface RateLimiterOptions {
  tokensPerInterval: number;
  interval: number; // in milliseconds
  burstSize?: number;
  precision?: number;
}

export interface RateLimiterMetrics {
  totalRequests: number;
  allowedRequests: number;
  throttledRequests: number;
  currentTokens: number;
  avgWaitTimeMs: number;
  maxBurstUsed: number;
}

// Protocol Buffers interfaces
export interface ProtocolBuffersOptions {
  schemaPath?: string;
  validateOnEncode?: boolean;
  validateOnDecode?: boolean;
  cacheSize?: number;
}

export interface ProtocolBuffersMetrics {
  totalEncoded: number;
  totalDecoded: number;
  encodeErrors: number;
  decodeErrors: number;
  avgEncodeTimeMs: number;
  avgDecodeTimeMs: number;
  cacheHitRate: number;
}

// Validation Engine interfaces
export interface ValidationRule {
  type: string;
  field: string;
  pattern?: string;
  min?: number;
  max?: number;
  required?: boolean;
  options?: any[];
}

export interface ValidationEngineOptions {
  strictMode?: boolean;
  maxRules?: number;
  cacheSize?: number;
  cacheResults?: boolean;
}

export interface ValidationEngineMetrics {
  totalValidations: number;
  passedValidations: number;
  failedValidations: number;
  avgValidationTimeMs: number;
  maxValidationTimeMs: number;
  cacheHitRate: number;
}

// Thread Pool interfaces
export interface ThreadPoolOptions {
  minThreads?: number;
  maxThreads?: number;
  idleTimeout?: number;
  queueSize?: number;
  priority?: 'fifo' | 'lifo' | 'priority';
}

export interface ThreadPoolTask {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  priority?: number;
  result?: any;
  error?: string;
}

export interface ThreadPoolMetrics {
  activeThreads: number;
  idleThreads: number;
  completedTasks: number;
  failedTasks: number;
  cancelledTasks: number;
  pendingTasks: number;
  avgExecutionTimeMs: number;
  avgQueueTimeMs: number;
  maxQueueLength: number;
}

/**
 * Status of native module components
 */
export interface NativeModuleStatus {
  /** Whether the native module is loaded */
  loaded: boolean;
  /** Whether the HTTP parser is available */
  httpParser: boolean;
  /** Whether the radix router is available */
  radixRouter: boolean;
  /** Whether the JSON processor is available */
  jsonProcessor: boolean;
  /** Whether the URL parser is available */
  urlParser: boolean;
  /** Whether the schema validator is available */
  schemaValidator: boolean;
  /** Whether the compression module is available */
  compression: boolean;
  /** Whether the WebSocket module is available */
  webSocket: boolean;
  /** Whether the object pool is available */
  objectPool: boolean;
  /** Whether the LRU cache is available */
  lruCache: boolean;
  /** Whether the middleware chain is available */
  middlewareChain: boolean;
  /** Whether the hash functions are available */
  hashFunctions: boolean;
  /** Whether the string encoder is available */
  stringEncoder: boolean;
  /** Whether the file operations are available */
  fileOperations: boolean;
  /** Whether the stream processor is available */
  streamProcessor: boolean;
  /** Whether the compression engine is available */
  compressionEngine: boolean;
  /** Whether the rate limiter is available */
  rateLimiter: boolean;
  /** Whether the protocol buffers are available */
  protocolBuffers: boolean;
  /** Whether the validation engine is available */
  validationEngine: boolean;
  /** Whether the thread pool is available */
  threadPool: boolean;
  /** Error message if loading failed */
  error?: string;
}

// Track native binding and loading status
let nativeBinding: any = null;
let nativeBindingAttempted = false;
const nativeBindingError: string | null = null;

// Default native module status
const nativeModuleStatus: NativeModuleStatus = {
  loaded: false,
  httpParser: false,
  radixRouter: false,
  jsonProcessor: false,
  urlParser: false,
  schemaValidator: false,
  compression: false,
  webSocket: false,
  objectPool: false,
  lruCache: false,
  middlewareChain: false,
  hashFunctions: false,
  stringEncoder: false,
  fileOperations: false,
  streamProcessor: false,
  compressionEngine: false,
  rateLimiter: false,
  protocolBuffers: false,
  validationEngine: false,
  threadPool: false
};

// Default configuration
let nativeOptions: NativeModuleOptions = {
  enabled: true,
  verbose: false,
  maxCacheSize: 1000,
  objectPoolOptions: {
    maxObjectPoolSize: 1000,
    maxBufferPoolSize: 1000,
    maxHeadersPoolSize: 1000,
    enabled: true
  }
};

/**
 * Configure native module options
 * @param options Configuration options
 * @returns Current configuration
 */
export function configureNativeModules(options: NativeModuleOptions): NativeModuleOptions {
  nativeOptions = { ...nativeOptions, ...options };

  // Reset loading state if options change
  if (nativeBindingAttempted) {
    nativeBindingAttempted = false;
    nativeBinding = null;
    nativeModuleStatus.loaded = false;
    nativeModuleStatus.httpParser = false;
    nativeModuleStatus.radixRouter = false;
    nativeModuleStatus.jsonProcessor = false;
    nativeModuleStatus.urlParser = false;
    nativeModuleStatus.schemaValidator = false;
    nativeModuleStatus.compression = false;
    nativeModuleStatus.webSocket = false;
    nativeModuleStatus.objectPool = false;
    nativeModuleStatus.lruCache = false;
    nativeModuleStatus.middlewareChain = false;
    nativeModuleStatus.hashFunctions = false;
    nativeModuleStatus.stringEncoder = false;
    nativeModuleStatus.fileOperations = false;
    nativeModuleStatus.streamProcessor = false;
    nativeModuleStatus.compressionEngine = false;
    nativeModuleStatus.rateLimiter = false;
    nativeModuleStatus.protocolBuffers = false;
    nativeModuleStatus.validationEngine = false;
    nativeModuleStatus.threadPool = false;
  }

  return nativeOptions;
}

/**
 * Get the status of native module components
 * @returns Status object
 */
export function getNativeModuleStatus(): NativeModuleStatus {
  if (!nativeBindingAttempted) {
    loadNativeBinding();
  }

  return {
    loaded: nativeBinding !== null,
    httpParser: nativeBinding?.HttpParser !== undefined,
    radixRouter: nativeBinding?.RadixRouter !== undefined,
    jsonProcessor: nativeBinding?.JsonProcessor !== undefined,
    urlParser: nativeBinding?.UrlParser !== undefined,
    schemaValidator: nativeBinding?.SchemaValidator !== undefined,
    compression: nativeBinding?.Compression !== undefined,
    webSocket: nativeBinding?.NativeWebSocketServer !== undefined,
    objectPool: nativeBinding?.ObjectPool !== undefined,
    lruCache: nativeBinding?.LRUCache !== undefined,
    middlewareChain: nativeBinding?.MiddlewareChain !== undefined,
    hashFunctions: nativeBinding?.HashFunctions !== undefined,
    stringEncoder: nativeBinding?.StringEncoder !== undefined,
    fileOperations: nativeBinding?.FileOperations !== undefined,
    streamProcessor: nativeBinding?.StreamProcessor !== undefined,
    compressionEngine: nativeBinding?.CompressionEngine !== undefined,
    rateLimiter: nativeBinding?.RateLimiter !== undefined,
    protocolBuffers: nativeBinding?.ProtocolBuffers !== undefined,
    validationEngine: nativeBinding?.ValidationEngine !== undefined,
    threadPool: nativeBinding?.ThreadPool !== undefined,
    error: nativeBindingError === null ? undefined : nativeBindingError
  };
}

/**
 * Load native binding module
 */
export function loadNativeBinding(): any {
  // Skip if already loaded
  if (nativeBindingAttempted) {
    return nativeBinding;
  }

  // Skip if disabled
  if (!nativeOptions.enabled) {
    if (nativeOptions.verbose) {
      console.log('Native modules are disabled in configuration options');
    }
    nativeBindingAttempted = true;
    return null;
  }

  // Mark as attempted
  nativeBindingAttempted = true;

  try {
    // Custom path provided in options
    if (nativeOptions.modulePath) {
      loadCustomNativeModule(nativeOptions);
    } else {
      // Auto-detect module
      nativeBinding = safeLoadNativeBinding();
      if (nativeBinding) {
        nativeModuleStatus.loaded = true;
      }
    }

    // Initialize component status if module loaded
    initializeNativeModuleStatus();
  } catch (err: any) {
    nativeModuleStatus.error = err.message;
    if (nativeOptions.verbose) {
      console.error('Error loading native modules:', err);
    }
  }

  return nativeBinding;
}

/**
 * Helper function to load a native module from a custom path
 */
function loadCustomNativeModule(options: NativeModuleOptions): void {
  if (existsSync(options.modulePath!)) {
    try {
      // Use the safer loader
      nativeBinding = safeLoadNativeBinding(options.modulePath!);
      if (nativeBinding) {
        nativeModuleStatus.loaded = true;
      }
    } catch (err: any) {
      nativeModuleStatus.error = err.message;
      if (options.verbose) {
        console.error(`Failed to load native binding from ${options.modulePath}:`, err);
      }
    }
  } else if (options.verbose) {
    console.error(`Native module path not found: ${options.modulePath}`);
  }
}

/**
 * Helper function to initialize native module status
 */
function initializeNativeModuleStatus(): void {
  if (nativeBinding) {
    nativeModuleStatus.httpParser = Boolean(nativeBinding.HttpParser);
    nativeModuleStatus.radixRouter = Boolean(nativeBinding.RadixRouter);
    nativeModuleStatus.jsonProcessor = Boolean(nativeBinding.JsonProcessor);
    nativeModuleStatus.urlParser = Boolean(nativeBinding.parse && nativeBinding.parseQueryString);
    nativeModuleStatus.schemaValidator = Boolean(nativeBinding.validate && nativeBinding.compileSchema);
    nativeModuleStatus.compression = Boolean(nativeBinding.compress && nativeBinding.decompress);
    nativeModuleStatus.lruCache = Boolean(nativeBinding.LRUCache);
    nativeModuleStatus.webSocket = Boolean(nativeBinding.NativeWebSocketServer);
    nativeModuleStatus.objectPool = Boolean(nativeBinding.ObjectPool);

    if (nativeOptions.verbose) {
      console.log('Native modules loaded successfully');
      console.log('Available components:', JSON.stringify(nativeModuleStatus, null, 2));
    }
  } else if (nativeOptions.verbose) {
    console.log('Native modules not available, using JavaScript fallbacks');
  }
}

/**
 * HTTP Parser class that automatically chooses between native and JS implementations
 */
export class HttpParser implements NativeHttpParser {
  private parser: any;
  private useNative: boolean;
  private jsParser: JsHttpParser | null = null;

  // Performance metrics
  private static jsParseTime = 0;
  private static jsParseCount = 0;
  private static nativeParseTime = 0;
  private static nativeParseCount = 0;

  constructor() {
    const nativeModule = loadNativeBinding();
    this.useNative = Boolean(nativeModule?.HttpParser && nativeOptions.enabled);

    if (this.useNative) {
      try {
        this.parser = new nativeModule.HttpParser();
      } catch (err: any) {
        if (nativeOptions.verbose) {
          Logger.warn(`Failed to create native HTTP parser: ${err.message}`);
        }
        this.useNative = false;
      }
    }

    if (!this.useNative) {
      // Use JavaScript fallback
      this.jsParser = new JsHttpParser();
    }
  }

  /**
   * Parse an HTTP request
   * @param buffer The HTTP request buffer
   * @returns Parsed HTTP request
   */
  parse(buffer: Buffer): HttpParseResult {
    const start = performance.now();
    let result: HttpParseResult;

    if (this.useNative && this.parser) {
      result = this.parser.parseRequest(buffer);
      HttpParser.nativeParseTime += performance.now() - start;
      HttpParser.nativeParseCount++;
    } else if (this.jsParser) {
      result = this.jsParser.parse(buffer);
      HttpParser.jsParseTime += performance.now() - start;
      HttpParser.jsParseCount++;
    } else {
      throw new Error('No HTTP parser implementation available');
    }

    return result;
  }

  /**
   * Parse HTTP headers from a buffer
   * @param buffer Buffer containing HTTP headers
   * @returns Parsed headers
   */
  parseHeaders(buffer: Buffer): Record<string, string> {
    if (this.useNative && this.parser) {
      return this.parser.parseHeaders(buffer);
    } else if (this.jsParser) {
      return this.jsParser.parseHeaders(buffer);
    }
    throw new Error('No HTTP parser implementation available');
  }

  /**
   * Parse HTTP body from a buffer
   * @param buffer Buffer containing HTTP body
   * @param contentLength Expected content length
   * @returns Parsed body
   */
  parseBody(buffer: Buffer, contentLength: number): Buffer {
    if (this.useNative && this.parser) {
      return this.parser.parseBody(buffer, { contentLength });
    } else if (this.jsParser) {
      return this.jsParser.parseBody(buffer, contentLength);
    }
    throw new Error('No HTTP parser implementation available');
  }

  /**
   * Reset the parser state
   */
  reset(): void {
    if (this.useNative && this.parser) {
      this.parser.reset();
    } else if (this.jsParser) {
      this.jsParser.reset();
    }
  }

  /**
   * Get performance metrics for HTTP parsing
   * @returns Performance metrics
   */
  static getPerformanceMetrics(): {
    jsTime: number;
    jsCount: number;
    nativeTime: number;
    nativeCount: number;
  } {
    return {
      jsTime: HttpParser.jsParseTime,
      jsCount: HttpParser.jsParseCount,
      nativeTime: HttpParser.nativeParseTime,
      nativeCount: HttpParser.nativeParseCount
    };
  }

  /**
   * Reset performance metrics
   */
  static resetPerformanceMetrics(): void {
    HttpParser.jsParseTime = 0;
    HttpParser.jsParseCount = 0;
    HttpParser.nativeParseTime = 0;
    HttpParser.nativeParseCount = 0;
  }
}

/**
 * Radix Router Interface
 */
export interface RouteMatch {
  found: boolean;
  params: Record<string, string>;
  handler?: any;
}

/**
 * Radix Router class that automatically chooses between native and JS implementations
 */
export class RadixRouter {
  private router: any;
  private useNative: boolean;
  private jsRouter: JsRadixRouter | null = null;

  // Performance metrics
  private static jsFindTime = 0;
  private static jsFindCount = 0;
  private static nativeFindTime = 0;
  private static nativeFindCount = 0;

  constructor(options?: { maxCacheSize?: number }) {
    const nativeModule = loadNativeBinding();
    this.useNative = Boolean(nativeModule?.RadixRouter && nativeOptions.enabled);

    if (this.useNative) {
      try {
        // Use maxCacheSize from nativeOptions if not provided in constructor options
        const maxCacheSize = options?.maxCacheSize ?? nativeOptions.maxCacheSize ?? 1000;
        this.router = new nativeModule.RadixRouter({ maxCacheSize });
      } catch (err: any) {
        if (nativeOptions.verbose) {
          Logger.warn(`Failed to create native radix router: ${err.message}`);
        }
        this.useNative = false;
      }
    }

    if (!this.useNative) {
      // Use JavaScript fallback
      this.jsRouter = new JsRadixRouter();
    }
  }

  /**
   * Add a route to the router
   * @param method HTTP method
   * @param path Route path
   * @param handler Route handler
   * @returns This router instance for chaining
   */
  add(method: string, path: string, handler: any): this {
    if (this.useNative && this.router) {
      this.router.add(method, path, handler);
    } else if (this.jsRouter) {
      this.jsRouter.addRoute(method as HttpMethod, path, handler);
    } else {
      throw new Error('No router implementation available');
    }
    return this;
  }

  /**
   * Find a route handler
   * @param method HTTP method
   * @param path Request path
   * @returns Route match result
   */
  find(method: string, path: string): RouteMatch {
    const start = performance.now();
    let result: RouteMatch;

    if (this.useNative && this.router) {
      const nativeResult = this.router.find(method, path);
      result = {
        found: nativeResult.found,
        params: nativeResult.params,
        ...(nativeResult.found ? { handler: nativeResult.handler } : {})
      };
      RadixRouter.nativeFindTime += performance.now() - start;
      RadixRouter.nativeFindCount++;
    } else if (this.jsRouter) {
      const jsResult = this.jsRouter.findRoute(method as HttpMethod, path);
      result = {
        found: jsResult.found,
        params: jsResult.params,
        ...(jsResult.found ? { handler: jsResult.handler } : {})
      };
      RadixRouter.jsFindTime += performance.now() - start;
      RadixRouter.jsFindCount++;
    } else {
      throw new Error('No router implementation available');
    }

    return result;
  }

  /**
   * Remove a route from the router
   * @param method HTTP method
   * @param path Route path
   * @returns True if the route was removed, false if it didn't exist
   */
  remove(method: string, path: string): boolean {
    if (this.useNative && this.router) {
      return this.router.remove(method, path);
    } else if (this.jsRouter) {
      // Normalize path for JS implementation
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;

      // Find the key format used in the JS implementation
      const key = `${method}:${normalizedPath}`;

      // Check if the route exists before attempting removal
      const routes = (this.jsRouter as any).routes;
      if (routes && routes instanceof Map && routes.has(key)) {
        routes.delete(key);
        return true;
      }
      return false;
    }
    return false;
  }

  /**
   * Get performance metrics for route finding
   * @returns Performance metrics
   */
  static getPerformanceMetrics(): {
    jsTime: number;
    jsCount: number;
    nativeTime: number;
    nativeCount: number;
  } {
    return {
      jsTime: RadixRouter.jsFindTime,
      jsCount: RadixRouter.jsFindCount,
      nativeTime: RadixRouter.nativeFindTime,
      nativeCount: RadixRouter.nativeFindCount
    };
  }

  /**
   * Reset performance metrics
   */
  static resetPerformanceMetrics(): void {
    RadixRouter.jsFindTime = 0;
    RadixRouter.jsFindCount = 0;
    RadixRouter.nativeFindTime = 0;
    RadixRouter.nativeFindCount = 0;
  }
}

/**
 * JSON Processor Interface
 */
export class JsonProcessor {
  private processor: any;
  private useNative: boolean;

  // Performance metrics
  private static jsParseTime = 0;
  private static jsParseCount = 0;
  private static jsStringifyTime = 0;
  private static jsStringifyCount = 0;
  private static nativeParseTime = 0;
  private static nativeParseCount = 0;
  private static nativeStringifyTime = 0;
  private static nativeStringifyCount = 0;

  constructor() {
    const nativeModule = loadNativeBinding();
    this.useNative = Boolean(nativeModule?.JsonProcessor && nativeOptions.enabled);

    if (this.useNative) {
      try {
        this.processor = new nativeModule.JsonProcessor();
      } catch (err: any) {
        if (nativeOptions.verbose) {
          Logger.warn(`Failed to create native JSON processor: ${err.message}`);
        }
        this.useNative = false;
      }
    }
  }

  /**
   * Parse JSON
   * @param json JSON string or buffer
   * @returns Parsed JavaScript value
   */
  parse(json: string | Buffer): any {
    const start = performance.now();
    let result: any;

    if (this.useNative && this.processor) {
      if (typeof json === 'string') {
        result = this.processor.parse(json);
      } else {
        result = this.processor.parseBuffer(json);
      }
      JsonProcessor.nativeParseTime += performance.now() - start;
      JsonProcessor.nativeParseCount++;
    } else {
      // JavaScript fallback implementation
      result = JSON.parse(typeof json === 'string' ? json : json.toString());
      JsonProcessor.jsParseTime += performance.now() - start;
      JsonProcessor.jsParseCount++;
    }

    return result;
  }

  /**
   * Stringify a JavaScript value
   * @param value Value to stringify
   * @returns JSON string
   */
  stringify(value: any): string {
    const start = performance.now();
    let result: string;

    if (this.useNative && this.processor) {
      result = this.processor.stringify(value);
      JsonProcessor.nativeStringifyTime += performance.now() - start;
      JsonProcessor.nativeStringifyCount++;
    } else {
      // JavaScript fallback implementation
      result = JSON.stringify(value);
      JsonProcessor.jsStringifyTime += performance.now() - start;
      JsonProcessor.jsStringifyCount++;
    }

    return result;
  }

  /**
   * Parse a JSON stream
   * @param buffer Buffer containing JSON data
   * @returns Array of parsed objects
   */
  parseStream(buffer: Buffer): any[] {
    if (this.useNative && this.processor) {
      return this.processor.parseStream(buffer);
    } else {
      // Simple JavaScript fallback implementation
      const jsonStr = buffer.toString();
      const jsonLines = jsonStr.split('\n').filter(line => line.trim());
      return jsonLines.map(line => JSON.parse(line));
    }
  }

  /**
   * Stringify multiple values for streaming
   * @param values Array of values to stringify
   * @returns JSON string with newlines between values
   */
  stringifyStream(values: any[]): string {
    if (this.useNative && this.processor) {
      return this.processor.stringifyStream(values);
    } else {
      // JavaScript fallback implementation
      return values.map(v => JSON.stringify(v)).join('\n');
    }
  }

  /**
   * Get performance metrics for JSON processing
   * @returns Performance metrics
   */
  static getPerformanceMetrics(): {
    jsParseTime: number;
    jsParseCount: number;
    jsStringifyTime: number;
    jsStringifyCount: number;
    nativeParseTime: number;
    nativeParseCount: number;
    nativeStringifyTime: number;
    nativeStringifyCount: number;
  } {
    return {
      jsParseTime: JsonProcessor.jsParseTime,
      jsParseCount: JsonProcessor.jsParseCount,
      jsStringifyTime: JsonProcessor.jsStringifyTime,
      jsStringifyCount: JsonProcessor.jsStringifyCount,
      nativeParseTime: JsonProcessor.nativeParseTime,
      nativeParseCount: JsonProcessor.nativeParseCount,
      nativeStringifyTime: JsonProcessor.nativeStringifyTime,
      nativeStringifyCount: JsonProcessor.nativeStringifyCount
    };
  }

  /**
   * Reset performance metrics
   */
  static resetPerformanceMetrics(): void {
    JsonProcessor.jsParseTime = 0;
    JsonProcessor.jsParseCount = 0;
    JsonProcessor.jsStringifyTime = 0;
    JsonProcessor.jsStringifyCount = 0;
    JsonProcessor.nativeParseTime = 0;
    JsonProcessor.nativeParseCount = 0;
    JsonProcessor.nativeStringifyTime = 0;
    JsonProcessor.nativeStringifyCount = 0;
  }
}

/**
 * URL Parser implementation
 */
export class UrlParser {
  private parser: any;
  private useNative: boolean;

  constructor() {
    if (nativeBinding && nativeBinding.parse) {
      this.parser = nativeBinding;
      this.useNative = true;
    } else {
      this.useNative = false;
    }
  }

  parse(url: string): {
    protocol: string;
    auth: string;
    hostname: string;
    port: string;
    pathname: string;
    search: string;
    hash: string;
  } {
    if (this.useNative) {
      const start = performance.now();
      const result = this.parser.parse(url);
      const end = performance.now();
      UrlParser.nativeParseTime += end - start;
      UrlParser.nativeParseCount++;
      return result;
    } else {
      // Fallback to URL API
      const start = performance.now();
      try {
        const parsedUrl = new URL(url);
        const result = {
          protocol: parsedUrl.protocol.replace(/:$/, ''),
          auth:
            parsedUrl.username && parsedUrl.password
              ? `${parsedUrl.username}:${parsedUrl.password}`
              : parsedUrl.username || '',
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          pathname: parsedUrl.pathname,
          search: parsedUrl.search.replace(/^\?/, ''),
          hash: parsedUrl.hash.replace(/^#/, '')
        };
        const end = performance.now();
        UrlParser.jsParseTime += end - start;
        UrlParser.jsParseCount++;
        return result;
      } catch (_err) {
        const end = performance.now();
        UrlParser.jsParseTime += end - start;
        UrlParser.jsParseCount++;
        return {
          protocol: '',
          auth: '',
          hostname: '',
          port: '',
          pathname: '',
          search: '',
          hash: ''
        };
      }
    }
  }

  parseQueryString(queryString: string): Record<string, string> {
    if (this.useNative) {
      const start = performance.now();
      const result = this.parser.parseQueryString(queryString);
      const end = performance.now();
      UrlParser.nativeParseTime += end - start;
      UrlParser.nativeParseCount++;
      return result;
    } else {
      // Fallback to URLSearchParams
      const start = performance.now();
      const params: Record<string, string> = {};
      const searchParams = new URLSearchParams(queryString);
      searchParams.forEach((value, key) => {
        params[key] = value;
      });
      const end = performance.now();
      UrlParser.jsParseTime += end - start;
      UrlParser.jsParseCount++;
      return params;
    }
  }

  // Performance metrics
  private static jsParseTime = 0;
  private static jsParseCount = 0;
  private static nativeParseTime = 0;
  private static nativeParseCount = 0;

  static getPerformanceMetrics(): {
    jsTime: number;
    jsCount: number;
    nativeTime: number;
    nativeCount: number;
  } {
    return {
      jsTime: UrlParser.jsParseTime,
      jsCount: UrlParser.jsParseCount,
      nativeTime: UrlParser.nativeParseTime,
      nativeCount: UrlParser.nativeParseCount
    };
  }

  static resetPerformanceMetrics(): void {
    UrlParser.jsParseTime = 0;
    UrlParser.jsParseCount = 0;
    UrlParser.nativeParseTime = 0;
    UrlParser.nativeParseCount = 0;
  }
}

// Schema Validator implementation
export class SchemaValidator {
  private validator: any;
  private useNative: boolean;
  private compiledSchemas: Map<string, any> = new Map();

  constructor() {
    if (nativeBinding && nativeBinding.validate) {
      this.validator = nativeBinding;
      this.useNative = true;
    } else {
      this.useNative = false;
    }
  }

  /**
   * Validate data against a schema
   * @param schema The JSON schema to validate against
   * @param data The data to validate
   * @returns Validation result with errors if any
   */
  validate(
    schema: object,
    data: any
  ): { valid: boolean; errors: { path: string; message: string }[] } {
    if (this.useNative) {
      const start = performance.now();
      const result = this.validator.validate(schema, data);
      const end = performance.now();
      SchemaValidator.nativeValidateTime += end - start;
      SchemaValidator.nativeValidateCount++;
      return result;
    } else {
      // Simple JS fallback implementation
      const start = performance.now();
      const errors: { path: string; message: string }[] = [];
      this.validateValue(schema, data, '$', errors);
      const valid = errors.length === 0;
      const end = performance.now();
      SchemaValidator.jsValidateTime += end - start;
      SchemaValidator.jsValidateCount++;
      return { valid, errors };
    }
  }

  /**
   * Validate partial updates against an existing object
   * @param schema The JSON schema for the entire object
   * @param data The existing data object
   * @param updates The partial updates to apply and validate
   * @returns Validation result
   */
  validatePartial(
    schema: object,
    data: object,
    updates: object
  ): { valid: boolean; errors: { path: string; message: string }[] } {
    if (this.useNative && this.validator.validatePartial) {
      const start = performance.now();
      const result = this.validator.validatePartial(schema, data, updates);
      const end = performance.now();
      SchemaValidator.nativeValidateTime += end - start;
      SchemaValidator.nativeValidateCount++;
      return result;
    } else {
      // Fallback: merge updates into data and validate
      const start = performance.now();
      const mergedData = { ...data, ...updates };
      const errors: { path: string; message: string }[] = [];
      this.validateValue(schema, mergedData, '$', errors);
      const end = performance.now();
      SchemaValidator.jsValidateTime += end - start;
      SchemaValidator.jsValidateCount++;
      const valid = errors.length === 0;
      return { valid, errors };
    }
  }

  /**
   * Compile a schema for faster validation
   * @param schema The schema to compile
   * @returns A reference to the compiled schema
   */
  compileSchema(schema: object): { id: string; hash: string; version: number } {
    if (this.useNative && this.validator.compileSchema) {
      const start = performance.now();
      const compiled = this.validator.compileSchema(schema);
      const end = performance.now();
      SchemaValidator.nativeCompileTime += end - start;
      SchemaValidator.nativeCompileCount++;

      // Store in local cache
      const key = compiled.id ? `${compiled.id}:${compiled.hash}` : compiled.hash;
      this.compiledSchemas.set(key, compiled);

      return compiled;
    } else {
      // No compilation in JS fallback, return empty reference
      return { id: '', hash: '', version: 0 };
    }
  }

  /**
   * Clear the schema cache
   */
  clearCache(): void {
    if (this.useNative && this.validator.clearCache) {
      this.validator.clearCache();
    }
    this.compiledSchemas.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    cacheSize: number;
    cacheHits: number;
    cacheMisses: number;
    cacheEvictions: number;
    hitRatio: number;
    totalValidations: number;
    generationTime: number;
    validationTime: number;
  } {
    if (this.useNative && this.validator.getCacheStats) {
      return this.validator.getCacheStats();
    } else {
      return {
        cacheSize: 0,
        cacheHits: 0,
        cacheMisses: 0,
        cacheEvictions: 0,
        hitRatio: 0,
        totalValidations: SchemaValidator.jsValidateCount,
        generationTime: 0,
        validationTime: SchemaValidator.jsValidateTime
      };
    }
  }

  // Simple validation implementation for fallback
  private validateValue(
    schema: any,
    value: any,
    path: string,
    errors: { path: string; message: string }[]
  ): boolean {
    // Basic type validation
    if (!this.validateType(schema, value, path, errors)) {
      return false;
    }

    // Type-specific validations
    if (schema.type === 'string' && typeof value === 'string') {
      this.validateString(schema, value, path, errors);
    } else if (schema.type === 'number' && typeof value === 'number') {
      this.validateNumber(schema, value, path, errors);
    } else if (
      schema.type === 'object' &&
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      this.validateObject(schema, value, path, errors);
    } else if (schema.type === 'array' && Array.isArray(value)) {
      this.validateArray(schema, value, path, errors);
    }

    return errors.length === 0;
  }

  /**
   * Validate the type of a value
   * @private
   */
  private validateType(
    schema: any,
    value: any,
    path: string,
    errors: { path: string; message: string }[]
  ): boolean {
    if (!schema.type) {
      return true;
    }

    const type = typeof value;
    if (schema.type === 'array' && !Array.isArray(value)) {
      errors.push({ path, message: 'Expected array' });
      return false;
    } else if (
      schema.type === 'object' &&
      (typeof value !== 'object' || Array.isArray(value) || value === null)
    ) {
      errors.push({ path, message: 'Expected object' });
      return false;
    } else if (schema.type === 'string' && type !== 'string') {
      errors.push({ path, message: 'Expected string' });
      return false;
    } else if (schema.type === 'number' && type !== 'number') {
      errors.push({ path, message: 'Expected number' });
      return false;
    } else if (schema.type === 'boolean' && type !== 'boolean') {
      errors.push({ path, message: 'Expected boolean' });
      return false;
    } else if (schema.type === 'null' && value !== null) {
      errors.push({ path, message: 'Expected null' });
      return false;
    }

    return true;
  }

  /**
   * Validate string values
   * @private
   */
  private validateString(
    schema: any,
    value: string,
    path: string,
    errors: { path: string; message: string }[]
  ): void {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({ path, message: 'String too short' });
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({ path, message: 'String too long' });
    }
  }

  /**
   * Validate number values
   * @private
   */
  private validateNumber(
    schema: any,
    value: number,
    path: string,
    errors: { path: string; message: string }[]
  ): void {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({ path, message: 'Number too small' });
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({ path, message: 'Number too large' });
    }
  }

  /**
   * Validate object values
   * @private
   */
  private validateObject(
    schema: any,
    value: object,
    path: string,
    errors: { path: string; message: string }[]
  ): void {
    // Check required properties
    this.validateRequiredProperties(schema, value, path, errors);

    // Validate properties
    this.validateObjectProperties(schema, value, path, errors);

    // Check additionalProperties
    this.validateAdditionalProperties(schema, value, path, errors);
  }

  /**
   * Validate required properties of an object
   * @private
   */
  private validateRequiredProperties(
    schema: any,
    value: any,
    path: string,
    errors: { path: string; message: string }[]
  ): void {
    if (schema.required && Array.isArray(schema.required)) {
      for (const prop of schema.required) {
        if (!(prop in value)) {
          errors.push({ path: `${path}.${prop}`, message: 'Required property missing' });
        }
      }
    }
  }

  /**
   * Validate properties of an object
   * @private
   */
  private validateObjectProperties(
    schema: any,
    value: any,
    path: string,
    errors: { path: string; message: string }[]
  ): void {
    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if (propName in value) {
          this.validateValue(propSchema, value[propName], `${path}.${propName}`, errors);
        }
      }
    }
  }

  /**
   * Validate additional properties of an object
   * @private
   */
  private validateAdditionalProperties(
    schema: any,
    value: any,
    path: string,
    errors: { path: string; message: string }[]
  ): void {
    if (schema.additionalProperties === false) {
      const propertyNames = Object.keys(value);
      const schemaProperties = schema.properties ? Object.keys(schema.properties) : [];
      for (const prop of propertyNames) {
        if (!schemaProperties.includes(prop)) {
          errors.push({ path: `${path}.${prop}`, message: 'Additional property not allowed' });
        }
      }
    }
  }

  /**
   * Validate array values
   * @private
   */
  private validateArray(
    schema: any,
    value: any[],
    path: string,
    errors: { path: string; message: string }[]
  ): void {
    // Validate array length
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({ path, message: 'Array too short' });
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({ path, message: 'Array too long' });
    }

    // Validate array items
    if (schema.items) {
      for (let i = 0; i < value.length; i++) {
        this.validateValue(schema.items, value[i], `${path}[${i}]`, errors);
      }
    }
  }

  // Performance metrics
  private static jsValidateTime = 0;
  private static jsValidateCount = 0;
  private static nativeValidateTime = 0;
  private static nativeValidateCount = 0;
  private static nativeCompileTime = 0;
  private static nativeCompileCount = 0;

  static getPerformanceMetrics(): {
    jsTime: number;
    jsCount: number;
    nativeTime: number;
    nativeCount: number;
    nativeCompileTime: number;
    nativeCompileCount: number;
  } {
    return {
      jsTime: SchemaValidator.jsValidateTime,
      jsCount: SchemaValidator.jsValidateCount,
      nativeTime: SchemaValidator.nativeValidateTime,
      nativeCount: SchemaValidator.nativeValidateCount,
      nativeCompileTime: SchemaValidator.nativeCompileTime,
      nativeCompileCount: SchemaValidator.nativeCompileCount
    };
  }

  static resetPerformanceMetrics(): void {
    SchemaValidator.jsValidateTime = 0;
    SchemaValidator.jsValidateCount = 0;
    SchemaValidator.nativeValidateTime = 0;
    SchemaValidator.nativeValidateCount = 0;
    SchemaValidator.nativeCompileTime = 0;
    SchemaValidator.nativeCompileCount = 0;
  }
}

// Compression implementation
export class Compression {
  private compressor: any;
  private useNative: boolean;

  constructor() {
    if (nativeBinding && nativeBinding.compress) {
      this.compressor = nativeBinding;
      this.useNative = true;
    } else {
      this.useNative = false;
    }
  }

  compress(data: Buffer | string, level = 6): Buffer {
    if (this.useNative) {
      const start = performance.now();
      const result = this.compressor.compress(data, level);
      const end = performance.now();
      Compression.nativeCompressTime += end - start;
      Compression.nativeCompressCount++;
      return result;
    } else {
      // Fallback to zlib (slower)
      const start = performance.now();
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const zlib = require('node:zlib');
        const buffer = typeof data === 'string' ? Buffer.from(data) : data;
        const result = zlib.gzipSync(buffer, { level });
        const end = performance.now();
        Compression.jsCompressTime += end - start;
        Compression.jsCompressCount++;
        return result;
      } catch (err) {
        const end = performance.now();
        Compression.jsCompressTime += end - start;
        Compression.jsCompressCount++;
        throw err;
      }
    }
  }

  decompress(data: Buffer, asString = false): Buffer | string {
    if (this.useNative) {
      const start = performance.now();
      const result = this.compressor.decompress(data, asString);
      const end = performance.now();
      Compression.nativeDecompressTime += end - start;
      Compression.nativeDecompressCount++;
      return result;
    } else {
      // Fallback to zlib (slower)
      const start = performance.now();
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const zlib = require('node:zlib');
        const result = zlib.gunzipSync(data);
        const end = performance.now();
        Compression.jsDecompressTime += end - start;
        Compression.jsDecompressCount++;
        return asString ? result.toString() : result;
      } catch (err) {
        const end = performance.now();
        Compression.jsDecompressTime += end - start;
        Compression.jsDecompressCount++;
        throw err;
      }
    }
  }

  // Performance metrics
  private static jsCompressTime = 0;
  private static jsCompressCount = 0;
  private static nativeCompressTime = 0;
  private static nativeCompressCount = 0;
  private static jsDecompressTime = 0;
  private static jsDecompressCount = 0;
  private static nativeDecompressTime = 0;
  private static nativeDecompressCount = 0;

  static getPerformanceMetrics(): {
    jsCompressTime: number;
    jsCompressCount: number;
    nativeCompressTime: number;
    nativeCompressCount: number;
    jsDecompressTime: number;
    jsDecompressCount: number;
    nativeDecompressTime: number;
    nativeDecompressCount: number;
  } {
    return {
      jsCompressTime: Compression.jsCompressTime,
      jsCompressCount: Compression.jsCompressCount,
      nativeCompressTime: Compression.nativeCompressTime,
      nativeCompressCount: Compression.nativeCompressCount,
      jsDecompressTime: Compression.jsDecompressTime,
      jsDecompressCount: Compression.jsDecompressCount,
      nativeDecompressTime: Compression.nativeDecompressTime,
      nativeDecompressCount: Compression.nativeDecompressCount
    };
  }

  static resetPerformanceMetrics(): void {
    Compression.jsCompressTime = 0;
    Compression.jsCompressCount = 0;
    Compression.nativeCompressTime = 0;
    Compression.nativeCompressCount = 0;
    Compression.jsDecompressTime = 0;
    Compression.jsDecompressCount = 0;
    Compression.nativeDecompressTime = 0;
    Compression.nativeDecompressCount = 0;
  }
}

/**
 * WebSocket Server
 * High-performance WebSocket server implementation using native C++ modules
 */
export class WebSocketServer extends EventEmitter {
  private nativeServer: any;
  private logger: Logger;
  private isRunning: boolean = false;
  private connections: Map<number, WebSocketConnection> = new Map();
  private authOptions: WebSocketAuthOptions;
  private heartbeatOptions: WebSocketHeartbeatOptions;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private serverOptions: WebSocketServerOptions;

  // Add static reference to the native module
  private static nativeModule = loadNativeBinding()?.NativeWebSocketServer;

  // Add static performance metrics
  private static nativeTime = 0;
  private static nativeCount = 0;

  /**
   * Create a new WebSocket server
   * @param httpServer The HTTP server to attach to
   * @param options WebSocket server options
   */
  constructor(
    private httpServer: HttpServer,
    options: WebSocketServerOptions = {}
  ) {
    super();
    this.logger = new Logger();

    // Default options
    this.serverOptions = options;

    // Set up authentication options
    this.authOptions = {
      required: false,
      timeout: 10000,
      handler: async (): Promise<any> => null,
      ...options.auth
    };

    // Set up heartbeat options
    this.heartbeatOptions = {
      enabled: true,
      interval: 30000,
      timeout: 10000,
      ...options.heartbeat
    };

    // Try to load native module
    const nativeModule = loadNativeBinding();

    if (!nativeModule?.NativeWebSocketServer) {
      throw new Error('Native WebSocket module not available');
    }

    // Create native server instance
    this.nativeServer = new nativeModule.NativeWebSocketServer({
      onConnection: this.handleConnection.bind(this),
      onMessage: this.handleMessage.bind(this),
      onBinaryMessage: this.handleBinaryMessage.bind(this),
      onDisconnect: this.handleDisconnect.bind(this),
      onError: this.handleError.bind(this),
      onRoomJoin: this.handleRoomJoin.bind(this),
      onRoomLeave: this.handleRoomLeave.bind(this),
      onPong: this.handlePong.bind(this)
    });
  }

  /**
   * Start the WebSocket server
   * @param port The port to listen on (optional, uses HTTP server port if not provided)
   */
  start(port?: number): void {
    if (this.isRunning) return;

    try {
      this.nativeServer.start({
        server: this.httpServer,
        port
      });

      this.isRunning = true;
      this.logger.info('Native WebSocket server started');

      // Start heartbeat mechanism if enabled
      if (this.heartbeatOptions.enabled) {
        this.startHeartbeat();
      }
    } catch (error) {
      this.logger.error('Failed to start native WebSocket server:', error);
      throw error;
    }
  }

  /**
   * Stop the WebSocket server
   */
  stop(): void {
    if (!this.isRunning) return;

    try {
      // Stop heartbeat timer
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }

      this.nativeServer.stop();
      this.isRunning = false;
      this.logger.info('Native WebSocket server stopped');
    } catch (error) {
      this.logger.error('Failed to stop native WebSocket server:', error);
      throw error;
    }
  }

  /**
   * Broadcast a message to all connected clients
   * @param message The message to broadcast
   * @param exclude Connection to exclude from broadcast
   */
  broadcast(message: string | object, exclude?: WebSocketConnection): void {
    const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
    this.nativeServer.broadcast(messageStr, exclude ? (exclude as any).id : undefined);
  }

  /**
   * Broadcast a binary message to all connected clients
   * @param data The binary data to broadcast
   * @param exclude Connection to exclude from broadcast
   */
  broadcastBinary(data: Buffer, exclude?: WebSocketConnection): void {
    this.nativeServer.broadcastBinary(data, exclude ? (exclude as any).id : undefined);
  }

  /**
   * Broadcast a message to all clients in a room
   * @param roomName The room to broadcast to
   * @param message The message to broadcast
   * @param exclude Connection to exclude from broadcast
   */
  broadcastToRoom(roomName: string, message: string | object, exclude?: WebSocketConnection): void {
    const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
    this.nativeServer.broadcastToRoom(
      roomName,
      messageStr,
      exclude ? (exclude as any).id : undefined
    );
  }

  /**
   * Broadcast a binary message to all clients in a room
   * @param roomName The room to broadcast to
   * @param data The binary data to broadcast
   * @param exclude Connection to exclude from broadcast
   */
  broadcastBinaryToRoom(roomName: string, data: Buffer, exclude?: WebSocketConnection): void {
    this.nativeServer.broadcastBinaryToRoom(
      roomName,
      data,
      exclude ? (exclude as any).id : undefined
    );
  }

  /**
   * Get all room names
   * @returns Array of room names
   */
  getRooms(): string[] {
    return this.nativeServer.getRooms();
  }

  /**
   * Get the number of clients in a room
   * @param roomName The room name
   * @returns The number of clients in the room
   */
  getRoomSize(roomName: string): number {
    return this.nativeServer.getRoomSize(roomName);
  }

  /**
   * Get all connections in a room
   * @param roomName The room name
   * @returns Array of connections in the room
   */
  getRoomConnections(roomName: string): WebSocketConnection[] {
    const connectionIds = this.nativeServer.getRoomConnections(roomName);
    return connectionIds
      .map(id => this.connections.get(id))
      .filter(Boolean) as WebSocketConnection[];
  }

  /**
   * Get the total number of connections
   * @returns The total number of connections
   */
  getConnectionCount(): number {
    return this.nativeServer.getConnectionCount();
  }

  /**
   * Start the heartbeat mechanism
   * @private
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      this.checkConnections();
    }, this.heartbeatOptions.interval);

    this.logger.debug(`Heartbeat started with interval of ${this.heartbeatOptions.interval}ms`);
  }

  /**
   * Check all connections for activity
   * @private
   */
  private checkConnections(): void {
    const now = Date.now();
    const timeout = this.heartbeatOptions.timeout;

    for (const [id, connection] of this.connections.entries()) {
      // Skip check if connection was recently active
      if (now - connection.lastHeartbeat < this.heartbeatOptions.interval) {
        continue;
      }

      // Check if connection timed out
      if (now - connection.lastHeartbeat > timeout) {
        this.logger.debug(`Connection ${id} timed out, closing`);
        connection.close(1001, 'Connection timeout');
        continue;
      }

      // Send ping to check if connection is alive
      try {
        connection.ping();
      } catch (err) {
        this.logger.debug(`Failed to ping connection ${id}: ${err}`);
      }
    }
  }

  /**
   * Authenticate a WebSocket connection
   * @param connection The connection to authenticate
   * @param token The authentication token
   */
  async authenticateConnection(connection: WebSocketConnection, token: string): Promise<boolean> {
    try {
      // Call the authentication handler
      const user = await this.authOptions.handler(token, connection);

      if (user) {
        connection.isAuthenticated = true;
        connection.user = user;

        // Emit authenticated event
        this.emit('authenticated', { connection, user });

        return true;
      }

      return false;
    } catch (error) {
      this.logger.error('Authentication error:', error);
      return false;
    }
  }

  /**
   * Handle a pong response from a client
   * @param data The data from the native module
   */
  private handlePong(data: any): void {
    const { id } = data;
    const connection = this.connections.get(id);

    if (connection) {
      connection.lastHeartbeat = Date.now();
      connection.isAlive = true;
    }
  }

  /**
   * Handle a new connection
   * @param data The data from the native module
   */
  private handleConnection(data: any): void {
    const { id } = data;
    const now = Date.now();

    // Create connection wrapper
    const connection: WebSocketConnection = {
      id,
      send: (message: string | object) => {
        const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
        this.nativeServer.send(id, messageStr);
      },
      sendBinary: (data: Buffer) => {
        this.nativeServer.sendBinary(id, data);
      },
      close: (code?: number, reason?: string) => {
        this.nativeServer.closeConnection(id, code, reason);
      },
      joinRoom: (roomName: string) => {
        this.nativeServer.joinRoom(id, roomName);
      },
      leaveRoom: (roomName: string) => {
        this.nativeServer.leaveRoom(id, roomName);
      },
      leaveAllRooms: () => {
        this.nativeServer.leaveAllRooms(id);
      },
      isInRoom: (roomName: string) => {
        return this.nativeServer.isInRoom(id, roomName);
      },
      getRooms: () => {
        return this.nativeServer.getConnectionRooms(id);
      },
      isAlive: true,
      isAuthenticated: false,
      data: {},
      lastHeartbeat: now,
      ping: () => {
        this.nativeServer.ping(id);
      }
    };

    // Store connection
    this.connections.set(id, connection);

    // Emit connection event
    this.emit('connection', { connection });

    // Set up authentication timeout if required
    if (this.authOptions.required) {
      const timeout = setTimeout(() => {
        // Check if the connection is still active but not authenticated
        const conn = this.connections.get(id);
        if (conn && !conn.isAuthenticated) {
          this.logger.debug(`Connection ${id} failed to authenticate within timeout, closing`);
          conn.close(1008, 'Authentication timeout');
        }
      }, this.authOptions.timeout);

      // Store timeout reference for cleanup
      connection.data.__authTimeout = timeout;
    }
  }

  /**
   * Handle a message from a client
   * @param data The data from the native module
   */
  private handleMessage(data: any): void {
    const { id, message } = data;
    const connection = this.connections.get(id);

    if (!connection) return;

    // Update heartbeat timestamp
    connection.lastHeartbeat = Date.now();

    try {
      const parsedMessage = typeof message === 'string' ? JSON.parse(message) : message;

      // Handle auth message type if not authenticated
      if (
        !connection.isAuthenticated &&
        this.authOptions.required &&
        parsedMessage.type === 'auth'
      ) {
        this.authenticateConnection(connection, parsedMessage.data.token).then(success => {
          // Clear authentication timeout
          if (connection.data.__authTimeout) {
            clearTimeout(connection.data.__authTimeout);
            delete connection.data.__authTimeout;
          }

          // Send auth response
          connection.send({
            type: 'auth:response',
            data: { success }
          });

          // Close connection if authentication failed
          if (!success) {
            connection.close(1008, 'Authentication failed');
          }
        });

        return;
      }

      // Require authentication if enabled
      if (this.authOptions.required && !connection.isAuthenticated) {
        connection.send({
          type: 'error',
          data: { message: 'Authentication required' }
        });
        return;
      }

      // Emit message event
      this.emit('message', {
        connection,
        message: parsedMessage
      });

      // Emit specific event type if available
      if (parsedMessage.type) {
        this.emit(parsedMessage.type, {
          connection,
          message: parsedMessage
        });
      }
    } catch (error) {
      this.logger.error('Error handling WebSocket message:', error);

      // Notify client of error
      connection.send({
        type: 'error',
        data: { message: 'Invalid message format' }
      });
    }
  }

  /**
   * Handle a binary message from a client
   * @param data The data from the native module
   */
  private handleBinaryMessage(data: any): void {
    const { id, binary } = data;
    const connection = this.connections.get(id);

    if (!connection) return;

    // Emit binary message event
    this.emit('binary', {
      connection,
      binary: Buffer.from(binary)
    });
  }

  /**
   * Handle a client disconnection
   * @param data The data from the native module
   */
  private handleDisconnect(data: any): void {
    const { id } = data;
    const connection = this.connections.get(id);

    if (!connection) return;

    // Emit disconnect event
    this.emit('disconnect', { connection });

    // Remove connection
    this.connections.delete(id);
  }

  /**
   * Handle an error
   * @param data The data from the native module
   */
  private handleError(data: any): void {
    const { id, error } = data;
    const connection = this.connections.get(id);

    // Emit error event
    this.emit('error', {
      connection,
      error: new Error(error)
    });
  }

  /**
   * Handle a room join
   * @param data The data from the native module
   */
  private handleRoomJoin(data: any): void {
    const { id, room } = data;
    const connection = this.connections.get(id);

    if (!connection) return;

    // Emit room join event
    this.emit('room:join', {
      connection,
      room
    });
  }

  /**
   * Handle a room leave
   * @param data The data from the native module
   */
  private handleRoomLeave(data: any): void {
    const { id, room } = data;
    const connection = this.connections.get(id);

    if (!connection) return;

    // Emit room leave event
    this.emit('room:leave', {
      connection,
      room
    });
  }

  /**
   * Set the authentication handler function for this server
   * @param handler The function to call when authenticating a connection
   */
  setAuthenticationHandler(
    handler: (token: string, connection: WebSocketConnection) => Promise<any>
  ): void {
    this.authOptions.handler = handler;
  }

  /**
   * Set heartbeat options for this server
   * @param options Heartbeat configuration options
   */
  setHeartbeatOptions(options: Partial<WebSocketHeartbeatOptions>): void {
    this.heartbeatOptions = { ...this.heartbeatOptions, ...options };

    // Restart heartbeat if needed
    if (this.isRunning && this.heartbeatOptions.enabled) {
      this.startHeartbeat();
    }
  }

  /**
   * Set the maximum number of clients per room
   * @param max Maximum number of clients per room (0 = unlimited)
   */
  setMaxClientsPerRoom(max: number): void {
    this.serverOptions.maxClientsPerRoom = max;
  }

  /**
   * Get connection by ID
   * @param id The connection ID
   */
  getConnection(id: number): WebSocketConnection | undefined {
    return this.connections.get(id);
  }

  /**
   * Get all connections
   */
  getAllConnections(): WebSocketConnection[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get message history for a room
   * @param roomName The room name
   * @returns Array of message strings
   */
  getRoomHistory(roomName: string): string[] {
    return this.nativeServer.getRoomHistory(roomName);
  }

  /**
   * Set maximum size for a room
   * @param roomName The room name
   * @param maxSize Maximum number of clients (0 = unlimited)
   */
  setMaxRoomSize(roomName: string, maxSize: number): void {
    this.nativeServer.setMaxRoomSize(roomName, maxSize);
  }

  /**
   * Set maximum number of connections
   * @param maxConnections Maximum number of connections (0 = unlimited)
   */
  setMaxConnections(maxConnections: number): void {
    this.nativeServer.setMaxConnections(maxConnections);
    this.serverOptions.maxConnections = maxConnections;
  }

  /**
   * Set whether a connection is authenticated
   * @param id The connection ID
   * @param authenticated Whether the connection is authenticated
   */
  setConnectionAuthenticated(id: number, authenticated: boolean): void {
    this.nativeServer.setAuthenticated(id, authenticated);

    const connection = this.connections.get(id);
    if (connection) {
      connection.isAuthenticated = authenticated;
    }
  }

  /**
   * Get connection statistics
   * @returns WebSocket connection statistics
   */
  getConnectionStats(): WebSocketConnectionStats {
    return this.nativeServer.getConnectionStats();
  }

  /**
   * Disconnect inactive connections
   * @param thresholdMs Inactivity threshold in milliseconds
   */
  disconnectInactiveConnections(thresholdMs: number): void {
    this.nativeServer.disconnectInactiveConnections(thresholdMs);
  }

  /**
   * Store a message in a room's history
   * @param roomName The room name
   * @param message The message to store
   * @param maxHistory Maximum history size (0 = unlimited)
   */
  storeRoomMessage(roomName: string, message: string | object, maxHistory: number = 100): void {
    const messageStr = typeof message === 'string' ? message : JSON.stringify(message);

    try {
      // Use direct storage via native module if possible
      if (this.nativeServer.storeRoomMessage) {
        this.nativeServer.storeRoomMessage(roomName, messageStr, maxHistory);
      }
    } catch (error) {
      this.logger.error('Error storing room message:', error);
    }
  }

  /**
   * Get all authenticated connections
   * @returns Array of authenticated connections
   */
  getAuthenticatedConnections(): WebSocketConnection[] {
    return Array.from(this.connections.values()).filter(conn => conn.isAuthenticated);
  }

  /**
   * Get authenticated connections in a room
   * @param roomName The room name
   * @returns Array of authenticated connections in the room
   */
  getAuthenticatedRoomConnections(roomName: string): WebSocketConnection[] {
    return this.getRoomConnections(roomName).filter(conn => conn.isAuthenticated);
  }

  /**
   * Get performance metrics for WebSocket server
   * @returns Performance metrics
   */
  static getPerformanceMetrics(): {
    nativeTime: number;
    nativeCount: number;
  } {
    // Check if the native module has getPerformanceMetrics method
    if (
      WebSocketServer.nativeModule &&
      typeof WebSocketServer.nativeModule.getPerformanceMetrics === 'function'
    ) {
      return {
        nativeTime: WebSocketServer.nativeModule.getPerformanceMetrics().nativeTime,
        nativeCount: WebSocketServer.nativeModule.getPerformanceMetrics().nativeCount
      };
    }

    // Return static metrics if native method is not available
    return {
      nativeTime: WebSocketServer.nativeTime,
      nativeCount: WebSocketServer.nativeCount
    };
  }

  /**
   * Reset performance metrics for WebSocket server
   */
  static resetPerformanceMetrics(): void {
    // Check if the native module has resetPerformanceMetrics method
    if (
      WebSocketServer.nativeModule &&
      typeof WebSocketServer.nativeModule.resetPerformanceMetrics === 'function'
    ) {
      WebSocketServer.nativeModule.resetPerformanceMetrics();
    } else {
      // Reset static metrics if native method is not available
      WebSocketServer.nativeTime = 0;
      WebSocketServer.nativeCount = 0;
    }
  }
}

/**
 * Reset all performance metrics
 */
export function resetAllPerformanceMetrics(): void {
  // Reset basic modules
  HttpParser.resetPerformanceMetrics();
  RadixRouter.resetPerformanceMetrics();
  JsonProcessor.resetPerformanceMetrics();
  UrlParser.resetPerformanceMetrics();
  SchemaValidator.resetPerformanceMetrics();
  Compression.resetPerformanceMetrics();
  WebSocketServer.resetPerformanceMetrics();
  ObjectPool.resetPerformanceMetrics();

  // Reset metrics for LRUCache
  try {
    if (nativeBinding && nativeModuleStatus.lruCache && nativeBinding.LRUCache) {
      nativeBinding.LRUCache.resetMetrics();
    }
  } catch (_e) { /* Ignore errors */ }

  // Reset metrics for MiddlewareChain
  try {
    if (nativeBinding && nativeModuleStatus.middlewareChain && nativeBinding.MiddlewareChain) {
      nativeBinding.MiddlewareChain.resetMetrics();
    }
  } catch (_e) { /* Ignore errors */ }

  // Reset metrics for HashFunctions
  try {
    if (nativeBinding && nativeModuleStatus.hashFunctions && nativeBinding.HashFunctions) {
      nativeBinding.HashFunctions.resetMetrics();
    }
  } catch (_e) { /* Ignore errors */ }

  // Reset metrics for StringEncoder
  try {
    if (nativeBinding && nativeModuleStatus.stringEncoder && nativeBinding.StringEncoder) {
      nativeBinding.StringEncoder.resetMetrics();
    }
  } catch (_e) { /* Ignore errors */ }

  // Reset metrics for FileOperations
  try {
    if (nativeBinding && nativeModuleStatus.fileOperations && nativeBinding.FileOperations) {
      nativeBinding.FileOperations.resetMetrics();
    }
  } catch (_e) { /* Ignore errors */ }

  // Reset metrics for new modules
  try {
    if (nativeBinding && nativeModuleStatus.streamProcessor && nativeBinding.StreamProcessor) {
      nativeBinding.StreamProcessor.resetMetrics();
    }
  } catch (_e) { /* Ignore errors */ }

  try {
    if (nativeBinding && nativeModuleStatus.compressionEngine && nativeBinding.CompressionEngine) {
      nativeBinding.CompressionEngine.resetMetrics();
    }
  } catch (_e) { /* Ignore errors */ }

  try {
    if (nativeBinding && nativeModuleStatus.rateLimiter && nativeBinding.RateLimiter) {
      nativeBinding.RateLimiter.resetMetrics();
    }
  } catch (_e) { /* Ignore errors */ }

  try {
    if (nativeBinding && nativeModuleStatus.protocolBuffers && nativeBinding.ProtocolBuffers) {
      nativeBinding.ProtocolBuffers.resetMetrics();
    }
  } catch (_e) { /* Ignore errors */ }

  try {
    if (nativeBinding && nativeModuleStatus.validationEngine && nativeBinding.ValidationEngine) {
      nativeBinding.ValidationEngine.resetMetrics();
    }
  } catch (_e) { /* Ignore errors */ }

  try {
    if (nativeBinding && nativeModuleStatus.threadPool && nativeBinding.ThreadPool) {
      nativeBinding.ThreadPool.resetMetrics();
    }
  } catch (_e) { /* Ignore errors */ }

  // Import the resetNativeBindingMetrics function dynamically
  import('../utils/native-bindings.js').then(({ resetNativeBindingMetrics }) => {
    resetNativeBindingMetrics();
  }).catch(() => {
    // Ignore errors
  });
}

/**
 * Get all performance metrics
 */
export function getAllPerformanceMetrics(): {
  httpParser: ReturnType<typeof HttpParser.getPerformanceMetrics>;
  radixRouter: ReturnType<typeof RadixRouter.getPerformanceMetrics>;
  jsonProcessor: ReturnType<typeof JsonProcessor.getPerformanceMetrics>;
  urlParser: ReturnType<typeof UrlParser.getPerformanceMetrics>;
  schemaValidator: ReturnType<typeof SchemaValidator.getPerformanceMetrics>;
  compression: ReturnType<typeof Compression.getPerformanceMetrics>;
  websocket: ReturnType<typeof WebSocketServer.getPerformanceMetrics>;
  objectPool: ReturnType<typeof ObjectPool.getPerformanceMetrics>;
  lruCache: any;
  middlewareChain: any;
  hashFunctions: any;
  stringEncoder: any;
  fileOperations: any;
  streamProcessor: StreamProcessorMetrics;
  compressionEngine: CompressionEngineMetrics;
  rateLimiter: RateLimiterMetrics;
  protocolBuffers: ProtocolBuffersMetrics;
  validationEngine: ValidationEngineMetrics;
  threadPool: ThreadPoolMetrics;
  nativeBindings: any;
} {
  // Get metrics from native module components
  const httpParserMetrics = HttpParser.getPerformanceMetrics();
  const radixRouterMetrics = RadixRouter.getPerformanceMetrics();
  const jsonProcessorMetrics = JsonProcessor.getPerformanceMetrics();
  const urlParserMetrics = UrlParser.getPerformanceMetrics();
  const schemaValidatorMetrics = SchemaValidator.getPerformanceMetrics();
  const compressionMetrics = Compression.getPerformanceMetrics();
  const websocketMetrics = WebSocketServer.getPerformanceMetrics();
  const objectPoolMetrics = ObjectPool.getPerformanceMetrics();

  // Initialize default metrics for all modules
  const defaultLRUCacheMetrics = {
    hits: 0,
    misses: 0,
    evictions: 0,
    expirations: 0,
    insertions: 0,
    updates: 0,
    hitRatio: 0,
    size: 0,
    capacity: 0
  };

  const defaultMiddlewareMetrics = {
    totalChainTime: 0,
    totalChainCalls: 0,
    totalMiddlewareCalls: 0,
    abortedCalls: 0,
    averageChainTime: 0,
    middlewareCount: 0
  };

  const defaultHashFunctionsMetrics = {
    md5Time: 0,
    md5Count: 0,
    md5AvgTime: 0,
    sha1Time: 0,
    sha1Count: 0,
    sha1AvgTime: 0,
    sha256Time: 0,
    sha256Count: 0,
    sha256AvgTime: 0,
    sha512Time: 0,
    sha512Count: 0,
    sha512AvgTime: 0,
    hmacTime: 0,
    hmacCount: 0,
    hmacAvgTime: 0
  };

  const defaultStringEncoderMetrics = {
    base64EncodeTime: 0,
    base64EncodeCount: 0,
    base64EncodeAvgTime: 0,
    base64DecodeTime: 0,
    base64DecodeCount: 0,
    base64DecodeAvgTime: 0,
    urlEncodeTime: 0,
    urlEncodeCount: 0,
    urlEncodeAvgTime: 0,
    urlDecodeTime: 0,
    urlDecodeCount: 0,
    urlDecodeAvgTime: 0,
    htmlEncodeTime: 0,
    htmlEncodeCount: 0,
    htmlEncodeAvgTime: 0,
    htmlDecodeTime: 0,
    htmlDecodeCount: 0,
    htmlDecodeAvgTime: 0
  };

  const defaultFileOperationsMetrics = {
    readTime: 0,
    readCount: 0,
    readAvgTime: 0,
    writeTime: 0,
    writeCount: 0,
    writeAvgTime: 0,
    mmapTime: 0,
    mmapCount: 0,
    mmapAvgTime: 0,
    mappedFilesCount: 0,
    activeMappedFiles: 0,
    totalMappedBytes: 0
  };

  const defaultStreamProcessorMetrics: StreamProcessorMetrics = {
    totalBytesProcessed: 0,
    totalChunksProcessed: 0,
    avgProcessingTimeMs: 0,
    maxProcessingTimeMs: 0,
    totalFlushes: 0,
    bufferOverflows: 0
  };

  const defaultCompressionEngineMetrics: CompressionEngineMetrics = {
    totalBytesCompressed: 0,
    totalBytesDecompressed: 0,
    compressionRatio: 0,
    avgCompressionTimeMs: 0,
    avgDecompressionTimeMs: 0,
    totalCompressOperations: 0,
    totalDecompressOperations: 0
  };

  const defaultRateLimiterMetrics: RateLimiterMetrics = {
    totalRequests: 0,
    allowedRequests: 0,
    throttledRequests: 0,
    currentTokens: 0,
    avgWaitTimeMs: 0,
    maxBurstUsed: 0
  };

  const defaultProtocolBuffersMetrics: ProtocolBuffersMetrics = {
    totalEncoded: 0,
    totalDecoded: 0,
    encodeErrors: 0,
    decodeErrors: 0,
    avgEncodeTimeMs: 0,
    avgDecodeTimeMs: 0,
    cacheHitRate: 0
  };

  const defaultValidationEngineMetrics: ValidationEngineMetrics = {
    totalValidations: 0,
    passedValidations: 0,
    failedValidations: 0,
    avgValidationTimeMs: 0,
    maxValidationTimeMs: 0,
    cacheHitRate: 0
  };

  const defaultThreadPoolMetrics: ThreadPoolMetrics = {
    activeThreads: 0,
    idleThreads: 0,
    completedTasks: 0,
    failedTasks: 0,
    cancelledTasks: 0,
    pendingTasks: 0,
    avgExecutionTimeMs: 0,
    avgQueueTimeMs: 0,
    maxQueueLength: 0
  };

  let lruCacheMetrics = defaultLRUCacheMetrics;
  let middlewareMetrics = defaultMiddlewareMetrics;
  let hashFunctionsMetrics = defaultHashFunctionsMetrics;
  let stringEncoderMetrics = defaultStringEncoderMetrics;
  let fileOperationsMetrics = defaultFileOperationsMetrics;
  let streamProcessorMetrics = defaultStreamProcessorMetrics;
  let compressionEngineMetrics = defaultCompressionEngineMetrics;
  let rateLimiterMetrics = defaultRateLimiterMetrics;
  let protocolBuffersMetrics = defaultProtocolBuffersMetrics;
  let validationEngineMetrics = defaultValidationEngineMetrics;
  let threadPoolMetrics = defaultThreadPoolMetrics;

  if (nativeBinding && nativeModuleStatus.loaded) {
    try {
      if (nativeModuleStatus.lruCache && nativeBinding.LRUCache) {
        const instance = new LRUCache();
        lruCacheMetrics = instance.getMetrics();
      }
    } catch (_e) { /* Use default metrics */ }

    try {
      if (nativeModuleStatus.middlewareChain && nativeBinding.MiddlewareChain) {
        const instance = new MiddlewareChain();
        middlewareMetrics = instance.getMetrics();
      }
    } catch (_e) { /* Use default metrics */ }

    try {
      if (nativeModuleStatus.hashFunctions && nativeBinding.HashFunctions) {
        const instance = new HashFunctions();
        hashFunctionsMetrics = instance.getMetrics();
      }
    } catch (_e) { /* Use default metrics */ }

    try {
      if (nativeModuleStatus.stringEncoder && nativeBinding.StringEncoder) {
        const instance = new StringEncoder();
        stringEncoderMetrics = instance.getMetrics();
      }
    } catch (_e) { /* Use default metrics */ }

    try {
      if (nativeModuleStatus.fileOperations && nativeBinding.FileOperations) {
        const instance = new FileOperations();
        fileOperationsMetrics = instance.getMetrics();
      }
    } catch (_e) { /* Use default metrics */ }

    // Get metrics for new modules
    try {
      if (nativeModuleStatus.streamProcessor && nativeBinding.StreamProcessor) {
        const instance = StreamProcessor.getInstance();
        streamProcessorMetrics = instance.getMetrics();
      }
    } catch (_e) { /* Use default metrics */ }

    try {
      if (nativeModuleStatus.compressionEngine && nativeBinding.CompressionEngine) {
        const instance = CompressionEngine.getInstance();
        compressionEngineMetrics = instance.getMetrics();
      }
    } catch (_e) { /* Use default metrics */ }

    try {
      if (nativeModuleStatus.rateLimiter && nativeBinding.RateLimiter) {
        const instance = RateLimiter.getInstance({tokensPerInterval: 100, interval: 1000});
        rateLimiterMetrics = instance.getMetrics();
      }
    } catch (_e) { /* Use default metrics */ }

    try {
      if (nativeModuleStatus.protocolBuffers && nativeBinding.ProtocolBuffers) {
        const instance = ProtocolBuffers.getInstance();
        protocolBuffersMetrics = instance.getMetrics();
      }
    } catch (_e) { /* Use default metrics */ }

    try {
      if (nativeModuleStatus.validationEngine && nativeBinding.ValidationEngine) {
        const instance = ValidationEngine.getInstance();
        validationEngineMetrics = instance.getMetrics();
      }
    } catch (_e) { /* Use default metrics */ }

    try {
      if (nativeModuleStatus.threadPool && nativeBinding.ThreadPool) {
        const instance = ThreadPool.getInstance();
        threadPoolMetrics = instance.getMetrics();
      }
    } catch (_e) { /* Use default metrics */ }
  }

  return {
    httpParser: httpParserMetrics,
    radixRouter: radixRouterMetrics,
    jsonProcessor: jsonProcessorMetrics,
    urlParser: urlParserMetrics,
    schemaValidator: schemaValidatorMetrics,
    compression: compressionMetrics,
    websocket: websocketMetrics,
    objectPool: objectPoolMetrics,
    lruCache: lruCacheMetrics,
    middlewareChain: middlewareMetrics,
    hashFunctions: hashFunctionsMetrics,
    stringEncoder: stringEncoderMetrics,
    fileOperations: fileOperationsMetrics,
    streamProcessor: streamProcessorMetrics,
    compressionEngine: compressionEngineMetrics,
    rateLimiter: rateLimiterMetrics,
    protocolBuffers: protocolBuffersMetrics,
    validationEngine: validationEngineMetrics,
    threadPool: threadPoolMetrics,
    nativeBindings: import('../utils/native-bindings.js').then(module => module.getNativeBindingMetrics()).catch(() => ({}))
  };
}

/**
 * Get native module metrics including performance statistics
 * @returns Object containing performance metrics for all native components
 */
export function getNativeModuleMetrics(): {
  status: NativeModuleStatus;
  performance: NativeModulePerformanceMetrics;
} {
  // Get all metrics using the existing function
  const metrics = getAllPerformanceMetrics();

  return {
    status: getNativeModuleStatus(),
    performance: metrics
  };
}

// Export native module status
export const hasNativeSupport = Boolean(loadNativeBinding());

/**
 * Object Pool class that provides efficient reuse of objects and buffers
 */
export class ObjectPool implements NativeObjectPool {
  private pool: any;
  private useNative: boolean;
  private logger = new Logger();

  // Performance metrics
  private static objectCreationCount = 0;
  private static objectReuseCount = 0;
  private static bufferCreationCount = 0;
  private static bufferReuseCount = 0;

  constructor(options?: ObjectPoolOptions) {
    const nativeModule = loadNativeBinding();
    this.useNative = Boolean(nativeModule?.ObjectPool && nativeOptions.enabled);

    if (this.useNative) {
      try {
        // Merge options from constructor with global native options
        const mergedOptions = {
          ...nativeOptions.objectPoolOptions,
          ...options
        };

        this.pool = new nativeModule.ObjectPool(mergedOptions);

        if (nativeOptions.verbose) {
          this.logger.debug('Native ObjectPool initialized');
        }
      } catch (err: any) {
        if (nativeOptions.verbose) {
          this.logger.warn(`Failed to create native ObjectPool: ${err.message}`);
        }
        this.useNative = false;
      }
    }

    if (!this.useNative && nativeOptions.verbose) {
      this.logger.warn('Native ObjectPool not available, falling back to direct object creation');
    }
  }

  /**
   * Create an object from the pool or create a new one if the pool is empty
   */
  createObject(): object {
    if (this.useNative && this.pool) {
      const obj = this.pool.createObject();
      if (obj) {
        ObjectPool.objectReuseCount++;
        return obj;
      }
    }

    // Fallback to creating a new object
    ObjectPool.objectCreationCount++;
    return {};
  }

  /**
   * Release an object back to the pool
   * @param obj The object to release
   */
  releaseObject(obj: object): void {
    if (this.useNative && this.pool) {
      this.pool.releaseObject(obj);
    }
  }

  /**
   * Get a headers object from the pool
   */
  getHeadersObject(): object {
    if (this.useNative && this.pool) {
      return this.pool.getHeadersObject();
    }

    // Fallback to creating a new headers object
    return {};
  }

  /**
   * Release a headers object back to the pool
   * @param headers The headers object to release
   */
  releaseHeadersObject(headers: object): void {
    if (this.useNative && this.pool) {
      this.pool.releaseHeadersObject(headers);
    }
  }

  /**
   * Get a buffer from the pool
   * @param size The minimum size of the buffer
   */
  getBuffer(size: number): Buffer {
    if (this.useNative && this.pool) {
      const buffer = this.pool.getBuffer(size);
      if (buffer) {
        ObjectPool.bufferReuseCount++;
        return buffer;
      }
    }

    // Fallback to creating a new buffer
    ObjectPool.bufferCreationCount++;
    return Buffer.alloc(size);
  }

  /**
   * Release a buffer back to the pool
   * @param buffer The buffer to release
   */
  releaseBuffer(buffer: Buffer): void {
    if (this.useNative && this.pool) {
      this.pool.releaseBuffer(buffer);
    }
  }

  /**
   * Reset the object pool
   */
  reset(): void {
    if (this.useNative && this.pool) {
      this.pool.reset();
    }
  }

  /**
   * Get information about the pool
   */
  getPoolInfo(): PoolInfo {
    if (this.useNative && this.pool) {
      return this.pool.getPoolInfo();
    }

    // Return empty info if not available
    return {
      enabled: false,
      objects: { total: 0, inUse: 0, available: 0, maxSize: 0 },
      buffers: { total: 0, inUse: 0, available: 0, maxSize: 0 },
      headers: { total: 0, inUse: 0, available: 0, maxSize: 0 }
    };
  }

  /**
   * Get performance metrics for object pooling
   */
  static getPerformanceMetrics(): {
    objectCreations: number;
    objectReuses: number;
    bufferCreations: number;
    bufferReuses: number;
  } {
    return {
      objectCreations: ObjectPool.objectCreationCount,
      objectReuses: ObjectPool.objectReuseCount,
      bufferCreations: ObjectPool.bufferCreationCount,
      bufferReuses: ObjectPool.bufferReuseCount
    };
  }

  /**
   * Reset performance metrics
   */
  static resetPerformanceMetrics(): void {
    ObjectPool.objectCreationCount = 0;
    ObjectPool.objectReuseCount = 0;
    ObjectPool.bufferCreationCount = 0;
    ObjectPool.bufferReuseCount = 0;
  }
}

// Return metrics for all the native modules
export interface NativeModulePerformanceMetrics {
  httpParser: ReturnType<typeof HttpParser.getPerformanceMetrics>;
  radixRouter: ReturnType<typeof RadixRouter.getPerformanceMetrics>;
  jsonProcessor: ReturnType<typeof JsonProcessor.getPerformanceMetrics>;
  urlParser: ReturnType<typeof UrlParser.getPerformanceMetrics>;
  schemaValidator: ReturnType<typeof SchemaValidator.getPerformanceMetrics>;
  compression: ReturnType<typeof Compression.getPerformanceMetrics>;
  websocket: ReturnType<typeof WebSocketServer.getPerformanceMetrics>;
  objectPool: ReturnType<typeof ObjectPool.getPerformanceMetrics>;
  lruCache: any; // LRUCacheMetrics
  middlewareChain: any; // MiddlewareMetrics
  hashFunctions: any; // HashFunctionsMetrics
  stringEncoder: any; // StringEncoderMetrics
  fileOperations: any; // FileOperationsMetrics
  streamProcessor: StreamProcessorMetrics;
  compressionEngine: CompressionEngineMetrics;
  rateLimiter: RateLimiterMetrics;
  protocolBuffers: ProtocolBuffersMetrics;
  validationEngine: ValidationEngineMetrics;
  threadPool: ThreadPoolMetrics;
  nativeBindings: any; // ReturnType<typeof import('../utils/native-bindings.js').getNativeBindingMetrics>;
}

// Stub classes for native modules until they are fully implemented
class LRUCache {
  getMetrics() {
    return {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      insertions: 0,
      updates: 0,
      hitRatio: 0,
      size: 0,
      capacity: 0
    };
  }
}

class MiddlewareChain {
  getMetrics() {
    return {
      totalChainTime: 0,
      totalChainCalls: 0,
      totalMiddlewareCalls: 0,
      abortedCalls: 0,
      averageChainTime: 0,
      middlewareCount: 0
    };
  }
}

class HashFunctions {
  getMetrics() {
    return {
      md5Time: 0,
      md5Count: 0,
      md5AvgTime: 0,
      sha1Time: 0,
      sha1Count: 0,
      sha1AvgTime: 0,
      sha256Time: 0,
      sha256Count: 0,
      sha256AvgTime: 0,
      sha512Time: 0,
      sha512Count: 0,
      sha512AvgTime: 0,
      hmacTime: 0,
      hmacCount: 0,
      hmacAvgTime: 0
    };
  }
}

class StringEncoder {
  getMetrics() {
    return {
      base64EncodeTime: 0,
      base64EncodeCount: 0,
      base64EncodeAvgTime: 0,
      base64DecodeTime: 0,
      base64DecodeCount: 0,
      base64DecodeAvgTime: 0,
      urlEncodeTime: 0,
      urlEncodeCount: 0,
      urlEncodeAvgTime: 0,
      urlDecodeTime: 0,
      urlDecodeCount: 0,
      urlDecodeAvgTime: 0,
      htmlEncodeTime: 0,
      htmlEncodeCount: 0,
      htmlEncodeAvgTime: 0,
      htmlDecodeTime: 0,
      htmlDecodeCount: 0,
      htmlDecodeAvgTime: 0
    };
  }
}

class FileOperations {
  getMetrics() {
    return {
      readTime: 0,
      readCount: 0,
      readAvgTime: 0,
      writeTime: 0,
      writeCount: 0,
      writeAvgTime: 0,
      mmapTime: 0,
      mmapCount: 0,
      mmapAvgTime: 0,
      mappedFilesCount: 0,
      activeMappedFiles: 0,
      totalMappedBytes: 0
    };
  }
}

class StreamProcessor {
  private static instance: StreamProcessor;

  static getInstance(): StreamProcessor {
    if (!StreamProcessor.instance) {
      StreamProcessor.instance = new StreamProcessor();
    }
    return StreamProcessor.instance;
  }

  getMetrics(): StreamProcessorMetrics {
    return {
      totalBytesProcessed: 0,
      totalChunksProcessed: 0,
      avgProcessingTimeMs: 0,
      maxProcessingTimeMs: 0,
      totalFlushes: 0,
      bufferOverflows: 0
    };
  }
}

class CompressionEngine {
  private static instance: CompressionEngine;

  static getInstance(): CompressionEngine {
    if (!CompressionEngine.instance) {
      CompressionEngine.instance = new CompressionEngine();
    }
    return CompressionEngine.instance;
  }

  getMetrics(): CompressionEngineMetrics {
    return {
      totalBytesCompressed: 0,
      totalBytesDecompressed: 0,
      compressionRatio: 0,
      avgCompressionTimeMs: 0,
      avgDecompressionTimeMs: 0,
      totalCompressOperations: 0,
      totalDecompressOperations: 0
    };
  }
}

class RateLimiter {
  private static instance: RateLimiter;

  static getInstance(options: RateLimiterOptions): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter();
    }
    return RateLimiter.instance;
  }

  getMetrics(): RateLimiterMetrics {
    return {
      totalRequests: 0,
      allowedRequests: 0,
      throttledRequests: 0,
      currentTokens: 0,
      avgWaitTimeMs: 0,
      maxBurstUsed: 0
    };
  }
}

class ProtocolBuffers {
  private static instance: ProtocolBuffers;

  static getInstance(): ProtocolBuffers {
    if (!ProtocolBuffers.instance) {
      ProtocolBuffers.instance = new ProtocolBuffers();
    }
    return ProtocolBuffers.instance;
  }

  getMetrics(): ProtocolBuffersMetrics {
    return {
      totalEncoded: 0,
      totalDecoded: 0,
      encodeErrors: 0,
      decodeErrors: 0,
      avgEncodeTimeMs: 0,
      avgDecodeTimeMs: 0,
      cacheHitRate: 0
    };
  }
}

class ValidationEngine {
  private static instance: ValidationEngine;

  static getInstance(): ValidationEngine {
    if (!ValidationEngine.instance) {
      ValidationEngine.instance = new ValidationEngine();
    }
    return ValidationEngine.instance;
  }

  getMetrics(): ValidationEngineMetrics {
    return {
      totalValidations: 0,
      passedValidations: 0,
      failedValidations: 0,
      avgValidationTimeMs: 0,
      maxValidationTimeMs: 0,
      cacheHitRate: 0
    };
  }
}

class ThreadPool {
  private static instance: ThreadPool;

  static getInstance(): ThreadPool {
    if (!ThreadPool.instance) {
      ThreadPool.instance = new ThreadPool();
    }
    return ThreadPool.instance;
  }

  getMetrics(): ThreadPoolMetrics {
    return {
      activeThreads: 0,
      idleThreads: 0,
      completedTasks: 0,
      failedTasks: 0,
      cancelledTasks: 0,
      pendingTasks: 0,
      avgExecutionTimeMs: 0,
      avgQueueTimeMs: 0,
      maxQueueLength: 0
    };
  }
}

// Simple logger implementation if not already defined
class Logger {
  info(message: string, ...args: any[]): void {
    console.log(`[INFO] ${message}`, ...args);
  }

  warn(message: string, ...args: any[]): void {
    console.warn(`[WARN] ${message}`, ...args);
  }

  error(message: string, ...args: any[]): void {
    console.error(`[ERROR] ${message}`, ...args);
  }

  debug(message: string, ...args: any[]): void {
    if (nativeOptions.verbose) {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  }

  // Add static methods for use with Logger.warn
  static info(message: string, ...args: any[]): void {
    console.log(`[INFO] ${message}`, ...args);
  }

  static warn(message: string, ...args: any[]): void {
    console.warn(`[WARN] ${message}`, ...args);
  }

  static error(message: string, ...args: any[]): void {
    console.error(`[ERROR] ${message}`, ...args);
  }

  static debug(message: string, ...args: any[]): void {
    if (nativeOptions.verbose) {
      console.debug(`[DEBUG] ${message}`, ...args);
    }
  }
}
