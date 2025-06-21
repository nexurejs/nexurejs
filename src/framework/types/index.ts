/**
 * NexureJS Framework Types
 *
 * Comprehensive type definitions for the high-performance Node.js framework
 * with native acceleration and advanced optimization capabilities.
 */

import { IncomingMessage, ServerResponse, Server } from 'http';
import { EventEmitter } from 'events';

// ============================================================================
// Core Application Types
// ============================================================================

export interface ApplicationOptions {
  server?: Partial<ServerOptions>;
  routing?: Partial<RoutingOptions>;
  middleware?: Partial<MiddlewareOptions>;
  security?: Partial<SecurityOptions>;
  performance?: Partial<PerformanceOptions>;
  logging?: Partial<LoggingOptions>;
}

export interface NexureConfig {
  development: boolean;
  server: ServerOptions;
  routing: RoutingOptions;
  middleware: MiddlewareOptions;
  security: SecurityOptions;
  performance: PerformanceOptions;
  logging: LoggingOptions;
}

// ============================================================================
// Server Configuration Types
// ============================================================================

export interface ServerOptions {
  port: number;
  hostname: string;
  backlog: number;
  keepAliveTimeout: number;
  headersTimeout: number;
  requestTimeout: number;
  maxHeadersCount?: number;
  timeout?: number;
  https?: {
    key: string | Buffer;
    cert: string | Buffer;
    ca?: string | Buffer;
    passphrase?: string;
  };
}

// ============================================================================
// HTTP Context Types
// ============================================================================

export interface HttpContext {
  request: HttpRequest;
  response: HttpResponse;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  body?: any;
  state: Record<string, any>;
  startTime: bigint;
  requestId: string;
}

export interface HttpRequest extends IncomingMessage {
  body?: any;
  params: Record<string, string>;
  query: Record<string, string | string[]>;
  cookies: Record<string, string>;
  session?: any;
  user?: any;
  ip: string;
  ips: string[];
  protocol: string;
  secure: boolean;
  xhr: boolean;
  path: string;
  originalUrl: string;
  baseUrl: string;
  fresh: boolean;
  stale: boolean;
  subdomains: string[];
  hostname: string;
  host: string;
  get(field: string): string | undefined;
  header(field: string): string | undefined;
  accepts(types: string | string[]): string | false;
  acceptsEncodings(encodings: string | string[]): string | false;
  acceptsCharsets(charsets: string | string[]): string | false;
  acceptsLanguages(languages: string | string[]): string | false;
  is(types: string | string[]): string | false;
}

export interface HttpResponse extends ServerResponse {
  status: number;
  body?: any;
  locals: Record<string, any>;
  headersSent: boolean;
  set(field: string, value: string | string[]): this;
  set(fields: Record<string, string | string[]>): this;
  get(field: string): string | undefined;
  append(field: string, value: string | string[]): this;
  cookie(name: string, value: string, options?: CookieOptions): this;
  clearCookie(name: string, options?: CookieOptions): this;
  redirect(url: string): this;
  redirect(status: number, url: string): this;
  json(obj: any): this;
  send(body?: any): this;
  type(type: string): this;
  format(obj: Record<string, () => void>): this;
  attachment(filename?: string): this;
  download(path: string, filename?: string, callback?: (err?: Error) => void): void;
  sendFile(path: string, options?: any, callback?: (err?: Error) => void): void;
  render(view: string, locals?: any, callback?: (err: Error | null, html?: string) => void): void;
}

export interface CookieOptions {
  maxAge?: number;
  signed?: boolean;
  expires?: Date;
  httpOnly?: boolean;
  path?: string;
  domain?: string;
  secure?: boolean;
  sameSite?: boolean | 'lax' | 'strict' | 'none';
}

// ============================================================================
// Routing Types
// ============================================================================

export interface RoutingOptions {
  caseSensitive: boolean;
  mergeParams: boolean;
  strict: boolean;
}

export type RouteHandler = (context: HttpContext) => Promise<void> | void;
export type RouteMiddleware = (context: HttpContext, next: () => Promise<void>) => Promise<void> | void;

export interface Route {
  method: string;
  path: string;
  handler: RouteHandler;
  middleware: RouteMiddleware[];
  params: string[];
}

export interface RouteParams {
  [key: string]: string;
}

export interface RouteMatch {
  route: Route;
  params: RouteParams;
}

// ============================================================================
// Middleware Types
// ============================================================================

export interface MiddlewareOptions {
  trustProxy: boolean;
}

export type MiddlewareFunction = (
  context: HttpContext,
  next: () => Promise<void>
) => Promise<void> | void;

export interface MiddlewareChainOptions {
  errorHandler?: ErrorHandlerFunction;
}

export type ErrorHandlerFunction = (
  error: Error,
  context: HttpContext,
  next: () => Promise<void>
) => Promise<void> | void;

// ============================================================================
// Security Types
// ============================================================================

export interface SecurityOptions {
  helmet: boolean;
  cors: boolean;
  rateLimit: boolean;
  csrf?: boolean;
  jwt?: JWTOptions;
}

export interface JWTOptions {
  secret: string;
  algorithm?: string;
  expiresIn?: string | number;
  issuer?: string;
  audience?: string;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
  statusCode?: number;
  headers?: boolean;
  draft_polli_ratelimit_headers?: boolean;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
  store?: any;
  skip?: (context: HttpContext) => boolean;
  keyGenerator?: (context: HttpContext) => string;
  onLimitReached?: (context: HttpContext) => void;
}

