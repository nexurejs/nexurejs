/**
 * HTTP Utilities
 *
 * Helper functions for HTTP request and response handling.
 * This file consolidates common HTTP utility functions from across the codebase.
 */

import { Buffer } from 'node:buffer';
import { IncomingMessage } from 'node:http';

/**
 * Request-like interface to allow using these utilities with different request types
 */
export interface RequestLike {
  method?: string;
  url?: string;
  headers?: {
    [key: string]: string | string[] | undefined;
    'content-length'?: string;
    'content-type'?: string;
    'transfer-encoding'?: string;
  };
  httpVersionMajor?: number;
  httpVersionMinor?: number;
}

/**
 * Check if a request has a body based on method and headers
 * @param req - The HTTP request object
 * @returns True if request should have a body
 */
export function hasBody(req: RequestLike): boolean {
  // Methods that typically don't have a body
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method || '')) {
    return false;
  }

  // Check for Content-Length or Transfer-Encoding headers
  if (req.headers?.['content-length'] && parseInt(req.headers['content-length']) > 0) {
    return true;
  }

  if (req.headers?.['transfer-encoding'] !== undefined) {
    return true;
  }

  return false;
}

/**
 * Extract the base content type from a content-type header
 * @param contentTypeHeader The content-type header value
 * @returns The base content type without parameters
 */
export function extractBaseContentType(contentTypeHeader: string | string[] | undefined): string {
  if (!contentTypeHeader) {
    return '';
  }

  if (typeof contentTypeHeader === 'string') {
    const parts = contentTypeHeader.split(';');
    return parts[0] ? parts[0].trim() : '';
  }

  if (Array.isArray(contentTypeHeader) && contentTypeHeader.length > 0) {
    const firstValue = contentTypeHeader[0];
    if (firstValue) {
      const parts = firstValue.split(';');
      return parts[0] ? parts[0].trim() : '';
    }
  }

  return '';
}

/**
 * Check if the request content type matches the specified type
 * @param req - The HTTP request object
 * @param type - The type(s) to match against
 * @returns True if the content type matches
 */
export function typeMatches(req: RequestLike, type: string | RegExp | string[]): boolean {
  // Early return if there's no content-type header
  if (!req.headers?.['content-type']) {
    return false;
  }

  const contentType = extractBaseContentType(req.headers['content-type']);

  if (Array.isArray(type)) {
    return type.some(t => typeMatches(req, t));
  }

  if (type instanceof RegExp) {
    return type.test(contentType);
  }

  if (typeof type === 'string' && type.includes('*')) {
    const typeRegex = new RegExp(`^${type.replace('*', '.*')}$`);
    return typeRegex.test(contentType);
  }

  return contentType === type;
}

/**
 * Get the content type from the request
 * @param req - The HTTP request object
 * @returns The content type
 */
export function getContentType(req: RequestLike): string {
  return extractBaseContentType(req.headers?.['content-type']);
}

/**
 * Parse a string value representing bytes into a number
 * @param val - The value to parse (e.g., '1mb', '500kb')
 * @returns The value in bytes
 */
export function bytes(val: string | number): number {
  if (typeof val === 'number') {
    return val;
  }

  if (typeof val !== 'string') {
    return 0;
  }

  const match = /^(\d+(?:\.\d+)?)([kmgt]b?)$/i.exec(val.toLowerCase().trim());
  if (!match) {
    return parseInt(val, 10) || 0;
  }

  const num = parseFloat(match[1]!);
  // The regex accepts bare units (k, m, g, t) as well as their *b forms;
  // normalize so '5k' is treated identically to '5kb'.
  const unit = match[2]!.toLowerCase();
  const normalizedUnit = unit.endsWith('b') ? unit : `${unit}b`;

  const multiplier: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
    tb: 1024 * 1024 * 1024 * 1024
  };

  return Math.floor(num * (multiplier[normalizedUnit] || 1));
}

/**
 * Parse a URL-encoded string
 * @param str - URL-encoded string
 * @returns Parsed key-value pairs
 */
export function parseUrlEncodedText(str: string): Record<string, string> {
  const result: Record<string, string> = {};

  if (!str || typeof str !== 'string') {
    return result;
  }

  // URLSearchParams decodes '+' as a space and splits only on the first '=',
  // so values may themselves contain '='.
  const params = new URLSearchParams(str);
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }

  return result;
}

/**
 * Generate a boundary for multipart form data
 * @returns A random boundary string
 */
export function generateBoundary(): string {
  return `---boundary-${Math.random().toString(36).substring(2)}`;
}

/**
 * Extract the boundary from a Content-Type header
 * @param contentType - The Content-Type header value
 * @returns The boundary or null if not found
 */
export function extractBoundary(contentType: string): string | null {
  if (!contentType) return null;

  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  return match ? match[1] || match[2] || null : null;
}

/**
 * Format HTTP headers to standard format
 * @param headers - Header object
 * @returns Formatted headers
 */
export function formatHeaders(
  headers: Record<string, string | string[] | undefined>
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};

  Object.keys(headers).forEach(key => {
    // Convert header name to lowercase
    const headerName = key.toLowerCase();
    const value = headers[key];
    if (value !== undefined) {
      result[headerName] = value;
    }
  });

  return result;
}

