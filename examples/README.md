# NexureJS Examples

Welcome to the NexureJS examples collection! This directory contains comprehensive, real-world examples demonstrating how to build high-performance applications with NexureJS.

## 🚀 Quick Start

**New to NexureJS?** Start here:
1. [Basic Server](basic/simple-server.js) - Your first NexureJS server
2. [Middleware Basics](basic/middleware-basics.js) - Understanding middleware
3. [API Development](api/input-validation.js) - Building REST APIs

**Want performance?** Jump to:
- [Native Modules](native-modules/) - Leverage C++ performance
- [Streaming](performance/streaming.js) - Handle large data efficiently
- [Worker Pools](adaptive-worker-pool-demo.js) - Scale with workers

## 📁 Directory Structure

```
examples/
├── basic/                    # 🟢 Getting Started
│   ├── simple-server.js     # Minimal HTTP server
│   ├── middleware-basics.js # Middleware patterns
│   ├── error-handling-example.js # Error handling
│   ├── basic-server.js      # Basic server setup
│   └── fixed-example.js     # Working example
├── api/                      # 🔵 API Development
│   └── input-validation.js  # Request validation
├── performance/              # ⚡ Performance Examples
│   ├── streaming.js          # Stream processing
│   ├── worker.js            # Worker threads
│   └── index.ts             # Performance monitoring
├── security/                 # 🔒 Security Examples
│   └── index.ts             # Authentication & authorization
├── native-modules/           # 🏎️ Native Performance
│   ├── simple.js            # Basic native usage
│   └── index.ts             # Advanced native features
├── middleware/               # 🔧 Advanced Middleware
│   └── index.ts             # Custom middleware patterns
├── real-world/               # 🌍 Complete Applications
│   └── task-api/            # Full REST API example
├── production-examples/      # 🏭 Production Ready
│   ├── high-performance-api.cjs    # Optimized API server
│   └── realtime-websocket-server.cjs # WebSocket server
├── specialized/              # 🎯 Specialized Examples
│   ├── jwt-auth-example.ts   # JWT authentication
│   ├── static-file-server.js # Static file serving
│   ├── adaptive-buffer-example.js # Buffer optimization
│   ├── adaptive-timeout-example.js # Timeout management
│   ├── adaptive-worker-pool-demo.js # Worker scaling
│   ├── native-websocket.ts   # Native WebSocket
│   ├── optimized-stream-example.js # Stream optimization
│   └── phase2-optimization-showcase.cjs # Advanced optimizations
├── utilities/                # 🛠️ Development Utilities
│   ├── fallback-demo.js      # Native fallback demo
│   ├── worker-task.js        # Worker task example
│   └── import-without-extensions.md # Import guide
├── stream-body-parsing/      # 🌊 Stream Body Parsing
├── secure-websocket/         # 🔐 Secure WebSocket Chat
└── production-api/           # 🏭 Production API Server
```

## 🎯 Examples by Use Case

### 🟢 **Learning NexureJS** (Start Here)
- **[Basic Server](basic/simple-server.js)** - Minimal HTTP server with routing
- **[Middleware Basics](basic/middleware-basics.js)** - Request/response middleware
- **[Error Handling](basic/error-handling-example.js)** - Robust error management

### 🔵 **Building REST APIs**
- **[Input Validation](api/input-validation.js)** - Schema validation & sanitization
- **[Task API](real-world/task-api/)** - Complete CRUD API
- **[High-Performance API](production-examples/high-performance-api.cjs)** - Production-ready API

### 🔒 **Security & Authentication**
- **[JWT Authentication](specialized/jwt-auth-example.ts)** - Token-based auth
- **[Security Patterns](security/index.ts)** - CSRF, rate limiting, headers
- **[Secure WebSocket](secure-websocket/)** - Authenticated real-time communication

### ⚡ **Performance Optimization**
- **[Native Modules](native-modules/)** - C++ performance boost
- **[Streaming](performance/streaming.js)** - Memory-efficient data processing
- **[Worker Pools](specialized/adaptive-worker-pool-demo.js)** - CPU-intensive task handling
- **[Buffer Management](specialized/adaptive-buffer-example.js)** - Optimized memory usage

