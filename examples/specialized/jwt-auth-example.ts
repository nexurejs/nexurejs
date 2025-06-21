/**
 * JWT Authentication Example
 *
 * This example demonstrates how to use JWT authentication in a NexureJS application.
 * It includes:
 * - User login endpoint that issues JWT tokens
 * - Protected routes that require authentication
 * - Public routes that don't require authentication
 */

import { IncomingMessage, ServerResponse, createServer } from 'node:http';
import { createJwtAuthMiddleware, signJwt, JwtPayload } from '../src/security/jwt.js';
import { createCsrfMiddleware, createCsrfTokenMiddleware } from '../src/security/csrf.js';
import { Logger } from '../src/utils/logger.js';
import { HttpMethod } from '../src/http/http-method.js';
import { MiddlewareHandler } from '../src/middleware/middleware.js';

// Create logger
const logger = new Logger();

// Mock user database
const users = [
  { id: '1', username: 'admin', password: 'admin123', role: 'admin' },
  { id: '2', username: 'user', password: 'user123', role: 'user' }
];

// JWT configuration
const JWT_SECRET = 'your-secret-key-should-be-long-and-secure';
const jwtAuth = createJwtAuthMiddleware({
  secret: JWT_SECRET,
  expiresIn: 3600, // 1 hour
  issuer: 'nexurejs-example'
});

// CSRF protection
const csrfProtection = createCsrfMiddleware();
const csrfToken = createCsrfTokenMiddleware();

// Create a simple router implementation for this example
class SimpleRouter {
  private routes: Map<string, Map<HttpMethod, {
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
    middlewares: MiddlewareHandler[]
  }>> = new Map();

  constructor() {
    // Initialize routes map
    this.routes = new Map();
  }

  // Register a route
  register(method: HttpMethod, path: string, handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>, middlewares: MiddlewareHandler[] = []) {
    if (!this.routes.has(path)) {
      this.routes.set(path, new Map());
    }

    const pathRoutes = this.routes.get(path)!;
    pathRoutes.set(method, { handler, middlewares });
  }

  // GET method shorthand
  get(path: string, ...handlers: Array<MiddlewareHandler | ((req: IncomingMessage, res: ServerResponse) => Promise<void>)>) {
    const middlewares = handlers.slice(0, -1) as MiddlewareHandler[];
    const handler = handlers[handlers.length - 1] as (req: IncomingMessage, res: ServerResponse) => Promise<void>;
    this.register(HttpMethod.GET, path, handler, middlewares);
  }

  // POST method shorthand
  post(path: string, ...handlers: Array<MiddlewareHandler | ((req: IncomingMessage, res: ServerResponse) => Promise<void>)>) {
    const middlewares = handlers.slice(0, -1) as MiddlewareHandler[];
    const handler = handlers[handlers.length - 1] as (req: IncomingMessage, res: ServerResponse) => Promise<void>;
    this.register(HttpMethod.POST, path, handler, middlewares);
  }

  // Handle incoming request
  async handleRequest(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname;
    const method = req.method as HttpMethod || HttpMethod.GET;

    // Find route
    const pathRoutes = this.routes.get(path);
    if (!pathRoutes || !pathRoutes.has(method)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found' }));
      return;
    }

    const { handler, middlewares } = pathRoutes.get(method)!;

    // Execute middlewares
    try {
      if (middlewares.length > 0) {
        let index = 0;

        const next = async () => {
          if (index < middlewares.length) {
            const middleware = middlewares[index++];
            await middleware(req, res, next);
          } else {
            await handler(req, res);
          }
        };

        await next();
      } else {
        await handler(req, res);
      }
    } catch (error) {
      logger.error('Error handling request:', error);
      if (!res.writableEnded) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal Server Error' }));
      }
    }
  }
}

// Create router
const router = new SimpleRouter();

// Public routes
router.get('/', async (req: IncomingMessage, res: ServerResponse) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    message: 'Welcome to NexureJS JWT Authentication Example',
    endpoints: {
      '/': 'Public - This information',
      '/login': 'Public - Login to get a JWT token (POST)',
      '/profile': 'Protected - Get user profile (requires JWT)',
      '/admin': 'Protected - Admin only endpoint (requires JWT with admin role)'
    }
  }));
});

// Login endpoint - issues JWT tokens
router.post('/login', async (req: IncomingMessage, res: ServerResponse) => {
  // Get request body
  let body = '';

  try {
    // Collect request body data
    for await (const chunk of req) {
      body += chunk.toString();
    }

    // Parse JSON body
    let userData;
    try {
      userData = JSON.parse(body);
    } catch (error) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      return;
    }

    const { username, password } = userData;

    // Validate required fields
    if (!username || !password) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Username and password are required' }));
      return;
    }

    // Find user
    const user = users.find(u => u.username === username && u.password === password);

    if (!user) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid username or password' }));
      return;
    }

    // Create JWT payload
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role
    };

    // Sign JWT token
    const token = signJwt(payload, JWT_SECRET, {
      secret: JWT_SECRET,
      expiresIn: 3600,
      issuer: 'nexurejs-example'
    });

    // Return token
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    }));
  } catch (error) {
    logger.error('Login error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal Server Error' }));
  }
});

// Protected route - requires authentication
router.get('/profile', jwtAuth, async (req: IncomingMessage, res: ServerResponse) => {
  // The user object is attached to the request by the JWT middleware
  const user = (req as any).user;

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    message: 'Protected profile route',
    user
  }));
});

// Protected route with role check - requires authentication and admin role
router.get('/admin', jwtAuth, async (req: IncomingMessage, res: ServerResponse) => {
  const user = (req as any).user;

  // Check if user has admin role
  if (user.role !== 'admin') {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Access denied. Admin role required.' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    message: 'Protected admin route',
    user,
    adminData: {
      serverStats: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version
      }
    }
  }));
});

// Create HTTP server
const server = createServer(async (req, res) => {
  // Apply CSRF middleware
  try {
    let index = 0;
    const middlewares = [csrfToken, csrfProtection];

    const next = async () => {
      if (index < middlewares.length) {
        const middleware = middlewares[index++];
        await middleware(req, res, next);
      } else {
        await router.handleRequest(req, res);
      }
    };

    await next();
  } catch (error) {
    logger.error('Error handling request:', error);
    if (!res.writableEnded) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error' }));
    }
  }
});

// Start server
try {
  server.listen(3000, () => {
    logger.info('JWT Authentication Example running at http://localhost:3000');
    logger.info('Available endpoints:');
    logger.info('  GET  / - Public welcome page');
    logger.info('  POST /login - Login with username/password to get JWT token');
    logger.info('  GET  /profile - Protected route (requires JWT)');
    logger.info('  GET  /admin - Protected admin route (requires JWT with admin role)');
    logger.info('\nTest credentials:');
    logger.info('  Admin: username=admin, password=admin123');
    logger.info('  User:  username=user, password=user123');
  });
} catch (error) {
  logger.error('Failed to start server:', error);
}