/**
 * Check if a path matches a pattern with wildcards
 * @param path - The URL path
 * @param pattern - The pattern with wildcards
 * @returns True if path matches the pattern
 */
export function pathMatches(path: string, pattern: string): boolean {
  if (pattern === '*') return true;

  const patternParts = pattern.split('/');
  const pathParts = path.split('/');

  // If parts don't match in length and we don't have wildcards, fail immediately
  if (patternParts.length !== pathParts.length && !pattern.includes('*')) {
    return false;
  }

  // Check each part
  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];

    // Check if we've run out of path parts
    if (i >= pathParts.length) {
      return false;
    }

    const pathPart = pathParts[i];

    // Wildcard matches anything
    if (patternPart === '*') {
      continue;
    }

    // Parameter placeholders like :id match any non-empty segment
    if (patternPart && patternPart.startsWith(':')) {
      if (pathPart.length === 0) {
        return false;
      }
      continue;
    }

    // Exact match required
    if (patternPart !== pathPart) {
      return false;
    }
  }

  return true;
}

/**
 * Create an HTTP error with a status code
 * @param statusCode HTTP status code
 * @param message Error message
 * @returns Error object with status code
 */
export function createHttpError(
  statusCode: number,
  message: string
): Error & { statusCode: number } {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

/**
 * Convert HTTP1 request to HTTP2 headers
 * @param req HTTP1 request
 * @returns HTTP2 headers object
 */
export function requestToHttp2Headers(req: IncomingMessage): Record<string, string | string[]> {
  const headers: Record<string, string | string[]> = {
    ':method': req.method || 'GET',
    ':path': req.url || '/',
    ':scheme': 'http',
    ':authority': req.headers.host || ''
  };

  // Add remaining headers
  Object.entries(req.headers).forEach(([key, value]) => {
    if (key !== 'host' && value !== undefined) {
      headers[key] = value;
    }
  });

  return headers;
}

/**
 * Convert HTTP2 headers to HTTP1 headers
 * @param headers HTTP2 headers
 * @returns HTTP1 headers
 */
export function http2ToHttp1Headers(
  headers: Record<string, string | string[]>
): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};

  // Copy all non-pseudo headers
  Object.entries(headers).forEach(([key, value]) => {
    if (!key.startsWith(':')) {
      result[key] = value;
    }
  });

  // Set host from :authority
  if (headers[':authority']) {
    result.host = headers[':authority'];
  }

  return result;
}

/**
 * Read the entire request body into a buffer
 * @param req The request stream
 * @param limit Maximum size in bytes (optional)
 * @returns Promise that resolves to the request body buffer
 */
export function readBody(req: IncomingMessage, limit?: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;

      if (limit && size > limit) {
        req.removeAllListeners();
        reject(createHttpError(413, 'Request body too large'));
        return;
      }

      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    req.on('error', err => {
      reject(err);
    });
  });
}

/**
 * Get commonly used HTTP status codes and their messages
 */
export function getStatusText(code: number): string {
  const texts: Record<number, string> = {
    100: 'Continue',
    101: 'Switching Protocols',
    200: 'OK',
    201: 'Created',
    202: 'Accepted',
    204: 'No Content',
    205: 'Reset Content',
    206: 'Partial Content',
    300: 'Multiple Choices',
    301: 'Moved Permanently',
    302: 'Found',
    303: 'See Other',
    304: 'Not Modified',
    307: 'Temporary Redirect',
    308: 'Permanent Redirect',
    400: 'Bad Request',
    401: 'Unauthorized',
    402: 'Payment Required',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    406: 'Not Acceptable',
    407: 'Proxy Authentication Required',
    408: 'Request Timeout',
    409: 'Conflict',
    410: 'Gone',
    411: 'Length Required',
    412: 'Precondition Failed',
    413: 'Payload Too Large',
    414: 'URI Too Long',
    415: 'Unsupported Media Type',
    416: 'Range Not Satisfiable',
    417: 'Expectation Failed',
    418: "I'm a Teapot",
    422: 'Unprocessable Entity',
    425: 'Too Early',
    426: 'Upgrade Required',
    428: 'Precondition Required',
    429: 'Too Many Requests',
    431: 'Request Header Fields Too Large',
    451: 'Unavailable For Legal Reasons',
    500: 'Internal Server Error',
    501: 'Not Implemented',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
    505: 'HTTP Version Not Supported',
    506: 'Variant Also Negotiates',
    507: 'Insufficient Storage',
    508: 'Loop Detected',
    510: 'Not Extended',
    511: 'Network Authentication Required'
  };

  return texts[code] || 'Unknown Status';
}

export default {
  hasBody,
  typeMatches,
  getContentType,
  bytes,
  parseUrlEncodedText,
  generateBoundary,
  extractBoundary,
  formatHeaders,
  pathMatches,
  createHttpError,
  requestToHttp2Headers,
  http2ToHttp1Headers,
  readBody,
  getStatusText
};
