/**
 * Router
 *
 * Features:
 * - Fast path optimization for common routes
 * - Route caching with TTL
 * - Instance pooling for better memory usage
 * - Compatible with existing Router API
 * - Integrated controller support
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { URL } from 'node:url';
import { MiddlewareHandler, getRouteMetadata, composeMiddleware, parseBody } from '../types/index.js';
import { Container } from '../di/container.js';
import { HttpMethod } from '../http/http-method.js';
import { HttpException } from '../http/http-exception.js';
import { hasBody } from '../http/http-utils.js';

// Re-export for compatibility with previous imports from this module
export { HttpMethod } from '../http/http-method.js';

// Constants
export const STATIC = 0;
export const PARAM = 1;
export const MATCH_ALL = 2;
export const WILDCARD = 3;

// Define route handler and related types
export type RouteHandler = (_req: IncomingMessage, _res: ServerResponse) => Promise<void>;

export interface Route {
  path: string;
  method: HttpMethod;
  handler: (_req: IncomingMessage, _res: ServerResponse) => Promise<any>;
  middlewares: MiddlewareHandler[];
  /** The middleware chain composed once at registration (undefined when empty). */
  composedMiddleware?: MiddlewareHandler;
  controller: any;
}

export interface RouteMatch {
  route: Route;
  params: Record<string, string>;
}

/**
 * Memory-efficient node class with optimization for static nodes
 */
class RadixNode {
  // Node properties
  type: number = STATIC;
  segment: string = '';
  paramName: string = '';
  children: RadixNode[] = [];
  routes: Map<HttpMethod, Route> = new Map();

  // Fast path optimization
  fastPaths: Map<string, RadixNode> = new Map();

  // For static nodes, use a bitmap index for fast child lookup
  staticChildrenIndex: Uint32Array | null = null;

  // Reusable param objects for better memory efficiency
  private static paramObjectPool: Record<string, string>[] = [];

  // Node pool for reuse
  private static nodePool: RadixNode[] = [];

  // Get a node from the pool or create a new one
  static getNode(): RadixNode {
    if (this.nodePool.length > 0) {
      const node = this.nodePool.pop()!;
      node.reset();
      return node;
    }
    return new RadixNode();
  }

  // Release a node back to the pool
  static releaseNode(node: RadixNode): void {
    if (this.nodePool.length < 1000) {
      // Limit pool size
      this.nodePool.push(node);
    }
  }

  // Reset node to initial state
  reset(): void {
    this.type = STATIC;
    this.segment = '';
    this.paramName = '';
    this.children = [];
    this.routes.clear();
    this.fastPaths.clear();
    this.staticChildrenIndex = null;
  }

  // Get param object from pool
  static getParamObject(): Record<string, string> {
    if (this.paramObjectPool.length > 0) {
      return this.paramObjectPool.pop()!;
    }
    return {};
  }

  // Release param object back to pool
  static releaseParamObject(params: Record<string, string>): void {
    if (this.paramObjectPool.length < 1000) {
      // Limit pool size
      Object.keys(params).forEach(key => delete params[key]);
      this.paramObjectPool.push(params);
    }
  }

  // Add a route to the tree
  insert(path: string, route: Route): void {
    const normalizedPath = this.normalizePath(path);
    const segments = normalizedPath.split('/').filter(Boolean);

    this.insertInternal(segments, route, 0);

    // Build fast paths for common routes (direct children)
    if (segments.length === 1 && this.type === STATIC) {
      this.fastPaths.set(
        `${route.method}:${segments[0]}`,
        this.children.find(c => c.segment === segments[0]) || this
      );
    }

    // Rebuild bitmap index for static children
    this.rebuildStaticIndex();
  }

