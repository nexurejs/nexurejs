# Quick Start Guide

Get up and running with NexureJS in just 5 minutes! This guide will walk you through creating your first high-performance web application.

## Prerequisites

- Node.js 18.0.0 or higher
- npm or yarn package manager
- Basic knowledge of JavaScript/TypeScript

## Installation

### Option 1: Create New Project

```bash
# Create a new directory
mkdir my-nexure-app
cd my-nexure-app

# Initialize npm project
npm init -y

# Install NexureJS
npm install nexurejs

# Install TypeScript (optional but recommended)
npm install -D typescript @types/node
```

### Option 2: Use Project Template

```bash
# Clone the starter template
git clone https://github.com/nexurejs/starter-template my-nexure-app
cd my-nexure-app

# Install dependencies
npm install
```

## Your First Application

### 1. Basic Server (JavaScript)

Create `server.js`:

```javascript
import { createApp } from 'nexurejs';

const app = createApp({
  performance: {
    simd: true,
    nativeAcceleration: true,
    monitoring: true
  }
});

// Basic route
app.get('/', (ctx) => {
  ctx.response.json({
    message: 'Hello, NexureJS!',
    timestamp: new Date().toISOString(),
    performance: ctx.app.getMetrics()
  });
});

// Start server
await app.start(3000);
console.log('🚀 Server running at http://localhost:3000');
```

### 2. TypeScript Version

Create `server.ts`:

```typescript
import { createApp, HttpContext } from 'nexurejs';

const app = createApp({
  performance: {
    simd: true,
    nativeAcceleration: true,
    monitoring: true
  },
  logging: {
    level: 'info',
    format: 'pretty'
  }
});

// Type-safe route handler
app.get('/', (ctx: HttpContext) => {
  ctx.response.json({
    message: 'Hello, NexureJS with TypeScript!',
    timestamp: new Date().toISOString(),
    performance: ctx.app.getMetrics()
  });
});

// Error handling
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.json({ error: 'Internal Server Error' });
  }
});

await app.start(3000);
console.log('🚀 TypeScript server running at http://localhost:3000');
```

### 3. Run Your Application

```bash
# JavaScript
node server.js

# TypeScript (with ts-node)
npx ts-node server.ts

# Or compile first
npx tsc server.ts
node server.js
```

## Adding Routes

### Basic Routes

```javascript
// GET route
app.get('/users', (ctx) => {
  ctx.response.json({ users: [] });
});

// POST route with body parsing
app.post('/users', (ctx) => {
  const userData = ctx.request.body;
  ctx.response.json({
    message: 'User created',
    user: userData
  });
});

// Route with parameters
app.get('/users/:id', (ctx) => {
  const userId = ctx.params.id;
  ctx.response.json({
    user: { id: userId, name: 'John Doe' }
  });
});

// Route with query parameters
app.get('/search', (ctx) => {
  const query = ctx.query.q;
  ctx.response.json({
    query,
    results: []
  });
});
```

### Advanced Routing

```javascript
// Route with multiple parameters
app.get('/users/:userId/posts/:postId', (ctx) => {
  const { userId, postId } = ctx.params;
  ctx.response.json({ userId, postId });
});

// Route with optional parameters
app.get('/posts/:id?', (ctx) => {
  const id = ctx.params.id || 'all';
  ctx.response.json({ posts: id });
});

// Route with wildcards
app.get('/files/*', (ctx) => {
  const filePath = ctx.params['*'];
  ctx.response.json({ filePath });
});
```

## Adding Middleware

### Global Middleware

```javascript
// Logging middleware
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  console.log(`${ctx.request.method} ${ctx.request.url} - ${duration}ms`);
});

// CORS middleware
app.use(async (ctx, next) => {
  ctx.response.set('Access-Control-Allow-Origin', '*');
  ctx.response.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  ctx.response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  await next();
});

// JSON body parser
app.use(async (ctx, next) => {
  if (ctx.request.headers['content-type']?.includes('application/json')) {
    let body = '';
    ctx.request.on('data', chunk => body += chunk);
    ctx.request.on('end', () => {
      try {
        ctx.request.body = JSON.parse(body);
      } catch (error) {
        ctx.request.body = {};
      }
    });
  }
  await next();
});
```

### Route-Specific Middleware

```javascript
// Authentication middleware
const authenticate = async (ctx, next) => {
  const token = ctx.request.headers.authorization;
  if (!token) {
    ctx.response.status = 401;
    ctx.response.json({ error: 'Unauthorized' });
    return;
  }
  // Verify token logic here
  await next();
};

// Protected route
app.get('/protected', authenticate, (ctx) => {
  ctx.response.json({ message: 'This is protected data' });
});
```

## Configuration Options

### Basic Configuration

```javascript
const app = createApp({
  // Server settings
  server: {
    port: 3000,
    hostname: 'localhost',
    keepAliveTimeout: 5000,
    requestTimeout: 30000
  },

  // Performance settings
  performance: {
    simd: true,
    nativeAcceleration: true,
    monitoring: true,
    memoryOptimization: true
  },

  // Security settings
  security: {
    helmet: true,
    cors: true,
    rateLimit: true
  },

  // Logging settings
  logging: {
    level: 'info',
    format: 'pretty',
    destination: 'console'
  }
});
```

