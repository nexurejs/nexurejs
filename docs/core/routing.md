# Routing System

NexureJS provides a powerful and flexible routing system with support for route parameters, query parameters, middleware, and high-performance route matching using a radix tree algorithm.

## Table of Contents

- [Basic Routing](#basic-routing)
- [Route Parameters](#route-parameters)
- [Query Parameters](#query-parameters)
- [HTTP Methods](#http-methods)
- [Route Middleware](#route-middleware)
- [Route Groups](#route-groups)
- [Advanced Routing](#advanced-routing)
- [Performance Optimization](#performance-optimization)

## Basic Routing

### Simple Routes

```javascript
import { createApp } from 'nexurejs';

const app = createApp();

// Basic GET route
app.get('/', (ctx) => {
  ctx.response.json({ message: 'Hello, World!' });
});

// Basic POST route
app.post('/users', (ctx) => {
  ctx.response.json({ message: 'User created' });
});

// Basic PUT route
app.put('/users/:id', (ctx) => {
  ctx.response.json({ message: `User ${ctx.params.id} updated` });
});

// Basic DELETE route
app.delete('/users/:id', (ctx) => {
  ctx.response.json({ message: `User ${ctx.params.id} deleted` });
});
```

### Route Method

You can also use the generic `route` method:

```javascript
app.route({
  path: '/users',
  method: 'GET',
  handler: (ctx) => {
    ctx.response.json({ users: [] });
  }
});

app.route({
  path: '/users/:id',
  method: 'GET',
  handler: (ctx) => {
    const userId = ctx.params.id;
    ctx.response.json({ id: userId, name: `User ${userId}` });
  }
});
```

## Route Parameters

### Named Parameters

Use `:paramName` syntax to define named parameters:

```javascript
// Single parameter
app.get('/users/:id', (ctx) => {
  const userId = ctx.params.id;
  ctx.response.json({ userId });
});

// Multiple parameters
app.get('/users/:userId/posts/:postId', (ctx) => {
  const { userId, postId } = ctx.params;
  ctx.response.json({ userId, postId });
});

// Parameter with type constraints
app.get('/users/:id(\\d+)', (ctx) => {
  const userId = parseInt(ctx.params.id);
  ctx.response.json({ userId });
});
```

### Optional Parameters

```javascript
// Optional parameter
app.get('/posts/:id?', (ctx) => {
  const id = ctx.params.id || 'all';
  if (id === 'all') {
    ctx.response.json({ posts: getAllPosts() });
  } else {
    ctx.response.json({ post: getPostById(id) });
  }
});
```

### Wildcard Parameters

```javascript
// Catch-all wildcard
app.get('/files/*', (ctx) => {
  const filePath = ctx.params['*'];
  ctx.response.json({ filePath });
});

// Named wildcard
app.get('/api/v1/:version/*path', (ctx) => {
  const { version, path } = ctx.params;
  ctx.response.json({ version, path });
});
```

## Query Parameters

Query parameters are automatically parsed and available in `ctx.query`:

```javascript
app.get('/search', (ctx) => {
  const {
    q,           // search query
    limit = 10,  // default limit
    page = 1,    // default page
    sort = 'name' // default sort
  } = ctx.query;

  ctx.response.json({
    query: q,
    limit: parseInt(limit),
    page: parseInt(page),
    sort,
    results: performSearch(q, { limit, page, sort })
  });
});
```

### Query Parameter Validation

```javascript
app.get('/products', (ctx) => {
  const { category, minPrice, maxPrice } = ctx.query;

  // Validate query parameters
  if (minPrice && isNaN(Number(minPrice))) {
    ctx.response.status = 400;
    ctx.response.json({ error: 'minPrice must be a number' });
    return;
  }

  if (maxPrice && isNaN(Number(maxPrice))) {
    ctx.response.status = 400;
    ctx.response.json({ error: 'maxPrice must be a number' });
    return;
  }

  const filters = {
    category,
    minPrice: minPrice ? Number(minPrice) : undefined,
    maxPrice: maxPrice ? Number(maxPrice) : undefined
  };

  ctx.response.json({
    products: getProducts(filters)
  });
});
```

## HTTP Methods

NexureJS supports all standard HTTP methods:

```javascript
const app = createApp();

// Standard HTTP methods
app.get('/resource', getHandler);
app.post('/resource', createHandler);
app.put('/resource/:id', updateHandler);
app.patch('/resource/:id', patchHandler);
app.delete('/resource/:id', deleteHandler);
app.head('/resource/:id', headHandler);
app.options('/resource', optionsHandler);

// Handle all methods
app.all('/resource/:id', (ctx) => {
  ctx.response.json({
    method: ctx.request.method,
    id: ctx.params.id
  });
});
```

### Method-Specific Logic

```javascript
app.route({
  path: '/users/:id',
  method: ['GET', 'PUT', 'DELETE'],
  handler: (ctx) => {
    const { method } = ctx.request;
    const { id } = ctx.params;

    switch (method) {
      case 'GET':
        return getUserHandler(ctx, id);
      case 'PUT':
        return updateUserHandler(ctx, id);
      case 'DELETE':
        return deleteUserHandler(ctx, id);
      default:
        ctx.response.status = 405;
        ctx.response.json({ error: 'Method not allowed' });
    }
  }
});
```

## Route Middleware

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
  // Verify token logic
  await next();
};

// Validation middleware
const validateUser = async (ctx, next) => {
  const { name, email } = ctx.request.body;
  if (!name || !email) {
    ctx.response.status = 400;
    ctx.response.json({ error: 'Name and email are required' });
    return;
  }
  await next();
};

// Apply middleware to specific routes
app.get('/profile', authenticate, getProfileHandler);
app.post('/users', [authenticate, validateUser], createUserHandler);
```

### Multiple Middleware

```javascript
app.route({
  path: '/admin/users',
  method: 'POST',
  middleware: [
    authenticate,
    requireAdmin,
    validateUser,
    auditLog
  ],
  handler: createAdminUserHandler
});
```

## Route Groups

### Creating Route Groups

```javascript
import { Router } from 'nexurejs';

// Create a router for API v1
const apiV1 = new Router();

apiV1.get('/users', getUsersHandler);
apiV1.get('/users/:id', getUserHandler);
apiV1.post('/users', createUserHandler);
apiV1.put('/users/:id', updateUserHandler);
apiV1.delete('/users/:id', deleteUserHandler);

// Mount the router with a prefix
app.use('/api/v1', apiV1);

// Create a router for admin routes
const adminRouter = new Router();

adminRouter.use(authenticate);
adminRouter.use(requireAdmin);

adminRouter.get('/dashboard', adminDashboardHandler);
adminRouter.get('/users', adminUsersHandler);
adminRouter.get('/settings', adminSettingsHandler);

app.use('/admin', adminRouter);
```

### Nested Route Groups

```javascript
const apiRouter = new Router();
const v1Router = new Router();
const v2Router = new Router();

// V1 routes
v1Router.get('/users', v1GetUsersHandler);
v1Router.post('/users', v1CreateUserHandler);

// V2 routes (with breaking changes)
v2Router.get('/users', v2GetUsersHandler);
v2Router.post('/users', v2CreateUserHandler);

// Mount version routers
apiRouter.use('/v1', v1Router);
apiRouter.use('/v2', v2Router);

// Mount API router
app.use('/api', apiRouter);
```

## Advanced Routing

### Route Constraints

```javascript
// Numeric constraint
app.get('/users/:id(\\d+)', (ctx) => {
  const userId = parseInt(ctx.params.id);
  ctx.response.json({ userId });
});

// UUID constraint
app.get('/resources/:id([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})', (ctx) => {
  const resourceId = ctx.params.id;
  ctx.response.json({ resourceId });
});

// Custom constraint
app.get('/files/:filename(.+\\.(jpg|png|gif))', (ctx) => {
  const filename = ctx.params.filename;
  ctx.response.json({ filename, type: 'image' });
});
```

### Dynamic Route Registration

```javascript
// Register routes dynamically
const resources = ['users', 'posts', 'comments'];

resources.forEach(resource => {
  app.get(`/${resource}`, (ctx) => {
    ctx.response.json({ resource, action: 'list' });
  });

  app.get(`/${resource}/:id`, (ctx) => {
    ctx.response.json({ resource, action: 'get', id: ctx.params.id });
  });

  app.post(`/${resource}`, (ctx) => {
    ctx.response.json({ resource, action: 'create' });
  });
});
```

### Route Conditions

```javascript
// Conditional routing based on headers
app.get('/api/data', (ctx) => {
  const acceptHeader = ctx.request.headers.accept;

  if (acceptHeader?.includes('application/xml')) {
    ctx.response.set('Content-Type', 'application/xml');
    ctx.response.send('<data>XML response</data>');
  } else {
    ctx.response.json({ data: 'JSON response' });
  }
});

// Conditional routing based on subdomain
app.get('/', (ctx) => {
  const host = ctx.request.headers.host;
  const subdomain = host?.split('.')[0];

  if (subdomain === 'api') {
    ctx.response.json({ message: 'API endpoint' });
  } else if (subdomain === 'admin') {
    ctx.response.json({ message: 'Admin panel' });
  } else {
    ctx.response.json({ message: 'Main site' });
  }
});
```

## Performance Optimization

### Route Caching

NexureJS automatically caches compiled routes for better performance:

```javascript
const app = createApp({
  routing: {
    cacheSize: 1000,  // Maximum number of routes to cache
    caseSensitive: false,  // Case-sensitive route matching
    strictRouting: false   // Strict trailing slash handling
  }
});
```

### Route Ordering

Place more specific routes before general ones:

```javascript
// ✅ Correct order
app.get('/users/profile', getProfileHandler);
app.get('/users/:id', getUserHandler);

// ❌ Incorrect order - profile will never be reached
app.get('/users/:id', getUserHandler);
app.get('/users/profile', getProfileHandler);
```

### Optimized Route Patterns

```javascript
// ✅ Efficient - specific patterns first
app.get('/api/v1/users', v1UsersHandler);
app.get('/api/v2/users', v2UsersHandler);
app.get('/api/:version/users', genericUsersHandler);

// ✅ Efficient - use constraints to reduce backtracking
app.get('/users/:id(\\d+)', getUserByIdHandler);
app.get('/users/:username([a-zA-Z0-9_]+)', getUserByUsernameHandler);
```

### Route Metrics

Monitor route performance:

```javascript
app.get('/metrics/routes', (ctx) => {
  const routeMetrics = ctx.app.getRouteMetrics();
  ctx.response.json(routeMetrics);
});
```

## Error Handling in Routes

### Route-Level Error Handling

```javascript
app.get('/users/:id', async (ctx) => {
  try {
    const user = await getUserById(ctx.params.id);
    if (!user) {
      ctx.response.status = 404;
      ctx.response.json({ error: 'User not found' });
      return;
    }
    ctx.response.json(user);
  } catch (error) {
    ctx.response.status = 500;
    ctx.response.json({ error: 'Internal server error' });
  }
});
```

### Custom Error Classes

```javascript
class NotFoundError extends Error {
  constructor(resource) {
    super(`${resource} not found`);
    this.status = 404;
  }
}

class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.status = 400;
    this.field = field;
  }
}

app.get('/users/:id', async (ctx) => {
  const user = await getUserById(ctx.params.id);
  if (!user) {
    throw new NotFoundError('User');
  }
  ctx.response.json(user);
});
```

## Best Practices

1. **Use Specific Routes First**: Place more specific routes before general ones
2. **Group Related Routes**: Use routers to organize related functionality
3. **Validate Parameters**: Always validate route and query parameters
4. **Use Middleware**: Apply common logic through middleware
5. **Handle Errors Gracefully**: Implement proper error handling
6. **Monitor Performance**: Track route performance and optimize accordingly
7. **Use Constraints**: Use parameter constraints to improve matching performance
8. **Document Routes**: Maintain clear documentation for your API routes

## Next Steps

- [Middleware System](middleware.md) - Learn about request/response processing
- [HTTP Handling](http.md) - Understand request and response objects
- [Error Handling](error-handling.md) - Implement comprehensive error management
- [Performance Guide](../performance/optimization.md) - Optimize your routes