  // Internal insertion method
  private insertInternal(segments: string[], route: Route, index: number): void {
    // If we reached the end of the path, store the route at this node
    if (index === segments.length) {
      this.routes.set(route.method, route);
      return;
    }

    const segment = segments[index] || '';

    // Check if this is a parameter segment (:name)
    if (segment.startsWith(':')) {
      // Parameter node
      const paramName = segment.slice(1);
      let paramNode = this.children.find(child => child.type === PARAM);

      if (!paramNode) {
        paramNode = RadixNode.getNode();
        paramNode.type = PARAM;
        paramNode.paramName = paramName;
        this.children.push(paramNode);
      } else if (paramNode.paramName !== paramName) {
        throw new Error(
          `Cannot use two different param names for the same path segment: ${paramNode.paramName} and ${paramName}`
        );
      }

      paramNode.insertInternal(segments, route, index + 1);
      return;
    }

    // Check if this is a wildcard segment (*)
    if (segment === '*') {
      // Wildcard node
      let wildcardNode = this.children.find(child => child.type === WILDCARD);

      if (!wildcardNode) {
        wildcardNode = RadixNode.getNode();
        wildcardNode.type = WILDCARD;
        this.children.push(wildcardNode);
      }

      wildcardNode.routes.set(route.method, route);
      return;
    }

    // Static node
    let staticNode = this.children.find(
      child => child.type === STATIC && child.segment === segment
    );

    if (!staticNode) {
      staticNode = RadixNode.getNode();
      staticNode.type = STATIC;
      staticNode.segment = segment;
      this.children.push(staticNode);
    }

    staticNode.insertInternal(segments, route, index + 1);
  }

  // Rebuild the bitmap index for static children
  private rebuildStaticIndex(): void {
    const staticChildren = this.children.filter(child => child.type === STATIC);

    if (staticChildren.length > 5) {
      // Only use bitmap for sufficient number of children
      // Create a 256-bit (32 byte) bitmap for ASCII chars
      const bitmap = new Uint32Array(8); // 8 * 32 = 256 bits
      this.staticChildrenIndex = bitmap;

      // Set bits for the first character of each static child
      for (const child of staticChildren) {
        const charCode = child.segment.charCodeAt(0);
        const index = Math.floor(charCode / 32);
        const bit = charCode % 32;

        // Check that the index is valid
        if (index >= 0 && index < 8) {
          bitmap[index]! |= 1 << bit;
        }
      }
    } else {
      this.staticChildrenIndex = null;
    }
  }

  // Find a route in the tree
  search(path: string, method: HttpMethod): RouteMatch | null {
    // Fast path check for common routes
    const fastPathKey = `${method}:${path.replace(/^\//, '')}`;
    const fastPathNode = this.fastPaths.get(fastPathKey);

    if (fastPathNode) {
      const route = fastPathNode.routes.get(method);
      if (route) {
        return {
          route,
          params: {}
        };
      }
    }

    // Normal path
    const normalizedPath = this.normalizePath(path);
    const segments = normalizedPath.split('/').filter(Boolean);
    const params = RadixNode.getParamObject();

    const route = this.searchInternal(segments, method, params, 0);

    if (route) {
      return { route, params };
    }

    // Release the params object back to the pool
    RadixNode.releaseParamObject(params);
    return null;
  }

  // Simplified search implementation to reduce complexity
  private searchInternal(
    segments: string[],
    method: HttpMethod,
    params: Record<string, string>,
    index: number
  ): Route | null {
    // If we've reached the end of the path, check if there's a matching route
    if (index === segments.length) {
      // Check for an exact method match
      const route = this.routes.get(method) || this.routes.get(HttpMethod.ALL);
      return route || null;
    }

    const segment = segments[index] || '';

    // Search static nodes first (most specific match)
    const staticNode = this.findStaticNode(segment);
    if (staticNode) {
      const route = staticNode.searchInternal(segments, method, params, index + 1);
      if (route) return route;
    }

    // Try param nodes second (less specific match)
    const paramNode = this.children.find(child => child.type === PARAM);
    if (paramNode) {
      params[paramNode.paramName] = segment;
      const route = paramNode.searchInternal(segments, method, params, index + 1);
      if (route) return route;
      delete params[paramNode.paramName]; // Clean up if no match
    }

    // Try wildcard nodes last (least specific match)
    const wildcardNode = this.children.find(child => child.type === WILDCARD);
    if (wildcardNode) {
      const route = wildcardNode.routes.get(method) || wildcardNode.routes.get(HttpMethod.ALL);
      return route || null;
    }

    return null;
  }

