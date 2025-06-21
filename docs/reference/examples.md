# NexureJS Examples Guide

This comprehensive guide covers all examples included in the NexureJS framework, demonstrating real-world usage patterns and best practices.

## 🎯 Quick Navigation

- **[🟢 Basic Examples](#basic-examples)** - Start here if you're new to NexureJS
- **[🔵 API Development](#api-development-examples)** - Building REST APIs
- **[⚡ Performance Examples](#performance-examples)** - Optimization techniques
- **[🔒 Security Examples](#security-examples)** - Authentication & security
- **[🏎️ Native Modules](#native-modules-examples)** - C++ performance
- **[🔧 Middleware Examples](#middleware-examples)** - Advanced middleware patterns
- **[🎯 Specialized Examples](#specialized-examples)** - Advanced use cases
- **[🛠️ Utilities](#utility-examples)** - Development helpers

## 📁 Example Organization

The examples are organized into logical categories:

```
examples/
├── basic/                    # 🟢 Getting Started
├── api/                      # 🔵 API Development
├── performance/              # ⚡ Performance Examples
├── security/                 # 🔒 Security Examples
├── native-modules/           # 🏎️ Native Performance
├── middleware/               # 🔧 Advanced Middleware
├── specialized/              # 🎯 Specialized Examples
├── utilities/                # 🛠️ Development Utilities
├── real-world/               # 🌍 Complete Applications
├── production-examples/      # 🏭 Production Ready
├── stream-body-parsing/      # 🌊 Stream Processing
├── secure-websocket/         # 🔐 Secure WebSocket
└── production-api/           # 🏭 Production API
```

## 🏃‍♂️ Running Examples

### Prerequisites
```bash
# Install dependencies
npm install

# Build TypeScript examples (if needed)
npm run build

# Build native modules (for native examples)
npm run build:native
```

### JavaScript Examples
```bash
# Run from project root
node examples/basic/simple-server.js
node examples/api/input-validation.js
node examples/performance/streaming.js
```

### TypeScript Examples
```bash
# Option 1: Run directly with ts-node
npx ts-node examples/security/index.ts
npx ts-node examples/performance/index.ts

# Option 2: Compile then run
npm run build
node dist/examples/security/index.js
```

## 🟢 Basic Examples

Perfect for developers new to NexureJS. These examples cover fundamental concepts and patterns.

### Simple Server (`basic/simple-server.js`)

**What it demonstrates:**
- Creating a basic HTTP server
- Route definition and handling
- Request parameter extraction
- JSON response formatting
- Basic error handling

**Key concepts:**
- Nexure application setup
- Route handlers
- Middleware usage
- Response methods

**Running:**
```bash
node examples/basic/simple-server.js
# Visit: http://localhost:3000
```

### Middleware Basics (`basic/middleware-basics.js`)

**What it demonstrates:**
- Global middleware application
- Route-specific middleware
- Authentication middleware
- Error handling middleware
- Middleware chaining

**Key concepts:**
- Middleware functions
- Request/response flow
- Authentication patterns
- Error propagation

**Running:**
```bash
node examples/basic/middleware-basics.js
# Try: curl -H "Authorization: Bearer valid-demo-token" http://localhost:3000/api/profile
```

### Error Handling (`basic/error-handling-example.js`)

**What it demonstrates:**
- Custom error types
- Error middleware
- Development vs production error handling
- Error logging and monitoring

**Key concepts:**
- HttpException classes
- Error middleware patterns
- Stack trace handling
- Error response formatting

**Running:**
```bash
node examples/basic/error-handling-example.js
```

## 🔵 API Development Examples

Learn how to build robust, production-ready REST APIs with comprehensive validation and error handling.

### Input Validation (`api/input-validation.js`)

**What it demonstrates:**
- Schema-based validation
- Custom validation rules
- Validation middleware factory
- Detailed error messages
- Reusable validation patterns

**Key concepts:**
- Validation schemas
- Custom validators
- Error formatting
- Middleware composition

**Running:**
```bash
node examples/api/input-validation.js

# Test valid user creation:
curl -X POST -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com","password":"SecureP@ss123","age":30}' \
  http://localhost:3000/api/users

# Test invalid data:
curl -X POST -H "Content-Type: application/json" \
  -d '{"name":"J","email":"not-an-email","password":"weak"}' \
  http://localhost:3000/api/users
```

## ⚡ Performance Examples

Discover how to optimize your applications for maximum performance using NexureJS's advanced features.

### Streaming (`performance/streaming.js`)

**What it demonstrates:**
- File upload/download with streams
- Memory-efficient data processing
- Custom transform streams
- Compression handling
- Large dataset generation

**Key concepts:**
- Stream pipelines
- Transform streams
- Memory optimization
- Backpressure handling

**Running:**
```bash
node examples/performance/streaming.js

# Test file upload:
curl -X POST -H "file-name: test.txt" \
  --data-binary @somefile.txt \
  http://localhost:3000/api/upload

# Generate large JSON:
curl "http://localhost:3000/api/generate/json?count=10000" > large.json
```

### Performance Monitoring (`performance/index.ts`)

**What it demonstrates:**
- Performance metrics collection
- Memory monitoring
- Event loop monitoring
- Custom performance markers
- Worker pool management

**Key concepts:**
- PerformanceMonitor usage
- Metrics collection
- Resource monitoring
- Performance optimization

**Running:**
```bash
npx ts-node examples/performance/index.ts
```

## 🔒 Security Examples

Learn how to implement robust security measures including authentication, authorization, and protection against common attacks.

### Security Patterns (`security/index.ts`)

**What it demonstrates:**
- JWT authentication
- Role-based authorization
- CSRF protection
- Rate limiting
- Security headers

**Key concepts:**
- Authentication middleware
- Authorization patterns
- Security best practices
- Attack prevention

**Running:**
```bash
npx ts-node examples/security/index.ts
```

## 🏎️ Native Modules Examples

Leverage C++ performance with NexureJS's native modules for maximum speed and efficiency.

### Basic Native Usage (`native-modules/simple.js`)

**What it demonstrates:**
- Native module loading
- HTTP parser usage
- JSON processor usage
- Router performance
- Performance comparison

**Key concepts:**
- Native module configuration
- Performance benchmarking
- Fallback handling
- Module status checking

**Running:**
```bash
node examples/native-modules/simple.js
```

### Advanced Native Features (`native-modules/index.ts`)

**What it demonstrates:**
- Advanced native configurations
- Performance monitoring
- Native module status
- Optimization techniques

**Key concepts:**
- Native module configuration
- Performance metrics
- Advanced optimizations
- System integration

**Running:**
```bash
npx ts-node examples/native-modules/index.ts
```

## 🔧 Middleware Examples

Advanced middleware patterns for complex applications.

### Advanced Middleware (`middleware/index.ts`)

**What it demonstrates:**
- Class-based middleware
- Dependency injection in middleware
- Complex authentication flows
- Middleware composition patterns

**Key concepts:**
- Injectable middleware
- Controller middleware
- Authentication flows
- Middleware chaining

**Running:**
```bash
npx ts-node examples/middleware/index.ts
```

## 🎯 Specialized Examples

Advanced examples for specific use cases and optimization scenarios.

### JWT Authentication (`specialized/jwt-auth-example.ts`)

**What it demonstrates:**
- Complete JWT implementation
- Token generation and validation
- Protected routes
- Role-based access control

**Key concepts:**
- JWT tokens
- Authentication middleware
- Route protection
- Role validation

**Running:**
```bash
npx ts-node examples/specialized/jwt-auth-example.ts
```

### Adaptive Buffer Management (`specialized/adaptive-buffer-example.js`)

**What it demonstrates:**
- Dynamic buffer pool optimization
- Memory usage patterns
- Performance comparison
- Adaptive algorithms

**Key concepts:**
- Buffer pools
- Memory optimization
- Adaptive strategies
- Performance monitoring

**Running:**
```bash
node examples/specialized/adaptive-buffer-example.js
```

### Adaptive Worker Pool (`specialized/adaptive-worker-pool-demo.js`)

**What it demonstrates:**
- Dynamic worker scaling
- Load balancing
- Performance monitoring
- Task distribution

**Key concepts:**
- Worker threads
- Dynamic scaling
- Load monitoring
- Task management

**Running:**
```bash
node examples/specialized/adaptive-worker-pool-demo.js
```

### Static File Server (`specialized/static-file-server.js`)

**What it demonstrates:**
- Efficient static file serving
- Caching strategies
- Compression handling
- Performance optimization

**Key concepts:**
- Static file handling
- Cache headers
- Compression
- Performance optimization

**Running:**
```bash
node examples/specialized/static-file-server.js
```

## 🛠️ Utility Examples

Development utilities and helper guides.

### Fallback Demo (`utilities/fallback-demo.js`)

**What it demonstrates:**
- Native module fallback behavior
- JavaScript fallback handling
- Module loading strategies
- Error handling

**Key concepts:**
- Fallback mechanisms
- Module loading
- Error handling
- Compatibility

**Running:**
```bash
node examples/utilities/fallback-demo.js
node examples/utilities/fallback-demo.js --force-js
```

### Import Without Extensions (`utilities/import-without-extensions.md`)

**What it provides:**
- Complete setup guide for TypeScript
- Import configuration
- Build process setup
- Development workflow

**Key concepts:**
- TypeScript configuration
- Module resolution
- Build processes
- Development setup

## 🌍 Real-World Examples

Complete application examples showing how to build production-ready systems.

### Task API (`real-world/task-api/`)

**What it demonstrates:**
- Complete CRUD API
- Database integration patterns
- Authentication
- Error handling
- API documentation

**Key concepts:**
- REST API design
- Data persistence
- Authentication flows
- Error handling

### Production API (`production-api/`)

**What it demonstrates:**
- Enterprise-ready API structure
- Advanced middleware
- Performance optimization
- Monitoring and logging

**Key concepts:**
- Production architecture
- Scalability patterns
- Monitoring
- Error handling

### High-Performance API (`production-examples/high-performance-api.cjs`)

**What it demonstrates:**
- Maximum performance configuration
- Native module integration
- Advanced optimizations
- Production monitoring

**Key concepts:**
- Performance optimization
- Native modules
- Production deployment
- Monitoring

## 📊 Performance Benchmarks

Many examples include performance benchmarks showing:

- **Native vs JavaScript performance** - 2-20x improvements
- **Memory usage optimization** - 30-70% reduction
- **Throughput improvements** - 50-200% increase
- **Latency reduction** - 20-50% improvement

## 🎓 Learning Paths

### Beginner (2-4 hours)
1. [Simple Server](basic/simple-server.js)
2. [Middleware Basics](basic/middleware-basics.js)
3. [Input Validation](api/input-validation.js)
4. [Error Handling](basic/error-handling-example.js)

### Intermediate (4-8 hours)
1. [JWT Authentication](specialized/jwt-auth-example.ts)
2. [Streaming](performance/streaming.js)
3. [Worker Pools](specialized/adaptive-worker-pool-demo.js)
4. [Real-World API](real-world/task-api/)

### Advanced (8-16 hours)
1. [Native Modules](native-modules/)
2. [Production API](production-examples/high-performance-api.cjs)
3. [WebSocket Server](production-examples/realtime-websocket-server.cjs)
4. [Performance Monitoring](performance/index.ts)

## 🚀 Next Steps

After exploring the examples:

1. **Read the [Getting Started Guide](../getting-started/)** for comprehensive setup
2. **Check the [API Reference](api.md)** for detailed documentation
3. **Explore [Performance Optimization](../performance/)** for advanced techniques
4. **Review [Security Best Practices](../security/)** for production deployment

---

**Ready to build?** Start with the [Simple Server](basic/simple-server.js) and work your way up to production-ready applications! 🚀
