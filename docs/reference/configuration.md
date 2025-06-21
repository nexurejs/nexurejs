# Configuration Reference

This document provides a complete reference for all NexureJS configuration options.

## Table of Contents

- [Application Configuration](#application-configuration)
- [Server Configuration](#server-configuration)
- [Performance Configuration](#performance-configuration)
- [Security Configuration](#security-configuration)
- [Logging Configuration](#logging-configuration)
- [Environment Variables](#environment-variables)
- [Configuration Examples](#configuration-examples)

## Application Configuration

### Basic Configuration

```typescript
import { createApp } from 'nexurejs';

const app = createApp({
  // Application-level settings
  name: 'MyApp',
  version: '1.0.0',
  environment: process.env.NODE_ENV || 'development',

  // Global prefix for all routes
  globalPrefix: '/api/v1',

  // Enable/disable features
  features: {
    cors: true,
    compression: true,
    rateLimit: true,
    helmet: true
  }
});
```

### Configuration Interface

```typescript
interface NexureConfig {
  name?: string;
  version?: string;
  environment?: 'development' | 'production' | 'test';
  globalPrefix?: string;
  features?: FeatureConfig;
  server?: ServerConfig;
  performance?: PerformanceConfig;
  security?: SecurityConfig;
  logging?: LoggingConfig;
  middleware?: MiddlewareConfig;
}
```

## Server Configuration

### HTTP Server Options

```typescript
const app = createApp({
  server: {
    // Basic server settings
    port: 3000,
    hostname: '0.0.0.0',

    // Keep-alive settings
    keepAliveTimeout: 5000,
    headersTimeout: 60000,
    requestTimeout: 30000,

    // Connection limits
    maxConnections: 1000,
    timeout: 120000,

    // Body parsing limits
    bodyLimit: '10mb',
    jsonLimit: '1mb',
    textLimit: '1mb',

    // Enable/disable features
    trustProxy: false,
    etag: true,
    poweredBy: false
  }
});
```

### HTTPS Configuration

```typescript
import fs from 'fs';

const app = createApp({
  server: {
    port: 443,
    https: {
      key: fs.readFileSync('path/to/private-key.pem'),
      cert: fs.readFileSync('path/to/certificate.pem'),
      // Optional: CA certificates
      ca: fs.readFileSync('path/to/ca-certificate.pem'),
      // Optional: Request client certificates
      requestCert: false,
      rejectUnauthorized: false
    }
  }
});
```

### HTTP/2 Configuration

```typescript
const app = createApp({
  server: {
    port: 443,
    http2: {
      enabled: true,
      allowHTTP1: true,
      settings: {
        headerTableSize: 4096,
        enablePush: false,
        maxConcurrentStreams: 100,
        initialWindowSize: 65535,
        maxFrameSize: 16384,
        maxHeaderListSize: 8192
      }
    }
  }
});
```

## Performance Configuration

### Native Modules

```typescript
const app = createApp({
  performance: {
    // Enable native modules
    nativeModules: true,

    // Force native modules (fail if not available)
    forceNativeModules: false,

    // Native module configuration
    nativeModuleConfig: {
      verbose: false,
      maxCacheSize: 1000,
      preloadModules: true,

      // Module-specific settings
      httpParser: {
        enabled: true,
        maxHeaderSize: 8192,
        maxHeaders: 100
      },

      router: {
        enabled: true,
        cacheSize: 500,
        caseSensitive: false
      },

      jsonProcessor: {
        enabled: true,
        maxDepth: 32,
        maxStringLength: 1024 * 1024
      }
    }
  }
});
```

### Memory Management

```typescript
const app = createApp({
  performance: {
    // Memory optimization
    memoryOptimization: true,

    // Garbage collection settings
    gcInterval: 0, // 0 = disabled
    maxMemoryMB: 0, // 0 = unlimited

    // Buffer pool settings
    bufferPool: {
      enabled: true,
      maxSize: 100 * 1024 * 1024, // 100MB
      bufferSize: 64 * 1024, // 64KB
      maxBuffers: 1000
    },

    // Object pool settings
    objectPool: {
      enabled: true,
      maxObjects: 10000,
      cleanupInterval: 30000 // 30 seconds
    }
  }
});
```

### SIMD and Acceleration

```typescript
const app = createApp({
  performance: {
    // SIMD acceleration
    simd: {
      enabled: true,
      autoDetect: true,
      fallback: true,

      // Specific SIMD features
      features: {
        avx2: true,
        sse42: true,
        neon: true // ARM64
      }
    },

    // Hardware acceleration
    acceleration: {
      crypto: true,
      compression: true,
      hashing: true
    }
  }
});
```

## Security Configuration

### Basic Security

```typescript
const app = createApp({
  security: {
    // Enable security features
    enabled: true,

    // Helmet configuration
    helmet: {
      enabled: true,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"]
        }
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }
  }
});
```

### CORS Configuration

```typescript
const app = createApp({
  security: {
    cors: {
      enabled: true,
      origin: ['http://localhost:3000', 'https://myapp.com'],
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
      maxAge: 86400 // 24 hours
    }
  }
});
```

### Rate Limiting

```typescript
const app = createApp({
  security: {
    rateLimit: {
      enabled: true,
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP',

      // Advanced options
      standardHeaders: true,
      legacyHeaders: false,
      store: 'memory', // 'memory' | 'redis'

      // Skip certain requests
      skip: (req) => {
        return req.ip === '127.0.0.1';
      },

      // Custom key generator
      keyGenerator: (req) => {
        return req.ip;
      }
    }
  }
});
```

### Authentication

```typescript
const app = createApp({
  security: {
    auth: {
      jwt: {
        secret: process.env.JWT_SECRET,
        expiresIn: '24h',
        issuer: 'myapp.com',
        audience: 'myapp-users',

        // Cookie settings for JWT
        cookie: {
          name: 'token',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 24 * 60 * 60 * 1000 // 24 hours
        }
      },

      session: {
        secret: process.env.SESSION_SECRET,
        name: 'sessionId',
        resave: false,
        saveUninitialized: false,

        cookie: {
          secure: process.env.NODE_ENV === 'production',
          maxAge: 24 * 60 * 60 * 1000 // 24 hours
        }
      }
    }
  }
});
```

## Logging Configuration

### Basic Logging

```typescript
const app = createApp({
  logging: {
    // Log level
    level: 'info', // 'debug' | 'info' | 'warn' | 'error'

    // Log format
    format: 'pretty', // 'pretty' | 'json' | 'simple'

    // Log destination
    destination: 'console', // 'console' | 'file' | 'both'

    // File logging options
    file: {
      path: './logs/app.log',
      maxSize: '10m',
      maxFiles: 5,
      rotateDaily: true
    },

    // Enable/disable specific loggers
    loggers: {
      http: true,
      error: true,
      performance: true,
      security: true
    }
  }
});
```

### Advanced Logging

```typescript
const app = createApp({
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: 'json',

    // Custom log fields
    fields: {
      service: 'nexure-app',
      version: '1.0.0',
      environment: process.env.NODE_ENV
    },

    // Log sampling (for high-traffic applications)
    sampling: {
      enabled: process.env.NODE_ENV === 'production',
      rate: 0.1 // Log 10% of requests
    },

    // External logging services
    external: {
      // Winston transport
      winston: {
        transports: [
          // Custom Winston transports
        ]
      },

      // Structured logging
      structured: {
        enabled: true,
        includeStack: process.env.NODE_ENV === 'development'
      }
    }
  }
});
```

## Environment Variables

### Core Environment Variables

```bash
# Server configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# Security
JWT_SECRET=your-jwt-secret-key
SESSION_SECRET=your-session-secret-key
CORS_ORIGIN=https://yourdomain.com

# Performance
NEXUREJS_LITE_MODE=false
NEXUREJS_NATIVE_PATH=/path/to/native/modules
NEXUREJS_CACHE_SIZE=1000

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
LOG_FILE=./logs/app.log

# Database (if applicable)
DATABASE_URL=postgresql://user:pass@localhost:5432/db
REDIS_URL=redis://localhost:6379

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090
```

### Loading Environment Configuration

```typescript
import { config } from 'dotenv';

// Load environment variables
config();

const app = createApp({
  server: {
    port: parseInt(process.env.PORT || '3000'),
    hostname: process.env.HOST || '0.0.0.0'
  },

  security: {
    cors: {
      origin: process.env.CORS_ORIGIN?.split(',') || ['*']
    },

    rateLimit: {
      max: parseInt(process.env.RATE_LIMIT_MAX || '100')
    }
  },

  logging: {
    level: process.env.LOG_LEVEL as any || 'info',
    format: process.env.LOG_FORMAT as any || 'pretty'
  },

  performance: {
    nativeModules: process.env.NEXUREJS_LITE_MODE !== 'true'
  }
});
```

## Configuration Examples

### Development Configuration

```typescript
const developmentConfig = {
  server: {
    port: 3000,
    hostname: 'localhost'
  },

  performance: {
    nativeModules: true,
    memoryOptimization: false
  },

  security: {
    cors: {
      origin: ['http://localhost:3000', 'http://localhost:3001']
    },
    rateLimit: {
      max: 1000 // Higher limit for development
    }
  },

  logging: {
    level: 'debug',
    format: 'pretty',
    destination: 'console'
  }
};
```

### Production Configuration

```typescript
const productionConfig = {
  server: {
    port: parseInt(process.env.PORT || '80'),
    hostname: '0.0.0.0',
    trustProxy: true,
    https: {
      key: fs.readFileSync(process.env.SSL_KEY_PATH!),
      cert: fs.readFileSync(process.env.SSL_CERT_PATH!)
    }
  },

  performance: {
    nativeModules: true,
    memoryOptimization: true,
    gcInterval: 60000, // 1 minute
    maxMemoryMB: 512
  },

  security: {
    helmet: { enabled: true },
    cors: {
      origin: process.env.ALLOWED_ORIGINS?.split(',')
    },
    rateLimit: {
      max: 100,
      windowMs: 15 * 60 * 1000
    }
  },

  logging: {
    level: 'info',
    format: 'json',
    destination: 'both',
    file: {
      path: './logs/app.log',
      maxSize: '50m',
      maxFiles: 10
    }
  }
};
```

### Testing Configuration

```typescript
const testConfig = {
  server: {
    port: 0, // Random available port
    hostname: 'localhost'
  },

  performance: {
    nativeModules: false, // Use JS for consistent testing
    memoryOptimization: false
  },

  security: {
    rateLimit: { enabled: false }, // Disable for testing
    cors: { enabled: false }
  },

  logging: {
    level: 'error', // Only log errors during tests
    destination: 'console'
  }
};
```

### Microservice Configuration

```typescript
const microserviceConfig = {
  server: {
    port: parseInt(process.env.PORT || '3000'),
    keepAliveTimeout: 30000,
    requestTimeout: 10000 // Shorter timeouts for microservices
  },

  performance: {
    nativeModules: true,
    memoryOptimization: true,

    // Optimized for high throughput
    bufferPool: {
      maxSize: 50 * 1024 * 1024, // 50MB
      bufferSize: 32 * 1024 // 32KB
    }
  },

  security: {
    // Service-to-service authentication
    auth: {
      jwt: {
        secret: process.env.SERVICE_SECRET,
        issuer: 'service-mesh',
        audience: process.env.SERVICE_NAME
      }
    }
  },

  logging: {
    level: 'info',
    format: 'json',

    // Include service metadata
    fields: {
      service: process.env.SERVICE_NAME,
      version: process.env.SERVICE_VERSION,
      instance: process.env.INSTANCE_ID
    }
  }
};
```

## Configuration Validation

### Runtime Validation

```typescript
import Joi from 'joi';

const configSchema = Joi.object({
  server: Joi.object({
    port: Joi.number().port().required(),
    hostname: Joi.string().required()
  }).required(),

  security: Joi.object({
    cors: Joi.object({
      origin: Joi.alternatives().try(
        Joi.string(),
        Joi.array().items(Joi.string())
      )
    })
  }),

  logging: Joi.object({
    level: Joi.string().valid('debug', 'info', 'warn', 'error')
  })
});

// Validate configuration
const { error, value } = configSchema.validate(config);
if (error) {
  throw new Error(`Configuration validation failed: ${error.message}`);
}

const app = createApp(value);
```

## Best Practices

1. **Environment-Specific Configs**: Use different configurations for different environments
2. **Secret Management**: Never commit secrets to version control
3. **Validation**: Validate configuration at startup
4. **Documentation**: Document all configuration options
5. **Defaults**: Provide sensible defaults for all options
6. **Hot Reloading**: Consider supporting configuration hot reloading for non-critical settings
7. **Monitoring**: Monitor configuration changes in production

## Next Steps

- [API Reference](api.md) - Complete API documentation
- [Examples](examples.md) - Configuration examples in context
- [Security Guide](../security/overview.md) - Security configuration details
- [Performance Guide](../performance/optimization.md) - Performance configuration