  // Helper method to find a static node matching the segment
  private findStaticNode(segment: string): RadixNode | undefined {
    // Fast check for static nodes with bitmap index
    if (this.staticChildrenIndex) {
      const bitmap = this.staticChildrenIndex;
      const firstChar = segment.charCodeAt(0);
      const bitmapIndex = Math.floor(firstChar / 32);
      const bit = firstChar % 32;

      // Make sure index is valid
      if (bitmapIndex < 0 || bitmapIndex >= bitmap.length) {
        return undefined;
      }

      // Check if the bit is set for this character
      if (!(bitmap[bitmapIndex]! & (1 << bit))) {
        return undefined;
      }
    }

    // Find the matching static node
    return this.children.find(child => child.type === STATIC && child.segment === segment);
  }

  // Normalize a path (ensure leading slash, no trailing slash)
  private normalizePath(path: string): string {
    let normalized = path;

    if (!normalized.startsWith('/')) {
      normalized = `/${normalized}`;
    }

    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  }
}

/**
 * Router
 */
export class Router {
  private root = new RadixNode();
  private globalPrefix: string;
  private routeCache: Map<
    string,
    {
      result: RouteMatch | null;
      timestamp: number;
    }
  > = new Map();

  private readonly CACHE_MAX_SIZE = 10000; // Maximum cache size
  private readonly DEFAULT_TTL = 60000; // Default TTL: 1 minute
  private cacheTtl: number;
  private lastCacheCleanup: number = Date.now();
  private readonly CLEANUP_INTERVAL = 300000; // Cleanup interval: 5 minutes

  // Stats for monitoring
  private stats = {
    hits: 0,
    misses: 0,
    inserts: 0,
    searches: 0,
    expirations: 0
  };

  /**
   * Create a new router
   * @param globalPrefix Global prefix for all routes
   * @param options Router options
   */
  constructor(globalPrefix: string = '', options: { cacheTtl?: number } = {}) {
    this.globalPrefix = globalPrefix;
    this.cacheTtl = options.cacheTtl || this.DEFAULT_TTL;
  }

  /**
   * Configure caching behavior
   * @param options Caching options
   */
  configureCaching(options: { enabled?: boolean; maxSize?: number; ttl?: number }): void {
    if (options.enabled === false) {
      this.routeCache.clear();
      this.cacheTtl = 0; // Disable caching
    } else {
      if (options.maxSize !== undefined && options.maxSize > 0) {
        // If cache size is being reduced, trim it
        if (options.maxSize < this.CACHE_MAX_SIZE && this.routeCache.size > options.maxSize) {
          const entriesToRemove = [...this.routeCache.entries()]
            .sort((a, b) => a[1].timestamp - b[1].timestamp)
            .slice(0, this.routeCache.size - options.maxSize);

          for (const [key] of entriesToRemove) {
            this.routeCache.delete(key);
          }
        }
      }

      if (options.ttl !== undefined) {
        this.cacheTtl = options.ttl;
        this.maybeCleanupCache(); // Clean up with new TTL
      }
    }
  }

