import { Buffer } from 'node:buffer';
import type { IncomingMessage } from 'node:http';
import { MultipartParser } from '../utils/multipart-parser.js';
import { extractBoundary } from './http-utils.js';

export interface BodyParserOptions {
  maxBodySize?: number;
  maxFiles?: number;
  maxFileSize?: number;
  contentTypes?: string[];
  parseRawBuffers?: boolean;
  tempDir?: string;
  keepFiles?: boolean;
  maxBufferSize?: number;
  alwaysStream?: boolean;
  streamChunkSize?: number;
  exposeStream?: boolean;
}

const DEFAULT_OPTIONS: Required<BodyParserOptions> = {
  maxBodySize: 1024 * 1024, // 1MB
  maxFiles: 10,
  maxFileSize: 5 * 1024 * 1024, // 5MB
  contentTypes: ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data'],
  parseRawBuffers: false,
  tempDir: '/tmp',
  keepFiles: false,
  maxBufferSize: 64 * 1024, // 64KB
  alwaysStream: false,
  streamChunkSize: 16 * 1024, // 16KB
  exposeStream: false
};

/**
 * Parse raw buffer based on content type
 */
export async function parseRawBuffer(
  buffer: Buffer,
  contentType: string | undefined,
  options: Partial<BodyParserOptions> = {}
): Promise<any> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

  // An empty body (e.g. GET/HEAD/DELETE requests) is not a content-type error.
  if (buffer.length === 0) {
    return undefined;
  }

  if (!contentType || !mergedOptions.contentTypes.some(type => contentType.startsWith(type))) {
    throw new Error(`Unsupported content type: ${contentType}`);
  }

  if (buffer.length > mergedOptions.maxBodySize) {
    throw new Error(`Request body too large: ${buffer.length} bytes`);
  }

  if (contentType.startsWith('application/json')) {
    return parseJson(buffer);
  }

  if (contentType.startsWith('application/x-www-form-urlencoded')) {
    return parseUrlEncoded(buffer);
  }

  if (contentType.startsWith('multipart/form-data')) {
    const boundary = getBoundary(contentType);
    if (!boundary) {
      throw new Error('Missing boundary in multipart/form-data');
    }
    const parser = new MultipartParser(boundary, mergedOptions);
    return parser.parse(buffer);
  }

  return buffer;
}

/**
 * Parse request body
 */
export async function parseBody(
  req: IncomingMessage,
  options: Partial<BodyParserOptions> = {}
): Promise<any> {
  const contentType = req.headers['content-type'];
  const buffer = await readBody(req, options);
  return parseRawBuffer(buffer, contentType, options);
}

/**
 * Parse JSON buffer
 */
function parseJson(buffer: Buffer): any {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch (_error) {
    return null;
  }
}

/**
 * Parse URL encoded buffer
 */
function parseUrlEncoded(buffer: Buffer): Record<string, string> {
  const result: Record<string, string> = {};

  // URLSearchParams decodes correctly: '+' becomes a space and only the first
  // '=' separates key/value, so values may themselves contain '='.
  const params = new URLSearchParams(buffer.toString('utf8'));
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }

  return result;
}

/**
 * Get boundary from content type
 */
function getBoundary(contentType: string): string | undefined {
  return extractBoundary(contentType) || undefined;
}

/**
 * Read request body into buffer
 */
async function readBody(
  req: IncomingMessage,
  options: Partial<BodyParserOptions> = {}
): Promise<Buffer> {
  const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
  const chunks: Buffer[] = [];
  let size = 0;

  return new Promise((resolve, reject) => {
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > mergedOptions.maxBodySize) {
        reject(new Error(`Request body too large: ${size} bytes`));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    req.on('error', reject);
  });
}
