# Security Overview

NexureJS provides comprehensive security features to protect your applications from common web vulnerabilities. This guide covers the built-in security features and best practices for building secure applications.

## Table of Contents

- [Security Features](#security-features)
- [Built-in Security Middleware](#built-in-security-middleware)
- [Authentication & Authorization](#authentication--authorization)
- [Input Validation & Sanitization](#input-validation--sanitization)
- [HTTPS & Transport Security](#https--transport-security)
- [Security Headers](#security-headers)
- [Rate Limiting & DDoS Protection](#rate-limiting--ddos-protection)
- [CORS Configuration](#cors-configuration)
- [Security Best Practices](#security-best-practices)
- [Vulnerability Prevention](#vulnerability-prevention)

## Security Features

NexureJS includes several built-in security features:

- **Helmet Integration**: Automatic security headers
- **CORS Support**: Cross-Origin Resource Sharing configuration
- **Rate Limiting**: Request throttling and abuse prevention
- **Input Validation**: Schema-based request validation
- **JWT Authentication**: Secure token-based authentication
- **CSRF Protection**: Cross-Site Request Forgery prevention
- **XSS Protection**: Cross-Site Scripting mitigation
- **SQL Injection Prevention**: Parameterized query support
- **Session Security**: Secure session management

## Built-in Security Middleware

### Enable All Security Features

```javascript
import { createApp } from 'nexurejs';

const app = createApp({
  security: {
    // Enable all security features
    enabled: true,

    // Helmet configuration
    helmet: {
      enabled: true,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"]
        }
      },
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true
      }
    },

    // CORS configuration
    cors: {
      enabled: true,
      origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      credentials: true,
      maxAge: 86400 // 24 hours
    },

    // Rate limiting
    rateLimit: {
      enabled: true,
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false
    },

    // CSRF protection
    csrf: {
      enabled: true,
      secret: process.env.CSRF_SECRET || 'your-csrf-secret',
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      }
    }
  }
});
```

### Individual Security Middleware

```javascript
import {
  helmet,
  cors,
  rateLimit,
  csrfProtection
} from 'nexurejs/security';

// Apply security middleware individually
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  }
}));

app.use(cors({
  origin: ['https://myapp.com', 'https://admin.myapp.com'],
  credentials: true
}));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
}));

app.use(csrfProtection());
```

## Authentication & Authorization

### JWT Authentication

```javascript
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Login endpoint
app.post('/auth/login', async (ctx) => {
  const { email, password } = ctx.request.body;

  // Validate input
  if (!email || !password) {
    ctx.response.status = 400;
    ctx.response.json({ error: 'Email and password are required' });
    return;
  }

  try {
    // Find user
    const user = await findUserByEmail(email);
    if (!user) {
      ctx.response.status = 401;
      ctx.response.json({ error: 'Invalid credentials' });
      return;
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      ctx.response.status = 401;
      ctx.response.json({ error: 'Invalid credentials' });
      return;
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role
      },
      JWT_SECRET,
      {
        expiresIn: '24h',
        issuer: 'nexure-app',
        audience: 'nexure-users'
      }
    );

    // Set secure cookie
    ctx.response.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    ctx.response.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    ctx.response.status = 500;
    ctx.response.json({ error: 'Internal server error' });
  }
});

// Authentication middleware
const authenticate = async (ctx, next) => {
  const token = ctx.request.cookies.token ||
                ctx.request.headers.authorization?.replace('Bearer ', '');

  if (!token) {
    ctx.response.status = 401;
    ctx.response.json({ error: 'No token provided' });
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await findUserById(decoded.userId);

    if (!user) {
      ctx.response.status = 401;
      ctx.response.json({ error: 'Invalid token' });
      return;
    }

    ctx.user = user;
    await next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      ctx.response.status = 401;
      ctx.response.json({ error: 'Token expired' });
    } else {
      ctx.response.status = 401;
      ctx.response.json({ error: 'Invalid token' });
    }
  }
};

// Authorization middleware
const authorize = (roles = []) => {
  return async (ctx, next) => {
    if (!ctx.user) {
      ctx.response.status = 401;
      ctx.response.json({ error: 'Authentication required' });
      return;
    }

    if (roles.length > 0 && !roles.includes(ctx.user.role)) {
      ctx.response.status = 403;
      ctx.response.json({ error: 'Insufficient permissions' });
      return;
    }

    await next();
  };
};

// Protected routes
app.get('/profile', authenticate, (ctx) => {
  ctx.response.json({ user: ctx.user });
});

app.get('/admin', [authenticate, authorize(['admin'])], (ctx) => {
  ctx.response.json({ message: 'Admin area' });
});
```

### Session-Based Authentication

```javascript
import session from 'express-session';
import MongoStore from 'connect-mongo';

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'strict'
  }
}));

// Login with sessions
app.post('/auth/login', async (ctx) => {
  const { email, password } = ctx.request.body;

  const user = await authenticateUser(email, password);
  if (user) {
    ctx.session.userId = user.id;
    ctx.session.user = {
      id: user.id,
      email: user.email,
      role: user.role
    };
    ctx.response.json({ message: 'Login successful' });
  } else {
    ctx.response.status = 401;
    ctx.response.json({ error: 'Invalid credentials' });
  }
});

// Session authentication middleware
const sessionAuth = async (ctx, next) => {
  if (!ctx.session.userId) {
    ctx.response.status = 401;
    ctx.response.json({ error: 'Authentication required' });
    return;
  }

  ctx.user = ctx.session.user;
  await next();
};
```

## Input Validation & Sanitization

### Schema-Based Validation

```javascript
import Joi from 'joi';
import DOMPurify from 'isomorphic-dompurify';

// Validation schemas
const userSchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])')).required(),
  age: Joi.number().integer().min(13).max(120),
  role: Joi.string().valid('user', 'admin').default('user')
});

const postSchema = Joi.object({
  title: Joi.string().min(5).max(200).required(),
  content: Joi.string().min(10).max(10000).required(),
  tags: Joi.array().items(Joi.string().max(50)).max(10)
});

// Validation middleware
const validate = (schema) => {
  return async (ctx, next) => {
    try {
      const { error, value } = schema.validate(ctx.request.body, {
        abortEarly: false,
        allowUnknown: false,
        stripUnknown: true
      });

      if (error) {
        const validationErrors = error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message,
          value: detail.context.value
        }));

        ctx.response.status = 400;
        ctx.response.json({
          error: 'Validation failed',
          details: validationErrors
        });
        return;
      }

      ctx.request.body = value;
      await next();
    } catch (err) {
      ctx.response.status = 500;
      ctx.response.json({ error: 'Validation error' });
    }
  };
};

// Sanitization middleware
const sanitize = async (ctx, next) => {
  if (ctx.request.body) {
    // Sanitize HTML content
    if (ctx.request.body.content) {
      ctx.request.body.content = DOMPurify.sanitize(ctx.request.body.content);
    }

    // Sanitize other string fields
    Object.keys(ctx.request.body).forEach(key => {
      if (typeof ctx.request.body[key] === 'string') {
        // Remove potentially dangerous characters
        ctx.request.body[key] = ctx.request.body[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '');
      }
    });
  }

  await next();
};

// Usage
app.post('/users', [sanitize, validate(userSchema)], async (ctx) => {
  const userData = ctx.request.body;
  const user = await createUser(userData);
  ctx.response.status = 201;
  ctx.response.json(user);
});
```

## HTTPS & Transport Security

### HTTPS Configuration

```javascript
import fs from 'fs';
import https from 'https';

const app = createApp({
  server: {
    https: {
      key: fs.readFileSync('path/to/private-key.pem'),
      cert: fs.readFileSync('path/to/certificate.pem'),
      // Optional: CA certificates for client certificate validation
      ca: fs.readFileSync('path/to/ca-certificate.pem'),
      requestCert: false,
      rejectUnauthorized: false
    }
  }
});

// Force HTTPS in production
app.use(async (ctx, next) => {
  if (process.env.NODE_ENV === 'production' && !ctx.request.secure) {
    const httpsUrl = `https://${ctx.request.get('host')}${ctx.request.url}`;
    ctx.response.redirect(httpsUrl, 301);
    return;
  }
  await next();
});
```

### HTTP Strict Transport Security (HSTS)

```javascript
app.use(async (ctx, next) => {
  if (ctx.request.secure) {
    ctx.response.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  await next();
});
```

## Security Headers

### Comprehensive Security Headers

```javascript
const securityHeaders = async (ctx, next) => {
  // Content Security Policy
  ctx.response.set('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self'; " +
    "connect-src 'self'; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'"
  );

  // X-Frame-Options
  ctx.response.set('X-Frame-Options', 'DENY');

  // X-Content-Type-Options
  ctx.response.set('X-Content-Type-Options', 'nosniff');

  // X-XSS-Protection
  ctx.response.set('X-XSS-Protection', '1; mode=block');

  // Referrer Policy
  ctx.response.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy
  ctx.response.set('Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=()'
  );

  // Remove server information
  ctx.response.remove('X-Powered-By');
  ctx.response.remove('Server');

  await next();
};

app.use(securityHeaders);
```

## Rate Limiting & DDoS Protection

### Advanced Rate Limiting

```javascript
import { RateLimiterMemory, RateLimiterRedis } from 'rate-limiter-flexible';

// Memory-based rate limiter
const rateLimiter = new RateLimiterMemory({
  keyPrefix: 'middleware',
  points: 100, // Number of requests
  duration: 900, // Per 15 minutes
  blockDuration: 900, // Block for 15 minutes if limit exceeded
});

// Redis-based rate limiter for distributed systems
const rateLimiterRedis = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'middleware',
  points: 100,
  duration: 900,
  blockDuration: 900,
});

const rateLimitMiddleware = async (ctx, next) => {
  try {
    await rateLimiter.consume(ctx.request.ip);
    await next();
  } catch (rejRes) {
    const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
    ctx.response.set('Retry-After', String(secs));
    ctx.response.status = 429;
    ctx.response.json({
      error: 'Too many requests',
      retryAfter: secs
    });
  }
};

// Different limits for different endpoints
const createRateLimiter = (points, duration) => {
  const limiter = new RateLimiterMemory({
    points,
    duration,
    blockDuration: duration
  });

  return async (ctx, next) => {
    try {
      await limiter.consume(ctx.request.ip);
      await next();
    } catch (rejRes) {
      const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
      ctx.response.set('Retry-After', String(secs));
      ctx.response.status = 429;
      ctx.response.json({ error: 'Too many requests' });
    }
  };
};

// Apply different limits
app.use('/api/auth', createRateLimiter(5, 900)); // 5 requests per 15 minutes for auth
app.use('/api/upload', createRateLimiter(10, 3600)); // 10 uploads per hour
app.use('/api', createRateLimiter(1000, 3600)); // 1000 requests per hour for general API
```

## CORS Configuration

### Comprehensive CORS Setup

```javascript
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'https://myapp.com',
      'https://www.myapp.com',
      'https://admin.myapp.com',
      ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000', 'http://localhost:3001'] : [])
    ];

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-CSRF-Token'
  ],
  credentials: true,
  optionsSuccessStatus: 200, // For legacy browser support
  maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));
```

## Security Best Practices

### 1. Environment Variables

```javascript
// Use environment variables for sensitive data
const config = {
  jwtSecret: process.env.JWT_SECRET,
  dbPassword: process.env.DB_PASSWORD,
  apiKey: process.env.API_KEY,
  sessionSecret: process.env.SESSION_SECRET
};

// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET', 'DB_PASSWORD', 'SESSION_SECRET'];
requiredEnvVars.forEach(envVar => {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
});
```

### 2. Password Security

```javascript
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// Password hashing
const hashPassword = async (password) => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

// Password verification
const verifyPassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};

// Generate secure random tokens
const generateSecureToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Password strength validation
const validatePasswordStrength = (password) => {
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  return {
    isValid: password.length >= minLength && hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar,
    errors: [
      ...(password.length < minLength ? ['Password must be at least 8 characters long'] : []),
      ...(!hasUpperCase ? ['Password must contain at least one uppercase letter'] : []),
      ...(!hasLowerCase ? ['Password must contain at least one lowercase letter'] : []),
      ...(!hasNumbers ? ['Password must contain at least one number'] : []),
      ...(!hasSpecialChar ? ['Password must contain at least one special character'] : [])
    ]
  };
};
```

### 3. Secure File Uploads

```javascript
import multer from 'multer';
import path from 'path';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    // Generate secure filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  // Allowed file types
  const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Invalid file type'));
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Maximum 5 files
  },
  fileFilter: fileFilter
});

