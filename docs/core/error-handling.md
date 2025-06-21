# Error Handling

Robust error handling is crucial for building reliable web applications. NexureJS provides comprehensive error handling capabilities that help you catch, process, and respond to errors gracefully.

## Table of Contents

- [Error Handling Basics](#error-handling-basics)
- [Global Error Handler](#global-error-handler)
- [Custom Error Classes](#custom-error-classes)
- [Async Error Handling](#async-error-handling)
- [Validation Errors](#validation-errors)
- [HTTP Error Responses](#http-error-responses)
- [Error Logging](#error-logging)
- [Production Error Handling](#production-error-handling)
- [Error Recovery](#error-recovery)
- [Best Practices](#best-practices)

## Error Handling Basics

### Basic Try-Catch

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
    console.error('Error fetching user:', error);
    ctx.response.status = 500;
    ctx.response.json({ error: 'Internal server error' });
  }
});
```

### Throwing Errors

```javascript
app.post('/users', async (ctx) => {
  const { email } = ctx.request.body;

  // Check if user already exists
  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    // Throw an error that will be caught by error handler
    const error = new Error('User already exists');
    error.status = 409; // Conflict
    error.code = 'USER_EXISTS';
    throw error;
  }

  const user = await createUser(ctx.request.body);
  ctx.response.status = 201;
  ctx.response.json(user);
});
```

## Global Error Handler

### Basic Global Error Handler

```javascript
const globalErrorHandler = async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    console.error('Application error:', error);

    // Set default status
    ctx.response.status = error.status || 500;

    // Send error response
    ctx.response.json({
      error: error.message || 'Internal Server Error',
      code: error.code || 'INTERNAL_ERROR',
      ...(process.env.NODE_ENV === 'development' && {
        stack: error.stack
      })
    });
  }
};

// Register as the last middleware
app.use(globalErrorHandler);
```

### Advanced Global Error Handler

```javascript
const advancedErrorHandler = async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    // Log error with context
    console.error('Error occurred:', {
      message: error.message,
      stack: error.stack,
      url: ctx.request.url,
      method: ctx.request.method,
      ip: ctx.request.ip,
      userAgent: ctx.request.get('User-Agent'),
      timestamp: new Date().toISOString()
    });

    // Determine error type and status
    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal Server Error';

    if (error.name === 'ValidationError') {
      status = 400;
      code = 'VALIDATION_ERROR';
      message = error.message;
    } else if (error.name === 'UnauthorizedError') {
      status = 401;
      code = 'UNAUTHORIZED';
      message = 'Unauthorized access';
    } else if (error.name === 'ForbiddenError') {
      status = 403;
      code = 'FORBIDDEN';
      message = 'Access forbidden';
    } else if (error.name === 'NotFoundError') {
      status = 404;
      code = 'NOT_FOUND';
      message = error.message;
    } else if (error.status) {
      status = error.status;
      code = error.code || 'HTTP_ERROR';
      message = error.message;
    }

    ctx.response.status = status;

    // Different response format for API vs web requests
    const isApiRequest = ctx.request.url.startsWith('/api/');

    if (isApiRequest) {
      ctx.response.json({
        success: false,
        error: {
          code,
          message,
          ...(error.details && { details: error.details }),
          ...(process.env.NODE_ENV === 'development' && {
            stack: error.stack,
            originalError: error.originalError
          })
        },
        timestamp: new Date().toISOString(),
        requestId: ctx.requestId
      });
    } else {
      // Render error page for web requests
      ctx.response.html(`
        <html>
          <body>
            <h1>Error ${status}</h1>
            <p>${message}</p>
            ${process.env.NODE_ENV === 'development' ?
              `<pre>${error.stack}</pre>` : ''}
          </body>
        </html>
      `);
    }
  }
};

app.use(advancedErrorHandler);
```

## Custom Error Classes

### Base Error Class

```javascript
class AppError extends Error {
  constructor(message, status = 500, code = null, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();

    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp
    };
  }
}
```

### Specific Error Classes

```javascript
class ValidationError extends AppError {
  constructor(message, field = null, value = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.field = field;
    this.value = value;
  }
}

class NotFoundError extends AppError {
  constructor(resource, id = null) {
    const message = id ?
      `${resource} with id ${id} not found` :
      `${resource} not found`;
    super(message, 404, 'NOT_FOUND');
    this.resource = resource;
    this.resourceId = id;
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'Access forbidden') {
    super(message, 403, 'FORBIDDEN');
  }
}

class ConflictError extends AppError {
  constructor(message, resource = null) {
    super(message, 409, 'CONFLICT');
    this.resource = resource;
  }
}

class RateLimitError extends AppError {
  constructor(retryAfter = null) {
    super('Rate limit exceeded', 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfter = retryAfter;
  }
}
```

### Usage Examples

```javascript
// Validation error
app.post('/users', async (ctx) => {
  const { email, name } = ctx.request.body;

  if (!email) {
    throw new ValidationError('Email is required', 'email');
  }

  if (!isValidEmail(email)) {
    throw new ValidationError('Invalid email format', 'email', email);
  }

  // Create user...
});

// Not found error
app.get('/users/:id', async (ctx) => {
  const user = await getUserById(ctx.params.id);

  if (!user) {
    throw new NotFoundError('User', ctx.params.id);
  }

  ctx.response.json(user);
});

// Conflict error
app.post('/users', async (ctx) => {
  const { email } = ctx.request.body;

  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    throw new ConflictError('User with this email already exists', 'User');
  }

  // Create user...
});
```

## Async Error Handling

### Promise Rejection Handling

```javascript
// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);

  // Log to monitoring service
  logError({
    type: 'unhandledRejection',
    reason: reason.toString(),
    stack: reason.stack,
    timestamp: new Date().toISOString()
  });

  // Graceful shutdown in production
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// Catch uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);

  // Log to monitoring service
  logError({
    type: 'uncaughtException',
    message: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString()
  });

  // Graceful shutdown
  process.exit(1);
});
```

### Async Route Handlers

```javascript
// Wrapper for async route handlers
const asyncHandler = (fn) => {
  return async (ctx, next) => {
    try {
      await fn(ctx, next);
    } catch (error) {
      // Pass error to global error handler
      throw error;
    }
  };
};