// ============================================================================
// Performance Types
// ============================================================================

export interface PerformanceOptions {
  monitoring: boolean;
  profiling: boolean;
  simd: boolean;
  nativeAcceleration: boolean;
  memoryOptimization?: boolean;
  compression?: boolean;
  caching?: boolean;
}

export interface PerformanceMetrics {
  requests: {
    total: number;
    perSecond: number;
    averageResponseTime: number;
    medianResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
  };
  memory: {
    used: number;
    free: number;
    total: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  simd: {
    supported: boolean;
    operations: number;
    efficiency: number;
  };
  native: {
    modules: string[];
    performance: Record<string, number>;
  };
}

// ============================================================================
// Logging Types
// ============================================================================

export interface LoggingOptions {
  level: 'error' | 'warn' | 'info' | 'debug' | 'trace';
  format: 'json' | 'text' | 'pretty';
  destination: 'console' | 'file' | 'syslog';
  file?: string;
  maxSize?: number;
  maxFiles?: number;
  timestamp?: boolean;
  colorize?: boolean;
}

export interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  meta?: any;
  requestId?: string;
  userId?: string;
  ip?: string;
  userAgent?: string;
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean';
  properties?: Record<string, ValidationSchema>;
  items?: ValidationSchema;
  required?: string[];
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  enum?: any[];
  format?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ValidationError {
  path: string;
  message: string;
  value: any;
  schema: ValidationSchema;
}

// ============================================================================
// Native Module Types
// ============================================================================

export interface NativeCapabilities {
  simd: boolean;
  hasAVX2: boolean;
  hasSSE42: boolean;
  hasNEON: boolean;
  hasAES: boolean;
  architecture: string;
  threads: number;
}

export interface SIMDOperations {
  vectorAdd: (a: Float32Array, b: Float32Array) => Float32Array;
  vectorMultiply: (a: Float32Array, b: Float32Array) => Float32Array;
  arraySum: (arr: Float32Array) => number;
  dotProduct: (a: Float32Array, b: Float32Array) => number;
  normalize: (arr: Float32Array) => Float32Array;
}

export interface MemoryPool {
  allocate: (size: number) => Buffer;
  deallocate: (buffer: Buffer) => void;
  getStats: () => MemoryPoolStats;
  cleanup: () => void;
}

export interface MemoryPoolStats {
  totalAllocated: number;
  totalDeallocated: number;
  currentUsage: number;
  peakUsage: number;
  poolSize: number;
  fragmentationRatio: number;
}

// ============================================================================
// Utility Types
// ============================================================================

export interface FileUpload {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
  stream?: NodeJS.ReadableStream;
  destination?: string;
  filename?: string;
  path?: string;
}

export interface StreamOptions {
  highWaterMark?: number;
  encoding?: BufferEncoding;
  objectMode?: boolean;
  autoDestroy?: boolean;
}

export interface CacheOptions {
  ttl?: number;
  max?: number;
  updateAgeOnGet?: boolean;
  updateAgeOnHas?: boolean;
  allowStale?: boolean;
}

// ============================================================================
// Event Types
// ============================================================================

export interface ApplicationEvents {
  initialized: () => void;
  started: (info: { port: number; hostname: string }) => void;
  stopped: () => void;
  error: (error: Error, context?: HttpContext) => void;
  request: (context: HttpContext) => void;
  response: (context: HttpContext) => void;
}

// ============================================================================
// Plugin Types
// ============================================================================

export interface Plugin {
  name: string;
  version: string;
  install: (app: any, options?: any) => void | Promise<void>;
  uninstall?: (app: any) => void | Promise<void>;
}

export interface PluginOptions {
  [key: string]: any;
}

// ============================================================================
// Database Types (if needed)
// ============================================================================

export interface DatabaseOptions {
  type: 'postgresql' | 'mysql' | 'sqlite' | 'mongodb';
  host?: string;
  port?: number;
  database: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  pool?: {
    min: number;
    max: number;
    idle: number;
  };
}

// ============================================================================
// WebSocket Types
// ============================================================================

export interface WebSocketOptions {
  port?: number;
  path?: string;
  compression?: boolean;
  maxPayload?: number;
  idleTimeout?: number;
  backpressureLimit?: number;
}

export interface WebSocketMessage {
  type: 'text' | 'binary' | 'ping' | 'pong' | 'close';
  data: Buffer | string;
  opCode: number;
  fin: boolean;
}

// ============================================================================
// HTTP/2 Types
// ============================================================================

export interface HTTP2Options {
  allowHTTP1?: boolean;
  maxDeflateDynamicTableSize?: number;
  maxSessionMemory?: number;
  maxHeaderListPairs?: number;
  maxOutstandingPings?: number;
  maxSendHeaderBlockLength?: number;
  paddingStrategy?: number;
  peerMaxConcurrentStreams?: number;
  settings?: {
    headerTableSize?: number;
    enablePush?: boolean;
    maxConcurrentStreams?: number;
    initialWindowSize?: number;
    maxFrameSize?: number;
    maxHeaderListSize?: number;
  };
}

// ============================================================================
// Export all types
// ============================================================================

export * from './http.js';
export * from './middleware.js';
export * from './routing.js';
export * from './security.js';
export * from './performance.js';
export * from './validation.js';
export * from './native.js';