### Advanced Configuration

```javascript
const app = createApp({
  server: {
    port: process.env.PORT || 3000,
    hostname: process.env.HOST || '0.0.0.0',
    https: process.env.NODE_ENV === 'production' ? {
      key: fs.readFileSync('path/to/private-key.pem'),
      cert: fs.readFileSync('path/to/certificate.pem')
    } : undefined
  },

  performance: {
    simd: true,
    nativeAcceleration: true,
    monitoring: true,
    compression: true,
    caching: true
  },

  security: {
    helmet: true,
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['*'],
      credentials: true
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100 // limit each IP to 100 requests per windowMs
    }
  }
});
```

## Error Handling

### Global Error Handler

```javascript
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    console.error('Application error:', error);

    ctx.response.status = error.status || 500;
    ctx.response.json({
      error: error.message || 'Internal Server Error',
      ...(process.env.NODE_ENV === 'development' && {
        stack: error.stack
      })
    });
  }
});
```

### Custom Error Classes

```javascript
class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
    this.field = field;
  }
}

class NotFoundError extends Error {
  constructor(resource) {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
    this.status = 404;
  }
}

// Usage in routes
app.get('/users/:id', (ctx) => {
  const user = findUser(ctx.params.id);
  if (!user) {
    throw new NotFoundError('User');
  }
  ctx.response.json(user);
});
```

## Testing Your Application

### Basic Test

```javascript
// test/server.test.js
import { createApp } from 'nexurejs';
import { describe, it, expect } from 'vitest';

describe('NexureJS App', () => {
  let app;

  beforeEach(() => {
    app = createApp();
    app.get('/test', (ctx) => {
      ctx.response.json({ message: 'test' });
    });
  });

  it('should respond to GET /test', async () => {
    const response = await app.request('/test');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'test' });
  });
});
```

## Performance Monitoring

### Built-in Metrics

```javascript
// Get performance metrics
app.get('/metrics', (ctx) => {
  const metrics = ctx.app.getMetrics();
  ctx.response.json(metrics);
});

// Get application status
app.get('/health', (ctx) => {
  const status = ctx.app.getStatus();
  ctx.response.json(status);
});
```

### Custom Metrics

```javascript
app.use(async (ctx, next) => {
  const start = process.hrtime.bigint();
  await next();
  const duration = Number(process.hrtime.bigint() - start) / 1e6;

  // Log slow requests
  if (duration > 1000) {
    console.warn(`Slow request: ${ctx.request.url} took ${duration}ms`);
  }
});
```

## Next Steps

Now that you have a basic NexureJS application running, here are some next steps:

1. **[Learn Core Concepts](core-concepts.md)** - Understand the framework architecture
2. **[Explore Middleware](core/middleware.md)** - Add more functionality to your app
3. **[Set up Security](security/overview.md)** - Implement authentication and protection
4. **[Optimize Performance](performance/native-modules.md)** - Enable native acceleration
5. **[Deploy to Production](deployment/production.md)** - Get your app live

## Common Patterns

### API Server

```javascript
import { createApp } from 'nexurejs';

const app = createApp({
  performance: { simd: true, monitoring: true },
  security: { cors: true, rateLimit: true }
});

// Middleware
app.use(jsonBodyParser);
app.use(authenticate);
app.use(errorHandler);

// Routes
app.get('/api/users', getUsersHandler);
app.post('/api/users', createUserHandler);
app.get('/api/users/:id', getUserHandler);
app.put('/api/users/:id', updateUserHandler);
app.delete('/api/users/:id', deleteUserHandler);

await app.start(3000);
```

### Static File Server

```javascript
import { createApp } from 'nexurejs';
import { staticFiles } from 'nexurejs/middleware';

const app = createApp();

// Serve static files
app.use(staticFiles('./public', {
  maxAge: '1d',
  gzip: true
}));

// API routes
app.get('/api/status', (ctx) => {
  ctx.response.json({ status: 'ok' });
});

await app.start(3000);
```

## Troubleshooting

### Common Issues

1. **Port already in use**: Change the port number or kill the process using the port
2. **Native modules not loading**: Ensure you have the correct Node.js version and platform
3. **TypeScript errors**: Install `@types/node` and ensure TypeScript version compatibility

### Debug Mode

```javascript
const app = createApp({
  logging: {
    level: 'debug',
    format: 'pretty'
  }
});
```

### Performance Issues

```javascript
// Enable performance profiling
const app = createApp({
  performance: {
    monitoring: true,
    profiling: true
  }
});

// Check metrics
console.log(app.getMetrics());
```

## Resources

- [Full Documentation](README.md)
- [API Reference](api/README.md)
- [Examples](examples/)
- [GitHub Repository](https://github.com/nexurejs/nexurejs)

---

**Congratulations! 🎉** You've created your first NexureJS application. The framework's native optimizations and SIMD acceleration are now working to give you the best possible performance.