// Usage
app.get('/users', asyncHandler(async (ctx) => {
  const users = await getUsersFromDatabase();
  ctx.response.json(users);
}));

// Or with automatic wrapping
const wrapAsyncRoutes = (app) => {
  const originalGet = app.get;
  const originalPost = app.post;
  const originalPut = app.put;
  const originalDelete = app.delete;

  app.get = (path, ...handlers) => {
    const wrappedHandlers = handlers.map(handler =>
      typeof handler === 'function' ? asyncHandler(handler) : handler
    );
    return originalGet.call(app, path, ...wrappedHandlers);
  };

  // Repeat for other methods...
};

wrapAsyncRoutes(app);
```

## Validation Errors

### Schema Validation

```javascript
import Joi from 'joi';

const validateSchema = (schema) => {
  return async (ctx, next) => {
    try {
      const { error, value } = schema.validate(ctx.request.body, {
        abortEarly: false, // Return all errors
        allowUnknown: false,
        stripUnknown: true
      });

      if (error) {
        const validationErrors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context.value
        }));

        throw new ValidationError('Validation failed', null, validationErrors);
      }

      ctx.request.body = value; // Use validated/sanitized data
      await next();
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError('Validation error occurred');
    }
  };
};

// Schema definition
const userSchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  age: Joi.number().integer().min(13).max(120),
  role: Joi.string().valid('user', 'admin').default('user')
});