app.post('/upload', upload.array('files'), (ctx) => {
  // Process uploaded files
  const files = ctx.request.files;
  ctx.response.json({
    message: 'Files uploaded successfully',
    files: files.map(f => ({ name: f.filename, size: f.size }))
  });
});
```

## Vulnerability Prevention

### SQL Injection Prevention

```javascript
// Use parameterized queries
const getUserById = async (id) => {
  // ✅ Good - parameterized query
  const query = 'SELECT * FROM users WHERE id = ?';
  const result = await db.query(query, [id]);
  return result[0];
};

// ❌ Bad - string concatenation
const getUserByIdBad = async (id) => {
  const query = `SELECT * FROM users WHERE id = ${id}`;
  const result = await db.query(query);
  return result[0];
};
```

### XSS Prevention

```javascript
import DOMPurify from 'isomorphic-dompurify';

// Sanitize user input
const sanitizeInput = (input) => {
  if (typeof input === 'string') {
    return DOMPurify.sanitize(input);
  }
  return input;
};

// Escape HTML entities
const escapeHtml = (text) => {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
};
```

### CSRF Prevention

```javascript
import csrf from 'csurf';

// CSRF protection middleware
const csrfProtection = csrf({
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  }
});

app.use(csrfProtection);

// Provide CSRF token to client
app.get('/csrf-token', (ctx) => {
  ctx.response.json({ csrfToken: ctx.csrfToken() });
});
```

## Security Monitoring

### Security Event Logging

```javascript
const logSecurityEvent = (event, ctx, details = {}) => {
  const securityLog = {
    timestamp: new Date().toISOString(),
    event,
    ip: ctx.request.ip,
    userAgent: ctx.request.get('User-Agent'),
    url: ctx.request.url,
    method: ctx.request.method,
    user: ctx.user ? ctx.user.id : null,
    details,
    severity: getSeverity(event)
  };

  console.log('SECURITY_EVENT:', JSON.stringify(securityLog));

  // Send to security monitoring service
  if (securityLog.severity === 'HIGH') {
    alertSecurityTeam(securityLog);
  }
};

const getSeverity = (event) => {
  const highSeverityEvents = ['BRUTE_FORCE_ATTACK', 'SQL_INJECTION_ATTEMPT', 'XSS_ATTEMPT'];
  const mediumSeverityEvents = ['RATE_LIMIT_EXCEEDED', 'INVALID_TOKEN', 'CSRF_VIOLATION'];

  if (highSeverityEvents.includes(event)) return 'HIGH';
  if (mediumSeverityEvents.includes(event)) return 'MEDIUM';
  return 'LOW';
};
```

## Next Steps

- [Authentication Guide](authentication.md) - Detailed authentication implementation
- [Rate Limiting](rate-limiting.md) - Advanced rate limiting strategies
- [CSRF Protection](csrf.md) - Comprehensive CSRF prevention
- [Production Security](../deployment/production.md) - Production security checklist
