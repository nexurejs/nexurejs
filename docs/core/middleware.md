# Middleware System

NexureJS provides a powerful and flexible middleware system that allows you to process requests and responses in a composable way. Middleware functions execute in sequence and can modify requests, responses, or control the flow of execution.

## Table of Contents

- [Understanding Middleware](#understanding-middleware)
- [Basic Middleware](#basic-middleware)
- [Built-in Middleware](#built-in-middleware)
- [Custom Middleware](#custom-middleware)
- [Middleware Order](#middleware-order)
- [Error Handling Middleware](#error-handling-middleware)
- [Async Middleware](#async-middleware)
- [Route-Specific Middleware](#route-specific-middleware)
- [Middleware Composition](#middleware-composition)
- [Performance Considerations](#performance-considerations)

## Understanding Middleware

Middleware functions are functions that have access to the request context (`ctx`) and the `next` function. They can:

- Execute code before and after route handlers
- Modify the request or response
- End the request-response cycle
- Call the next middleware in the stack

### Middleware Signature

```typescript
type MiddlewareFunction = (ctx: HttpContext, next: () => Promise<void>) => Promise<void>;
```

## Basic Middleware

### Simple Logging Middleware

```javascript
import { createApp } from 'nexurejs';

const app = createApp();

// Basic logging middleware
app.use(async (ctx, next) => {
  const start = Date.now();
  console.log(`${ctx.request.method} ${ctx.request.url} - Started`);

  await next(); // Call the next middleware/route handler

  const duration = Date.now() - start;
  console.log(`${ctx.request.method} ${ctx.request.url} - ${ctx.response.status} - ${duration}ms`);
});

app.get('/', (ctx) => {
  ctx.response.json({ message: 'Hello World' });
});

await app.start(3000);
```

### Request ID Middleware

```javascript
import { randomUUID } from 'crypto';

const requestIdMiddleware = async (ctx, next) => {
  // Add unique request ID
  ctx.requestId = randomUUID();
  ctx.response.set('X-Request-ID', ctx.requestId);

  await next();
};

app.use(requestIdMiddleware);
```

## Built-in Middleware

NexureJS provides several built-in middleware functions:

### JSON Body Parser

```javascript
import { jsonBodyParser } from 'nexurejs/middleware';

app.use(jsonBodyParser({
  limit: '10mb',
  strict: true,
  type: 'application/json'
}));

// Now you can access parsed JSON body
app.post('/users', (ctx) => {
  const userData = ctx.request.body;
  console.log(userData); // Parsed JSON object
  ctx.response.json({ received: userData });
});
```

### CORS Middleware

```javascript
import { cors } from 'nexurejs/middleware';

app.use(cors({
  origin: ['http://localhost:3000', 'https://myapp.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
```

### Rate Limiting

```javascript
import { rateLimit } from 'nexurejs/middleware';

app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP',
  standardHeaders: true
}));
```

### Static File Serving

```javascript
import { staticFiles } from 'nexurejs/middleware';

app.use('/static', staticFiles('./public', {
  maxAge: '1d',
  etag: true,
  gzip: true,
  index: 'index.html'
}));
```

### Compression

```javascript
import { compression } from 'nexurejs/middleware';

app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (ctx) => {
    return ctx.response.get('Content-Type')?.includes('text/') ||
           ctx.response.get('Content-Type')?.includes('application/json');
  }
}));
```

## Custom Middleware

### Authentication Middleware

```javascript
import jwt from 'jsonwebtoken';

const authenticate = async (ctx, next) => {
  const token = ctx.request.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    ctx.response.status = 401;
    ctx.response.json({ error: 'No token provided' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    ctx.user = decoded;
    await next();
  } catch (error) {
    ctx.response.status = 401;
    ctx.response.json({ error: 'Invalid token' });
  }
};

// Use authentication middleware
app.use('/api/protected', authenticate);
```

### Request Validation Middleware

```javascript
import Joi from 'joi';

const validateBody = (schema) => {
  return async (ctx, next) => {
    try {
      const { error, value } = schema.validate(ctx.request.body);

      if (error) {
        ctx.response.status = 400;
        ctx.response.json({
          error: 'Validation failed',
          details: error.details
        });
        return;
      }

      ctx.request.body = value; // Use validated data
      await next();
    } catch (err) {
      ctx.response.status = 500;
      ctx.response.json({ error: 'Validation error' });
    }
  };
};

// Usage
const userSchema = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  age: Joi.number().min(18)
});

app.post('/users', validateBody(userSchema), (ctx) => {
  const userData = ctx.request.body; // Validated data
  ctx.response.json({ message: 'User created', user: userData });
});
```

### Caching Middleware

```javascript
const cache = new Map();

const cacheMiddleware = (ttl = 300000) => { // 5 minutes default
  return async (ctx, next) => {
    const key = `${ctx.request.method}:${ctx.request.url}`;

    // Check cache for GET requests
    if (ctx.request.method === 'GET') {
      const cached = cache.get(key);
      if (cached && Date.now() - cached.timestamp < ttl) {
        ctx.response.set('X-Cache', 'HIT');
        ctx.response.json(cached.data);
        return;
      }
    }

    await next();

    // Cache successful GET responses
    if (ctx.request.method === 'GET' && ctx.response.status === 200) {
      cache.set(key, {
        data: ctx.response.body,
        timestamp: Date.now()
      });
      ctx.response.set('X-Cache', 'MISS');
    }
  };
};

app.use('/api/data', cacheMiddleware(600000)); // 10 minutes
```

## Middleware Order

The order in which middleware is registered matters:

```javascript
const app = createApp();

// 1. Request logging (first to capture all requests)
app.use(requestLogger);

// 2. Security headers
app.use(securityHeaders);

// 3. CORS (before authentication)
app.use(cors());

// 4. Body parsing
app.use(jsonBodyParser());

// 5. Authentication (after body parsing)
app.use(authenticate);

// 6. Rate limiting
app.use(rateLimit());

// 7. Routes
app.get('/api/users', getUsersHandler);

// 8. Error handling (last)
app.use(errorHandler);
```

### Conditional Middleware

```javascript
// Apply middleware only to specific paths
app.use('/api/*', authenticate);
app.use('/admin/*', [authenticate, requireAdmin]);

// Apply middleware conditionally
const conditionalMiddleware = async (ctx, next) => {
  if (ctx.request.url.startsWith('/api/')) {
    // Apply API-specific logic
    ctx.response.set('X-API-Version', '1.0');
  }
  await next();
};

app.use(conditionalMiddleware);
```

## Error Handling Middleware

### Global Error Handler

```javascript
const errorHandler = async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    console.error('Application error:', error);

    // Set status based on error type
    if (error.name === 'ValidationError') {
      ctx.response.status = 400;
    } else if (error.name === 'UnauthorizedError') {
      ctx.response.status = 401;
    } else if (error.name === 'NotFoundError') {
      ctx.response.status = 404;
    } else {
      ctx.response.status = error.status || 500;
    }

    // Send error response
    ctx.response.json({
      error: error.message || 'Internal Server Error',
      ...(process.env.NODE_ENV === 'development' && {
        stack: error.stack
      })
    });
  }
};

// Register error handler last
app.use(errorHandler);
```

### Custom Error Classes

```javascript
class APIError extends Error {
  constructor(message, status = 500, code = null) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.code = code;
  }
}

class ValidationError extends APIError {
  constructor(message, field = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.field = field;
  }
}

class NotFoundError extends APIError {
  constructor(resource) {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

// Usage in middleware
const validateUser = async (ctx, next) => {
  const { name, email } = ctx.request.body;

  if (!name) {
    throw new ValidationError('Name is required', 'name');
  }

  if (!email) {
    throw new ValidationError('Email is required', 'email');
  }

  await next();
};
```

## Async Middleware

All middleware in NexureJS is async by default:

```javascript
// Database connection middleware
const dbMiddleware = async (ctx, next) => {
  try {
    ctx.db = await connectToDatabase();
    await next();
  } finally {
    if (ctx.db) {
      await ctx.db.close();
    }
  }
};

// File upload middleware
const uploadMiddleware = async (ctx, next) => {
  if (ctx.request.headers['content-type']?.includes('multipart/form-data')) {
    ctx.files = await parseMultipartForm(ctx.request);
  }
  await next();
};

// External API middleware
const enrichDataMiddleware = async (ctx, next) => {
  if (ctx.request.url.includes('/enrich')) {
    const externalData = await fetch('https://api.example.com/data');
    ctx.externalData = await externalData.json();
  }
  await next();
};
```

## Route-Specific Middleware

### Single Route Middleware

```javascript
// Apply middleware to a single route
app.get('/protected', authenticate, (ctx) => {
  ctx.response.json({ message: 'Protected data', user: ctx.user });
});

// Multiple middleware for a single route
app.post('/users', [validateBody(userSchema), authenticate, auditLog], (ctx) => {
  // Route handler
});
```

### Route Group Middleware

```javascript
import { Router } from 'nexurejs';

// Create a router with middleware
const apiRouter = new Router();

// Apply middleware to all routes in this router
apiRouter.use(authenticate);
apiRouter.use(rateLimit({ max: 1000 }));

// Add routes
apiRouter.get('/users', getUsersHandler);
apiRouter.post('/users', createUserHandler);
apiRouter.get('/posts', getPostsHandler);

// Mount the router
app.use('/api/v1', apiRouter);
```

## Middleware Composition

### Middleware Factory

```javascript
const createAuthMiddleware = (options = {}) => {
  const { required = true, roles = [] } = options;

  return async (ctx, next) => {
    const token = ctx.request.headers.authorization?.replace('Bearer ', '');

    if (!token && required) {
      ctx.response.status = 401;
      ctx.response.json({ error: 'Authentication required' });
      return;
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        ctx.user = decoded;

        // Check roles if specified
        if (roles.length > 0 && !roles.includes(decoded.role)) {
          ctx.response.status = 403;
          ctx.response.json({ error: 'Insufficient permissions' });
          return;
        }
      } catch (error) {
        if (required) {
          ctx.response.status = 401;
          ctx.response.json({ error: 'Invalid token' });
          return;
        }
      }
    }

    await next();
  };
};

// Usage
app.get('/public', createAuthMiddleware({ required: false }), handler);
app.get('/admin', createAuthMiddleware({ roles: ['admin'] }), handler);
```

### Middleware Pipeline

```javascript
const createPipeline = (...middlewares) => {
  return async (ctx, next) => {
    let index = 0;

    const dispatch = async () => {
      if (index < middlewares.length) {
        const middleware = middlewares[index++];
        await middleware(ctx, dispatch);
      } else {
        await next();
      }
    };

    await dispatch();
  };
};

// Usage
const apiPipeline = createPipeline(
  authenticate,
  rateLimit(),
  validateRequest,
  auditLog
);

app.use('/api', apiPipeline);
```

## Performance Considerations

### Efficient Middleware

```javascript
// ✅ Good - Early return for non-matching requests
const apiOnlyMiddleware = async (ctx, next) => {
  if (!ctx.request.url.startsWith('/api/')) {
    await next();
    return;
  }

  // API-specific logic
  ctx.response.set('X-API-Version', '1.0');
  await next();
};

// ❌ Bad - Always executes logic
const inefficientMiddleware = async (ctx, next) => {
  ctx.response.set('X-API-Version', '1.0'); // Always sets header

  if (ctx.request.url.startsWith('/api/')) {
    // API logic
  }

  await next();
};
```

### Caching in Middleware

```javascript
const memoize = (fn, ttl = 300000) => {
  const cache = new Map();

  return async (...args) => {
    const key = JSON.stringify(args);
    const cached = cache.get(key);

    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.value;
    }

    const result = await fn(...args);
    cache.set(key, { value: result, timestamp: Date.now() });

    return result;
  };
};

// Cached database lookup middleware
const cachedUserMiddleware = async (ctx, next) => {
  if (ctx.user?.id) {
    const getUserFromDB = memoize(async (id) => {
      return await db.users.findById(id);
    });

    ctx.user = await getUserFromDB(ctx.user.id);
  }

  await next();
};
```

## Best Practices

1. **Keep middleware focused**: Each middleware should have a single responsibility
2. **Order matters**: Register middleware in the correct order
3. **Handle errors gracefully**: Always include error handling
4. **Use early returns**: Skip unnecessary processing when possible
5. **Avoid blocking operations**: Use async operations appropriately
6. **Test middleware independently**: Write unit tests for complex middleware
7. **Document middleware behavior**: Clearly document what each middleware does
8. **Consider performance**: Profile middleware in production scenarios

## Common Middleware Patterns

### Request/Response Transformation

```javascript
const transformResponse = async (ctx, next) => {
  await next();

  // Transform response data
  if (ctx.response.body && typeof ctx.response.body === 'object') {
    ctx.response.body = {
      success: true,
      data: ctx.response.body,
      timestamp: new Date().toISOString()
    };
  }
};
```

### Conditional Processing

```javascript
const conditionalMiddleware = (condition, middleware) => {
  return async (ctx, next) => {
    if (condition(ctx)) {
      await middleware(ctx, next);
    } else {
      await next();
    }
  };
};

// Usage
app.use(conditionalMiddleware(
  (ctx) => ctx.request.method === 'POST',
  validateBody(schema)
));
```

## Next Steps

- [HTTP Handling](http.md) - Learn about request and response objects
- [Error Handling](error-handling.md) - Comprehensive error management
- [Security Overview](../security/overview.md) - Security middleware
- [Performance Optimization](../performance/optimization.md) - Optimize middleware performance