  /**
   * Register routes from a controller
   * @param controller The controller to register routes from
   * @param container The dependency injection container
   */
  registerRoutes(controller: any, container: Container): void {
    const controllerInstance = container.resolve(controller);
    const controllerMetadata = getRouteMetadata(controller);

    if (!controllerMetadata?.path) {
      return;
    }

    const controllerPath = this.normalizePath(controllerMetadata.path);
    const controllerMiddlewares = controllerMetadata.middlewares || [];

    // Get all methods with route metadata
    for (const propertyKey of Object.getOwnPropertyNames(controller.prototype)) {
      if (propertyKey === 'constructor') continue;

      const routeMetadata = getRouteMetadata(controller.prototype, propertyKey);
      if (!routeMetadata?.method) continue;

      const routePath = this.normalizePath(routeMetadata.path || '/');
      const fullPath = this.combinePaths(this.globalPrefix, controllerPath, routePath);
      const methodMiddlewares = routeMetadata.middlewares || [];

      // Resolve the controller method once, at registration time.
      const handlerMethod = controller.prototype[propertyKey];

      // Create route handler
      const routeHandler = async (req: IncomingMessage, res: ServerResponse): Promise<any> => {
        const params = this.extractParams(req);
        const query = this.extractQuery(req);
        // Skip body parsing for requests that cannot carry a body (GET/HEAD/…)
        // — avoids setting up stream listeners for an empty payload.
        const body = hasBody(req) ? await parseBody(req) : undefined;

        // Create context object with request data
        const context = {
          req,
          res,
          params,
          query,
          body
        };

        // Call the controller method with the context
        const result = await handlerMethod.call(controllerInstance, context);

        // Send the response, choosing a Content-Type from the result shape
        // unless a middleware or the handler already set one.
        if (!res.writableEnded) {
          res.statusCode = routeMetadata.statusCode || 200;
          const isString = typeof result === 'string';
          if (!res.headersSent && !res.hasHeader('Content-Type')) {
            res.setHeader(
              'Content-Type',
              isString ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8'
            );
          }
          res.end(isString ? result : JSON.stringify(result));
        }

        return result;
      };

      // Add the route to our radix tree
      this.addRoute(
        routeMetadata.method,
        fullPath,
        routeHandler,
        [...controllerMiddlewares, ...methodMiddlewares],
        controllerInstance
      );
    }
  }

  /**
   * Add a route to the router
   * @param method HTTP method
   * @param path Route path
   * @param handler Route handler
   * @param middlewares Middleware handlers
   * @param controller Controller instance
   */
  addRoute(
    method: HttpMethod,
    path: string,
    handler: RouteHandler,
    middlewares: MiddlewareHandler[] = [],
    controller: any = null
  ): void {
    // Clear cache when new routes are added
    this.routeCache.clear();

    const normalizedPath = this.normalizePath(path);
    this.root.insert(normalizedPath, {
      path: normalizedPath,
      method,
      handler,
      middlewares,
      // Compose the middleware chain once here instead of on every request.
      composedMiddleware:
        middlewares.length > 0 ? composeMiddleware(middlewares) : undefined,
      controller
    });
  }

  /**
   * Process an incoming request
   * @param req The incoming request
   * @param res The server response
   */
  async process(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method as HttpMethod;
    const url = req.url || '/';

    // Find matching route
    const match = this.findRoute(method, url);

    if (!match) {
      throw new HttpException(404, `Cannot ${method} ${url}`);
    }

    const { route, params } = match;

    // Add params to request object
    (req as any).params = params;

    // Execute route middlewares (composed once at registration time)
    if (route.composedMiddleware) {
      await route.composedMiddleware(req, res, async () => {
        await route.handler(req, res);
      });
    } else {
      await route.handler(req, res);
    }
  }

  /**
   * Find a matching route for the given method and URL
   * @param method The HTTP method
   * @param url The request URL
   */
  findRoute(method: HttpMethod, path: string): RouteMatch | null {
    this.stats.searches++;

    // Route matching depends only on the pathname, never the query string.
    // Strip the query with indexOf/slice — far cheaper than constructing a URL
    // on every request — and key the cache by pathname so requests to the same
    // route with different query strings share a single cache entry.
    const queryIndex = path.indexOf('?');
    const pathname = queryIndex === -1 ? path : path.slice(0, queryIndex);

    // Check routing cache first
    if (this.cacheTtl > 0) {
      this.maybeCleanupCache();

      const cacheKey = `${method}:${pathname}`;
      const cached = this.routeCache.get(cacheKey);

      if (cached) {
        const now = Date.now();
        if (now - cached.timestamp < this.cacheTtl) {
          this.stats.hits++;
          return cached.result;
        } else {
          // Remove expired entry
          this.routeCache.delete(cacheKey);
          this.stats.expirations++;
        }
      }

      // Cache miss - perform lookup
      this.stats.misses++;

      // Search for a route match
      const result = this.root.search(pathname, method);

      // Cache the result
      if (this.routeCache.size < this.CACHE_MAX_SIZE) {
        this.routeCache.set(cacheKey, {
          result,
          timestamp: Date.now()
        });
        this.stats.inserts++;
      }

      return result;
    } else {
      // Caching disabled - perform lookup directly
      return this.root.search(pathname, method);
    }
  }

