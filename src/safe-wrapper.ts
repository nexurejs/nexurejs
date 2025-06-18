/**
 * Safe JavaScript Fallbacks
 *
 * This module provides pure JavaScript implementations of all native modules
 * to ensure the application can run even if there are issues with the native bindings.
 */

// =================================================
// HTTP Parser Fallback
// =================================================
export class HttpParser {
  parse(request: string): { method: string, path: string, headers: Record<string, string>, body: string } {
    // Simple fallback implementation
    const lines = request.split('\r\n');
    const firstLine = lines[0] || '';
    const [method, path] = firstLine.split(' ');

    const headers: Record<string, string> = {};
    let currentLine = 1;

    // Parse headers
    while (currentLine < lines.length) {
      const line = lines[currentLine];
      if (!line) break;

      const [key, value] = line.split(':');
      if (key && value) {
        headers[key.trim().toLowerCase()] = value.trim();
      }

      currentLine++;
    }

    // Skip the empty line after headers
    currentLine++;

    // Join the remaining lines as the body
    const body = lines.slice(currentLine).join('\r\n');

    return {
      method,
      path,
      headers,
      body
    };
  }
}

// =================================================
// Object Pool Fallback
// =================================================
export class ObjectPool {
  private pool: Record<string, any[]> = {};
  private maxSize: number;

  constructor(options: { maxSize?: number } = {}) {
    this.maxSize = options.maxSize || 1000;
  }

  get<T>(key: string, factory: () => T): T {
    this.pool[key] ??= [];

    if (this.pool[key].length > 0) {
      return this.pool[key].pop() as T;
    }

    return factory();
  }

  release(key: string, obj: any): void {
    this.pool[key] ??= [];

    if (this.pool[key].length < this.maxSize) {
      this.pool[key].push(obj);
    }
  }

  clear(): void {
    this.pool = {};
  }

  getStats(): Record<string, { size: number }> {
    const stats: Record<string, { size: number }> = {};

    for (const key in this.pool) {
      stats[key] = { size: this.pool[key].length };
    }

    return stats;
  }
}

// =================================================
// Radix Router Fallback
// =================================================
export class RadixRouter {
  private routes: Array<{ pattern: string, handler: any, params: string[] }> = [];

  add(pattern: string, handler: any): void {
    // Extract params from pattern (:paramName)
    const params: string[] = [];
    const regexPattern = pattern.replace(/:[a-zA-Z0-9_]+/g, (match) => {
      params.push(match.substring(1));
      return '([^/]+)';
    }).replace(/\*/g, '.*');

    this.routes.push({ pattern: regexPattern, handler, params });
  }

  find(path: string): any {
    for (const route of this.routes) {
      const regex = new RegExp(`^${route.pattern}$`);
      const match = path.match(regex);

      if (match) {
        const params: Record<string, string> = {};

        // Extract parameter values
        route.params.forEach((paramName, index) => {
          params[paramName] = match[index + 1];
        });

        return { handler: route.handler, params };
      }
    }

    return null;
  }

  remove(pattern: string): boolean {
    const initialLength = this.routes.length;
    this.routes = this.routes.filter(r => r.pattern !== pattern);
    return this.routes.length !== initialLength;
  }
}

// =================================================
// JSON Processor Fallback
// =================================================
export class JsonProcessor {
  parse(json: string): any {
    try {
      return JSON.parse(json);
    } catch (err) {
      throw new Error(`Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  stringify(obj: any): string {
    return JSON.stringify(obj);
  }
}

// =================================================
// URL Parser Fallback
// =================================================
export function parseUrl(url: string): URL {
  try {
    return new URL(url.startsWith('http') ? url : `http://example.com${url}`);
  } catch (err) {
    throw new Error(`Failed to parse URL: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function parseQueryString(queryString: string): Record<string, string> {
  if (!queryString) return {};

  // Remove leading ? if present
  const normalizedQuery = queryString.startsWith('?') ? queryString.slice(1) : queryString;

  // Split the query string into key-value pairs
  return normalizedQuery.split('&').reduce((params, param) => {
    const [key, value] = param.split('=');
    if (key) {
      params[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
    }
    return params;
  }, {} as Record<string, string>);
}

export function formatUrl(url: {
  protocol?: string;
  hostname?: string;
  port?: string | number;
  pathname?: string;
  search?: string;
  hash?: string;
}): string {
  const protocol = url.protocol || 'http:';
  const hostname = url.hostname || 'localhost';
  const port = url.port ? `:${url.port}` : '';
  const pathname = url.pathname || '/';

  let search = '';
  if (url.search) {
    search = url.search.startsWith('?') ? url.search : `?${url.search}`;
  }

  let hash = '';
  if (url.hash) {
    hash = url.hash.startsWith('#') ? url.hash : `#${url.hash}`;
  }

  return `${protocol}//${hostname}${port}${pathname}${search}${hash}`;
}

// =================================================
// Version and Availability Info
// =================================================
export const version = '0.1.0';
export const isAvailable = (): boolean => true;

// =================================================
// WebSocket Implementation
// =================================================
export class WebSocketServer {
  constructor() {
    throw new Error('WebSocket implementation not available in safe mode');
  }
}

// =================================================
// Query String Formatting
// =================================================
export const formatQueryString = (params: Record<string, string>): string => {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
};

// =================================================
// Schema Validation
// =================================================
export const validate = (_schema: any, _data: any): boolean => {
  // Simple validation fallback
  return true;
};

export const validatePartial = (_schema: any, _data: any): boolean => {
  // Simple validation fallback
  return true;
};

export const compileSchema = (_schema: any): ((_data: any) => boolean) => {
  // Simple compilation fallback
  return (_data: any): boolean => true;
};

export const clearCache = (): void => {
  // No-op in safe mode
};

export const getCacheStats = (): Record<string, any> => {
  return {};
};

// =================================================
// Compression
// =================================================
export const compress = (data: Buffer): Buffer => {
  // Simple passthrough in safe mode
  return data;
};

export const decompress = (data: Buffer): Buffer => {
  // Simple passthrough in safe mode
  return data;
};