// Usage
app.post('/users', validateSchema(userSchema), async (ctx) => {
  const userData = ctx.request.body; // Validated data
  const user = await createUser(userData);
  ctx.response.status = 201;
  ctx.response.json(user);
});
```

### Custom Validation

```javascript
const validateUser = async (ctx, next) => {
  const { name, email, password } = ctx.request.body;
  const errors = [];

  // Name validation
  if (!name) {
    errors.push({ field: 'name', message: 'Name is required' });
  } else if (name.length < 2) {
    errors.push({ field: 'name', message: 'Name must be at least 2 characters' });
  }

  // Email validation
  if (!email) {
    errors.push({ field: 'email', message: 'Email is required' });
  } else if (!isValidEmail(email)) {
    errors.push({ field: 'email', message: 'Invalid email format' });
  } else {
    // Check if email already exists
    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      errors.push({ field: 'email', message: 'Email already in use' });
    }
  }

  // Password validation
  if (!password) {
    errors.push({ field: 'password', message: 'Password is required' });
  } else if (password.length < 8) {
    errors.push({ field: 'password', message: 'Password must be at least 8 characters' });
  }

  if (errors.length > 0) {
    const validationError = new ValidationError('Validation failed');
    validationError.details = errors;
    throw validationError;
  }

  await next();
};
```

## HTTP Error Responses

### Standardized Error Responses

```javascript
const createErrorResponse = (error, ctx) => {
  const response = {
    success: false,
    error: {
      code: error.code || 'UNKNOWN_ERROR',
      message: error.message,
      timestamp: new Date().toISOString(),
      path: ctx.request.url,
      method: ctx.request.method
    }
  };

  // Add request ID if available
  if (ctx.requestId) {
    response.requestId = ctx.requestId;
  }

  // Add validation details
  if (error.details) {
    response.error.details = error.details;
  }

  // Add field information for validation errors
  if (error.field) {
    response.error.field = error.field;
  }

  // Add retry information for rate limit errors
  if (error.retryAfter) {
    response.error.retryAfter = error.retryAfter;
    ctx.response.set('Retry-After', error.retryAfter);
  }

  // Add debug information in development
  if (process.env.NODE_ENV === 'development') {
    response.debug = {
      stack: error.stack,
      originalError: error.originalError
    };
  }

  return response;
};
```

### Status Code Mapping

```javascript
const getStatusCodeFromError = (error) => {
  // Custom status
  if (error.status) {
    return error.status;
  }

  // Error name mapping
  const statusMap = {
    'ValidationError': 400,
    'SyntaxError': 400,
    'UnauthorizedError': 401,
    'JsonWebTokenError': 401,
    'TokenExpiredError': 401,
    'ForbiddenError': 403,
    'NotFoundError': 404,
    'ConflictError': 409,
    'RateLimitError': 429,
    'PayloadTooLargeError': 413,
    'UnsupportedMediaTypeError': 415
  };

  return statusMap[error.name] || 500;
};
```

## Error Logging

### Structured Logging

```javascript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

const logError = (error, ctx) => {
  const logData = {
    message: error.message,
    stack: error.stack,
    name: error.name,
    code: error.code,
    status: error.status,
    timestamp: new Date().toISOString(),
    request: {
      method: ctx.request.method,
      url: ctx.request.url,
      headers: ctx.request.headers,
      ip: ctx.request.ip,
      userAgent: ctx.request.get('User-Agent')
    },
    user: ctx.user ? { id: ctx.user.id, email: ctx.user.email } : null,
    requestId: ctx.requestId
  };

  // Log based on severity
  if (error.status >= 500) {
    logger.error('Server error occurred', logData);
  } else if (error.status >= 400) {
    logger.warn('Client error occurred', logData);
  } else {
    logger.info('Error occurred', logData);
  }
};
```

### Error Monitoring Integration

```javascript
// Integration with error monitoring services
const reportError = async (error, ctx) => {
  try {
    // Send to monitoring service (e.g., Sentry, Bugsnag)
    await errorMonitoringService.captureException(error, {
      tags: {
        component: 'api',
        environment: process.env.NODE_ENV
      },
      user: ctx.user ? {
        id: ctx.user.id,
        email: ctx.user.email
      } : null,
      request: {
        method: ctx.request.method,
        url: ctx.request.url,
        headers: ctx.request.headers,
        ip: ctx.request.ip
      },
      extra: {
        requestId: ctx.requestId,
        timestamp: new Date().toISOString()
      }
    });
  } catch (reportingError) {
    console.error('Failed to report error:', reportingError);
  }
};
```

## Production Error Handling

### Graceful Shutdown

```javascript
const gracefulShutdown = (server) => {
  const shutdown = () => {
    console.log('Received shutdown signal, closing server...');

    server.close(() => {
      console.log('Server closed successfully');
      process.exit(0);
    });

    // Force close after timeout
    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
};

// Usage
const server = await app.start(3000);
gracefulShutdown(server);
```

### Health Checks

```javascript
app.get('/health', (ctx) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version
  };

  // Add database health check
  try {
    // Check database connection
    health.database = 'connected';
  } catch (error) {
    health.status = 'unhealthy';
    health.database = 'disconnected';
    ctx.response.status = 503;
  }

  ctx.response.json(health);
});
```

## Error Recovery

### Circuit Breaker Pattern

```javascript
class CircuitBreaker {
  constructor(threshold = 5, timeout = 60000) {
    this.threshold = threshold;
    this.timeout = timeout;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
  }