  /**
   * Periodically clean up expired cache entries
   */
  private maybeCleanupCache(): void {
    const now = Date.now();

    // Only clean up at intervals to avoid performance impact
    if (now - this.lastCacheCleanup > this.CLEANUP_INTERVAL) {
      this.lastCacheCleanup = now;

      let expiredCount = 0;
      for (const [key, entry] of this.routeCache.entries()) {
        if (now - entry.timestamp > this.cacheTtl) {
          this.routeCache.delete(key);
          expiredCount++;
        }
      }

      if (expiredCount > 0) {
        this.stats.expirations += expiredCount;
      }
    }
  }

  /**
   * Get router performance statistics
   */
  getStats(): {
    hits: number;
    misses: number;
    inserts: number;
    searches: number;
    expirations: number;
    cacheSize: number;
    cacheTtl: number;
  } {
    return {
      ...this.stats,
      cacheSize: this.routeCache.size,
      cacheTtl: this.cacheTtl
    };
  }

  /**
   * Clear the route cache
   */
  clearCache(): void {
    this.routeCache.clear();
  }

  /**
   * Extract query parameters from the request
   * @param req The incoming request
   */
  private extractQuery(req: IncomingMessage): Record<string, string> {
    const url = req.url || '/';
    const queryIndex = url.indexOf('?');

    // Fast path: most requests have no query string — skip URL parsing entirely.
    if (queryIndex === -1) {
      return {};
    }

    const query: Record<string, string> = {};
    const searchParams = new URLSearchParams(url.slice(queryIndex + 1));

    for (const [key, value] of searchParams.entries()) {
      query[key] = value;
    }

    return query;
  }

  /**
   * Extract path parameters from the request
   * @param req The incoming request
   */
  private extractParams(req: IncomingMessage): Record<string, string> {
    return (req as any).params || {};
  }

  /**
   * Normalize a path by ensuring it starts with a slash and has no trailing slash
   * @param path The path to normalize
   */
  private normalizePath(path: string): string {
    let normalized = path;

    if (!normalized.startsWith('/')) {
      normalized = `/${normalized}`;
    }

    if (normalized.length > 1 && normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  }

  /**
   * Combine multiple path segments into a single path
   * @param paths The path segments to combine
   */
  private combinePaths(...paths: string[]): string {
    return paths
      .filter(Boolean)
      .map(path => this.normalizePath(path))
      .join('')
      .replace(/\/+/g, '/');
  }

  /**
   * Add a GET route
   * @param path Route path
   * @param handler Route handler
   * @param middlewares Middleware handlers
   * @param controller Controller instance
   */
  get(
    path: string,
    handler: RouteHandler,
    middlewares: MiddlewareHandler[] = [],
    controller: any = null
  ): void {
    this.addRoute(HttpMethod.GET, path, handler, middlewares, controller);
  }

  /**
   * Add a POST route
   * @param path Route path
   * @param handler Route handler
   * @param middlewares Middleware handlers
   * @param controller Controller instance
   */
  post(
    path: string,
    handler: RouteHandler,
    middlewares: MiddlewareHandler[] = [],
    controller: any = null
  ): void {
    this.addRoute(HttpMethod.POST, path, handler, middlewares, controller);
  }

  /**
   * Add a PUT route
   * @param path Route path
   * @param handler Route handler
   * @param middlewares Middleware handlers
   * @param controller Controller instance
   */
  put(
    path: string,
    handler: RouteHandler,
    middlewares: MiddlewareHandler[] = [],
    controller: any = null
  ): void {
    this.addRoute(HttpMethod.PUT, path, handler, middlewares, controller);
  }

  /**
   * Add a DELETE route
   * @param path Route path
   * @param handler Route handler
   * @param middlewares Middleware handlers
   * @param controller Controller instance
   */
  delete(
    path: string,
    handler: RouteHandler,
    middlewares: MiddlewareHandler[] = [],
    controller: any = null
  ): void {
    this.addRoute(HttpMethod.DELETE, path, handler, middlewares, controller);
  }

  /**
   * Add a PATCH route
   * @param path Route path
   * @param handler Route handler
   * @param middlewares Middleware handlers
   * @param controller Controller instance
   */
  patch(
    path: string,
    handler: RouteHandler,
    middlewares: MiddlewareHandler[] = [],
    controller: any = null
  ): void {
    this.addRoute(HttpMethod.PATCH, path, handler, middlewares, controller);
  }

  /**
   * Add a OPTIONS route
   * @param path Route path
   * @param handler Route handler
   * @param middlewares Middleware handlers
   * @param controller Controller instance
   */
  options(
    path: string,
    handler: RouteHandler,
    middlewares: MiddlewareHandler[] = [],
    controller: any = null
  ): void {
    this.addRoute(HttpMethod.OPTIONS, path, handler, middlewares, controller);
  }

  /**
   * Add a HEAD route
   * @param path Route path
   * @param handler Route handler
   * @param middlewares Middleware handlers
   * @param controller Controller instance
   */
  head(
    path: string,
    handler: RouteHandler,
    middlewares: MiddlewareHandler[] = [],
    controller: any = null
  ): void {
    this.addRoute(HttpMethod.HEAD, path, handler, middlewares, controller);
  }

  /**
   * Add a route for all HTTP methods
   * @param path Route path
   * @param handler Route handler
   * @param middlewares Middleware handlers
   * @param controller Controller instance
   */
  all(
    path: string,
    handler: RouteHandler,
    middlewares: MiddlewareHandler[] = [],
    controller: any = null
  ): void {
    this.addRoute(HttpMethod.ALL, path, handler, middlewares, controller);
  }
}

// Export a compatibility interface for RadixRouter
export class RadixRouter {
  private router: Router;

