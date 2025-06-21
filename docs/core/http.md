# HTTP Handling

NexureJS provides powerful HTTP request and response handling capabilities with a clean, intuitive API. This guide covers everything from basic request/response operations to advanced features like streaming and file uploads.

## Table of Contents

- [HTTP Context](#http-context)
- [Request Object](#request-object)
- [Response Object](#response-object)
- [Headers](#headers)
- [Body Parsing](#body-parsing)
- [File Uploads](#file-uploads)
- [Streaming](#streaming)
- [Cookies](#cookies)
- [Content Negotiation](#content-negotiation)
- [HTTP/2 Support](#http2-support)

## HTTP Context

The HTTP context (`ctx`) is the main object that contains request and response information:

```typescript
interface HttpContext {
  request: Request;
  response: Response;
  params: Record<string, string>;
  query: Record<string, string>;
  app: NexureApp;
  [key: string]: any; // Custom properties
}
```

### Basic Usage

```javascript
app.get('/', (ctx) => {
  // Access request
  const method = ctx.request.method;
  const url = ctx.request.url;

  // Access route parameters
  const id = ctx.params.id;

  // Access query parameters
  const limit = ctx.query.limit;

  // Send response
  ctx.response.json({ message: 'Hello World' });
});
```

## Request Object

The request object provides access to all incoming request data:

### Basic Properties

```javascript
app.get('/info', (ctx) => {
  const {
    method,        // GET, POST, PUT, etc.
    url,          // Full URL path
    path,         // URL pathname
    query,        // Parsed query parameters
    headers,      // Request headers
    body,         // Parsed body (if middleware applied)
    ip,           // Client IP address
    protocol,     // http or https
    secure,       // true if HTTPS
    host,         // Host header
    hostname,     // Hostname without port
    port,         // Port number
    originalUrl   // Original URL before any modifications
  } = ctx.request;

  ctx.response.json({
    method,
    url,
    headers,
    ip,
    secure
  });
});
```

### Request Headers

```javascript
app.get('/headers', (ctx) => {
  // Get specific header
  const userAgent = ctx.request.get('User-Agent');
  const authorization = ctx.request.get('Authorization');

  // Get all headers
  const allHeaders = ctx.request.headers;

  // Check if header exists
  const hasAuth = ctx.request.has('Authorization');

  ctx.response.json({
    userAgent,
    authorization,
    hasAuth,
    allHeaders
  });
});
```

### Query Parameters

```javascript
app.get('/search', (ctx) => {
  const {
    q,              // Search query
    limit = 10,     // Default value
    page = 1,       // Default value
    sort = 'name'   // Default value
  } = ctx.query;

  // Type conversion
  const limitNum = parseInt(limit);
  const pageNum = parseInt(page);

  // Validation
  if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
    ctx.response.status = 400;
    ctx.response.json({ error: 'Invalid limit parameter' });
    return;
  }

  ctx.response.json({
    query: q,
    limit: limitNum,
    page: pageNum,
    sort
  });
});
```

### Route Parameters

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

// Optional parameters
app.get('/posts/:id?', (ctx) => {
  const id = ctx.params.id || 'all';
  ctx.response.json({ id });
});

// Wildcard parameters
app.get('/files/*', (ctx) => {
  const filePath = ctx.params['*'];
  ctx.response.json({ filePath });
});
```

## Response Object

The response object provides methods to send data back to the client:

### Basic Response Methods

```javascript
app.get('/examples', (ctx) => {
  // JSON response
  ctx.response.json({ message: 'Hello' });

  // Text response
  ctx.response.text('Plain text response');

  // HTML response
  ctx.response.html('<h1>Hello World</h1>');

  // Send file
  ctx.response.file('./path/to/file.pdf');

  // Raw response
  ctx.response.send('Any data');

  // Empty response
  ctx.response.end();
});
```

### Status Codes

```javascript
app.post('/users', (ctx) => {
  // Set status code
  ctx.response.status = 201;
  ctx.response.json({ message: 'User created' });

  // Or chain it
  ctx.response.status(201).json({ message: 'User created' });
});

app.get('/not-found', (ctx) => {
  ctx.response.status = 404;
  ctx.response.json({ error: 'Not found' });
});

app.get('/error', (ctx) => {
  ctx.response.status = 500;
  ctx.response.json({ error: 'Internal server error' });
});
```

### Response Headers

```javascript
app.get('/headers', (ctx) => {
  // Set single header
  ctx.response.set('X-Custom-Header', 'value');

  // Set multiple headers
  ctx.response.set({
    'X-API-Version': '1.0',
    'X-Request-ID': ctx.requestId,
    'Cache-Control': 'no-cache'
  });

  // Append to header
  ctx.response.append('Set-Cookie', 'session=abc123');

  // Remove header
  ctx.response.remove('X-Powered-By');

  ctx.response.json({ message: 'Headers set' });
});
```

## Headers

### Common Header Operations

```javascript
app.get('/api/data', (ctx) => {
  // Content-Type
  ctx.response.type = 'application/json';
  // or
  ctx.response.set('Content-Type', 'application/json');

  // Cache headers
  ctx.response.set('Cache-Control', 'public, max-age=3600');
  ctx.response.set('ETag', '"123456"');

  // Security headers
  ctx.response.set('X-Frame-Options', 'DENY');
  ctx.response.set('X-Content-Type-Options', 'nosniff');

  // CORS headers
  ctx.response.set('Access-Control-Allow-Origin', '*');
  ctx.response.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');

  ctx.response.json({ data: 'response' });
});
```

### Conditional Responses

```javascript
app.get('/conditional', (ctx) => {
  const etag = '"123456"';
  const lastModified = new Date('2024-01-01').toUTCString();

  // Set headers
  ctx.response.set('ETag', etag);
  ctx.response.set('Last-Modified', lastModified);

  // Check if-none-match
  if (ctx.request.get('If-None-Match') === etag) {
    ctx.response.status = 304;
    ctx.response.end();
    return;
  }

  // Check if-modified-since
  const ifModifiedSince = ctx.request.get('If-Modified-Since');
  if (ifModifiedSince && new Date(ifModifiedSince) >= new Date(lastModified)) {
    ctx.response.status = 304;
    ctx.response.end();
    return;
  }

  ctx.response.json({ data: 'fresh content' });
});
```

## Body Parsing

### JSON Body Parsing

```javascript
import { jsonBodyParser } from 'nexurejs/middleware';

app.use(jsonBodyParser({
  limit: '10mb',
  strict: true
}));

app.post('/users', (ctx) => {
  const userData = ctx.request.body;

  // Validate required fields
  if (!userData.name || !userData.email) {
    ctx.response.status = 400;
    ctx.response.json({ error: 'Name and email are required' });
    return;
  }

  ctx.response.status = 201;
  ctx.response.json({ message: 'User created', user: userData });
});
```

### URL-Encoded Body Parsing

```javascript
import { urlencodedBodyParser } from 'nexurejs/middleware';

app.use(urlencodedBodyParser({
  limit: '1mb',
  extended: true
}));

app.post('/form', (ctx) => {
  const formData = ctx.request.body;
  ctx.response.json({ received: formData });
});
```

### Raw Body Parsing

```javascript
import { rawBodyParser } from 'nexurejs/middleware';

app.use(rawBodyParser({
  limit: '50mb',
  type: 'application/octet-stream'
}));

app.post('/upload', (ctx) => {
  const buffer = ctx.request.body;
  // Process raw buffer
  ctx.response.json({ size: buffer.length });
});
```

### Custom Body Parser

```javascript
const xmlBodyParser = async (ctx, next) => {
  if (ctx.request.get('Content-Type')?.includes('application/xml')) {
    let body = '';

    ctx.request.on('data', chunk => {
      body += chunk.toString();
    });

    ctx.request.on('end', () => {
      try {
        // Parse XML (using a library like xml2js)
        ctx.request.body = parseXML(body);
      } catch (error) {
        ctx.request.body = null;
      }
    });

    // Wait for body to be parsed
    await new Promise(resolve => ctx.request.on('end', resolve));
  }

  await next();
};

app.use(xmlBodyParser);
```

## File Uploads

### Multipart Form Data

```javascript
import { multipartParser } from 'nexurejs/middleware';

app.use(multipartParser({
  uploadDir: './uploads',
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 5
}));

app.post('/upload', (ctx) => {
  const { files, fields } = ctx.request.body;

  // Process uploaded files
  files.forEach(file => {
    console.log(`Uploaded: ${file.originalname} (${file.size} bytes)`);
  });

  ctx.response.json({
    message: 'Files uploaded successfully',
    files: files.map(f => ({
      name: f.originalname,
      size: f.size,
      path: f.path
    })),
    fields
  });
});
```

### Single File Upload

```javascript
app.post('/avatar', (ctx) => {
  const file = ctx.request.files.avatar;

  if (!file) {
    ctx.response.status = 400;
    ctx.response.json({ error: 'No file uploaded' });
    return;
  }

  // Validate file type
  if (!file.mimetype.startsWith('image/')) {
    ctx.response.status = 400;
    ctx.response.json({ error: 'Only images are allowed' });
    return;
  }

  // Validate file size
  if (file.size > 5 * 1024 * 1024) { // 5MB
    ctx.response.status = 400;
    ctx.response.json({ error: 'File too large' });
    return;
  }

  ctx.response.json({
    message: 'Avatar uploaded successfully',
    file: {
      name: file.originalname,
      size: file.size,
      path: file.path
    }
  });
});
```

## Streaming

### Response Streaming

```javascript
import { createReadStream } from 'fs';

app.get('/download/:filename', (ctx) => {
  const filename = ctx.params.filename;
  const filePath = `./files/${filename}`;

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    ctx.response.status = 404;
    ctx.response.json({ error: 'File not found' });
    return;
  }

  // Set headers
  ctx.response.set('Content-Type', 'application/octet-stream');
  ctx.response.set('Content-Disposition', `attachment; filename="${filename}"`);

  // Stream file
  const stream = createReadStream(filePath);
  ctx.response.stream(stream);
});
```

### Request Streaming

```javascript
app.post('/stream-upload', (ctx) => {
  let totalSize = 0;

  ctx.request.on('data', chunk => {
    totalSize += chunk.length;
    console.log(`Received ${chunk.length} bytes, total: ${totalSize}`);
  });

  ctx.request.on('end', () => {
    ctx.response.json({
      message: 'Stream completed',
      totalSize
    });
  });

  ctx.request.on('error', error => {
    console.error('Stream error:', error);
    ctx.response.status = 500;
    ctx.response.json({ error: 'Stream error' });
  });
});
```

### Server-Sent Events

```javascript
app.get('/events', (ctx) => {
  // Set SSE headers
  ctx.response.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });

  // Send initial event
  ctx.response.write('data: Connected to event stream\n\n');

  // Send periodic updates
  const interval = setInterval(() => {
    const data = JSON.stringify({
      timestamp: new Date().toISOString(),
      message: 'Hello from server'
    });

    ctx.response.write(`data: ${data}\n\n`);
  }, 1000);

  // Cleanup on disconnect
  ctx.request.on('close', () => {
    clearInterval(interval);
  });
});
```

## Cookies

### Setting Cookies

```javascript
app.get('/set-cookie', (ctx) => {
  // Simple cookie
  ctx.response.cookie('session', 'abc123');

  // Cookie with options
  ctx.response.cookie('user', 'john_doe', {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    domain: '.example.com',
    path: '/'
  });

  ctx.response.json({ message: 'Cookies set' });
});
```

### Reading Cookies

```javascript
import { cookieParser } from 'nexurejs/middleware';

app.use(cookieParser());

app.get('/get-cookies', (ctx) => {
  // Get specific cookie
  const session = ctx.request.cookies.session;

  // Get all cookies
  const allCookies = ctx.request.cookies;

  ctx.response.json({
    session,
    allCookies
  });
});
```

### Clearing Cookies

```javascript
app.get('/logout', (ctx) => {
  // Clear specific cookie
  ctx.response.clearCookie('session');

  // Clear cookie with options
  ctx.response.clearCookie('user', {
    domain: '.example.com',
    path: '/'
  });

  ctx.response.json({ message: 'Logged out' });
});
```

## Content Negotiation

### Accept Header Handling

```javascript
app.get('/data', (ctx) => {
  const accept = ctx.request.get('Accept');

  const data = { message: 'Hello World', timestamp: new Date() };

  if (accept?.includes('application/xml')) {
    ctx.response.type = 'application/xml';
    ctx.response.send(`
      <response>
        <message>${data.message}</message>
        <timestamp>${data.timestamp}</timestamp>
      </response>
    `);
  } else if (accept?.includes('text/plain')) {
    ctx.response.type = 'text/plain';
    ctx.response.send(`${data.message} - ${data.timestamp}`);
  } else {
    ctx.response.json(data);
  }
});
```

### Language Negotiation

```javascript
app.get('/hello', (ctx) => {
  const acceptLanguage = ctx.request.get('Accept-Language');

  let message = 'Hello World'; // Default

  if (acceptLanguage?.includes('es')) {
    message = 'Hola Mundo';
  } else if (acceptLanguage?.includes('fr')) {
    message = 'Bonjour le monde';
  } else if (acceptLanguage?.includes('de')) {
    message = 'Hallo Welt';
  }

  ctx.response.json({ message });
});
```

## HTTP/2 Support

### HTTP/2 Configuration

```javascript
import fs from 'fs';

const app = createApp({
  server: {
    http2: {
      enabled: true,
      allowHTTP1: true
    },
    https: {
      key: fs.readFileSync('path/to/private-key.pem'),
      cert: fs.readFileSync('path/to/certificate.pem')
    }
  }
});
```

### Server Push

```javascript
app.get('/page', (ctx) => {
  // Check if HTTP/2 is available
  if (ctx.request.httpVersion === '2.0') {
    // Push resources
    ctx.response.push('/styles.css', {
      'content-type': 'text/css'
    });

    ctx.response.push('/script.js', {
      'content-type': 'application/javascript'
    });
  }

  ctx.response.html(`
    <!DOCTYPE html>
    <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
      </head>
      <body>
        <h1>Hello HTTP/2</h1>
        <script src="/script.js"></script>
      </body>
    </html>
  `);
});
```

## Advanced HTTP Features

### Custom Request/Response Extensions

```javascript
// Extend request object
app.use(async (ctx, next) => {
  // Add custom methods to request
  ctx.request.isAjax = () => {
    return ctx.request.get('X-Requested-With') === 'XMLHttpRequest';
  };

  ctx.request.isJSON = () => {
    return ctx.request.get('Content-Type')?.includes('application/json');
  };

  // Add custom methods to response
  ctx.response.apiResponse = (data, message = 'Success') => {
    ctx.response.json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  };

  await next();
});

// Usage
app.get('/api/users', (ctx) => {
  const users = getUsersFromDB();
  ctx.response.apiResponse(users, 'Users retrieved successfully');
});
```

### Request Validation

```javascript
const validateRequest = (schema) => {
  return async (ctx, next) => {
    const errors = [];

    // Validate headers
    if (schema.headers) {
      for (const [header, validator] of Object.entries(schema.headers)) {
        const value = ctx.request.get(header);
        if (!validator(value)) {
          errors.push(`Invalid header: ${header}`);
        }
      }
    }

    // Validate query parameters
    if (schema.query) {
      for (const [param, validator] of Object.entries(schema.query)) {
        const value = ctx.query[param];
        if (!validator(value)) {
          errors.push(`Invalid query parameter: ${param}`);
        }
      }
    }

    if (errors.length > 0) {
      ctx.response.status = 400;
      ctx.response.json({ errors });
      return;
    }

    await next();
  };
};

// Usage
app.get('/api/search',
  validateRequest({
    query: {
      q: (value) => value && value.length >= 3,
      limit: (value) => !value || (parseInt(value) > 0 && parseInt(value) <= 100)
    }
  }),
  (ctx) => {
    // Handle validated request
  }
);
```

## Best Practices

1. **Always validate input**: Validate all request data before processing
2. **Set appropriate status codes**: Use correct HTTP status codes
3. **Handle errors gracefully**: Provide meaningful error messages
4. **Use streaming for large data**: Stream large responses to avoid memory issues
5. **Set security headers**: Include appropriate security headers
6. **Implement caching**: Use caching headers for better performance
7. **Validate file uploads**: Always validate uploaded files
8. **Use HTTPS in production**: Always use HTTPS for production applications

## Next Steps

- [Error Handling](error-handling.md) - Comprehensive error management
- [Middleware System](middleware.md) - Request/response processing
- [Security Overview](../security/overview.md) - HTTP security features
- [Performance Optimization](../performance/optimization.md) - HTTP performance tuning