### 🌐 **Real-Time Applications**
- **[WebSocket Server](production-examples/realtime-websocket-server.cjs)** - Production WebSocket
- **[Native WebSocket](specialized/native-websocket.ts)** - High-performance WebSocket
- **[Secure Chat](secure-websocket/)** - Complete chat application

### 🏭 **Production Deployment**
- **[Production API](production-api/)** - Enterprise-ready API server
- **[Static File Server](specialized/static-file-server.js)** - Efficient static serving
- **[Performance Monitoring](performance/index.ts)** - Metrics & monitoring

## 🏃‍♂️ Running Examples

### Prerequisites
```bash
# Install dependencies
npm install

# Build TypeScript examples (if needed)
npm run build
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

### Examples with Dependencies
```bash
# Examples with specific setup
cd examples/production-api && npm install && node server.js
cd examples/secure-websocket && npm install && npm start
```

## 📖 Learning Paths

### 🎓 **Beginner Path** (2-4 hours)
1. [Basic Server](basic/simple-server.js) - Learn the fundamentals
2. [Middleware Basics](basic/middleware-basics.js) - Understand request flow
3. [Input Validation](api/input-validation.js) - Build your first API
4. [Error Handling](basic/error-handling-example.js) - Handle errors gracefully

### 🎯 **Intermediate Path** (4-8 hours)
1. [JWT Authentication](specialized/jwt-auth-example.ts) - Secure your APIs
2. [Streaming](performance/streaming.js) - Handle large data
3. [Worker Pools](specialized/adaptive-worker-pool-demo.js) - Scale with concurrency
4. [Real-World API](real-world/task-api/) - Complete application

### 🚀 **Advanced Path** (8-16 hours)
1. [Native Modules](native-modules/) - Maximum performance
2. [Production API](production-examples/high-performance-api.cjs) - Enterprise patterns
3. [WebSocket Server](production-examples/realtime-websocket-server.cjs) - Real-time apps
4. [Performance Monitoring](performance/index.ts) - Production monitoring

## 🔧 Development & Testing

### Testing Examples
```bash
# Test basic functionality
npm run test:examples

# Performance benchmarks
npm run benchmark:examples

# Load testing
npm run load-test:examples
```

### Creating New Examples
1. Choose appropriate directory (`basic/`, `api/`, `performance/`, etc.)
2. Include comprehensive comments and documentation
3. Add error handling and logging
4. Test with various inputs and edge cases
5. Update this README with your example

### Example Template
```javascript
/**
 * Example Name
 *
 * Description of what this example demonstrates
 *
 * Usage: node examples/category/example-name.js
 *
 * Key concepts:
 * - Concept 1
 * - Concept 2
 * - Concept 3
 */

import { Nexure } from '../src/index.js';

// Example implementation here...
```

## 📚 Additional Resources

- **[Getting Started Guide](../docs/getting-started/)** - Complete setup guide
- **[API Reference](../docs/reference/api.md)** - Full API documentation
- **[Performance Guide](../docs/performance/)** - Optimization techniques
- **[Security Guide](../docs/security/)** - Security best practices
- **[Deployment Guide](../docs/deployment/)** - Production deployment

## 🤝 Contributing Examples

We welcome new examples! Please:

1. **Follow the existing patterns** - Use similar structure and documentation
2. **Include real-world scenarios** - Show practical applications
3. **Add comprehensive comments** - Help others learn
4. **Test thoroughly** - Ensure examples work as expected
5. **Update documentation** - Add your example to this README

### Example Categories We Need
- [ ] GraphQL API examples
- [ ] Database integration examples
- [ ] Microservices patterns
- [ ] Docker deployment examples
- [ ] Testing and mocking examples
- [ ] Monitoring and observability
- [ ] CI/CD pipeline examples

## 🆘 Getting Help

- **Documentation**: [docs/](../docs/)
- **Issues**: [GitHub Issues](https://github.com/Braineanear/nexurejs/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Braineanear/nexurejs/discussions)
- **Examples Guide**: [docs/reference/examples.md](../docs/reference/examples.md)

---

**Happy coding with NexureJS!** 🚀

Start with the [Basic Server](basic/simple-server.js) and work your way up to production-ready applications.