  constructor(globalPrefix: string = '') {
    this.router = new Router(globalPrefix);
  }

  addRoute(
    method: HttpMethod,
    path: string,
    handler: RouteHandler,
    middlewares: MiddlewareHandler[] = [],
    controller: any = null
  ): void {
    this.router.addRoute(method, path, handler, middlewares, controller);
  }

  findRoute(method: HttpMethod, path: string): RouteMatch | null {
    return this.router.findRoute(method, path);
  }

  /**
   * Add a GET route
   */
  get(
    path: string,
    handler: RouteHandler,
    middlewares: MiddlewareHandler[] = [],
    controller: any = null
  ): void {
    this.router.get(path, handler, middlewares, controller);
  }

  /**
   * Add a POST route
   */
  post(
    path: string,
    handler: RouteHandler,
    middlewares: MiddlewareHandler[] = [],
    controller: any = null
  ): void {
    this.router.post(path, handler, middlewares, controller);
  }

  /**
   * Add a PUT route
   */
  put(
    path: string,
    handler: RouteHandler,
    middlewares: MiddlewareHandler[] = [],
    controller: any = null
  ): void {
    this.router.put(path, handler, middlewares, controller);
  }

  /**
   * Add a DELETE route
   */
  delete(
    path: string,
    handler: RouteHandler,
    middlewares: MiddlewareHandler[] = [],
    controller: any = null
  ): void {
    this.router.delete(path, handler, middlewares, controller);
  }

  /**
   * Add a PATCH route
   */
  patch(
    path: string,
    handler: RouteHandler,
    middlewares: MiddlewareHandler[] = [],
    controller: any = null
  ): void {
    this.router.patch(path, handler, middlewares, controller);
  }

  /**
   * Add a OPTIONS route
   */
  options(
    path: string,
    handler: RouteHandler,
    middlewares: MiddlewareHandler[] = [],
    controller: any = null
  ): void {
    this.router.options(path, handler, middlewares, controller);
  }

  /**
   * Add a HEAD route
   */
  head(
    path: string,
    handler: RouteHandler,
    middlewares: MiddlewareHandler[] = [],
    controller: any = null
  ): void {
    this.router.head(path, handler, middlewares, controller);
  }

  /**
   * Add a route that matches all HTTP methods
   */
  all(
    path: string,
    handler: RouteHandler,
    middlewares: MiddlewareHandler[] = [],
    controller: any = null
  ): void {
    this.router.all(path, handler, middlewares, controller);
  }
}