  async execute(operation) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.threshold) {
      this.state = 'OPEN';
    }
  }
}

// Usage
const dbCircuitBreaker = new CircuitBreaker(3, 30000);

app.get('/users', async (ctx) => {
  try {
    const users = await dbCircuitBreaker.execute(async () => {
      return await getUsersFromDatabase();
    });

    ctx.response.json(users);
  } catch (error) {
    if (error.message === 'Circuit breaker is OPEN') {
      ctx.response.status = 503;
      ctx.response.json({
        error: 'Service temporarily unavailable',
        code: 'SERVICE_UNAVAILABLE'
      });
    } else {
      throw error;
    }
  }
});
```

### Retry Logic

```javascript
const retry = async (operation, maxAttempts = 3, delay = 1000) => {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) {
        throw error;
      }

      // Exponential backoff
      const waitTime = delay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw lastError;
};

// Usage
app.get('/external-data', async (ctx) => {
  try {
    const data = await retry(async () => {
      const response = await fetch('https://api.external.com/data');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    }, 3, 1000);

    ctx.response.json(data);
  } catch (error) {
    throw new AppError('Failed to fetch external data', 502, 'EXTERNAL_SERVICE_ERROR');
  }
});
```

## Best Practices

1. **Use Global Error Handler**: Always implement a global error handler as the last middleware
2. **Create Custom Error Classes**: Use specific error classes for different error types
3. **Log Errors Properly**: Include context information in error logs
4. **Don't Expose Internal Errors**: Never expose internal error details to clients in production
5. **Validate Input Early**: Validate all input data as early as possible
6. **Handle Async Errors**: Properly handle errors in async operations
7. **Implement Circuit Breakers**: Use circuit breakers for external service calls
8. **Monitor Error Rates**: Track error rates and patterns in production
9. **Graceful Degradation**: Provide fallback functionality when possible
10. **Test Error Scenarios**: Write tests for error conditions

## Error Testing

```javascript
// Test error handling
describe('Error Handling', () => {
  it('should handle validation errors', async () => {
    const response = await request(app)
      .post('/users')
      .send({ name: '' }) // Invalid data
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details).toBeInstanceOf(Array);
  });

  it('should handle not found errors', async () => {
    const response = await request(app)
      .get('/users/nonexistent')
      .expect(404);

    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('should handle server errors', async () => {
    // Mock database error
    jest.spyOn(database, 'getUser').mockRejectedValue(new Error('DB Error'));

    const response = await request(app)
      .get('/users/1')
      .expect(500);

    expect(response.body.error.code).toBe('INTERNAL_ERROR');
  });
});
```

## Next Steps

- [Security Overview](../security/overview.md) - Security error handling
- [Performance Optimization](../performance/optimization.md) - Error handling performance
- [Testing Guide](../development/testing.md) - Testing error scenarios
- [Production Deployment](../deployment/production.md) - Production error handling
