# NexureJS

<p align="center">
  <img src="./assets/images/nexurejs-logo.png" alt="NexureJS Logo" width="300">
</p>

<p align="center">
  <strong>Ultimate high-performance Node.js framework with SIMD acceleration, native memory management, and advanced optimization.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/nexurejs"><img src="https://img.shields.io/npm/v/nexurejs.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/nexurejs"><img src="https://img.shields.io/npm/dm/nexurejs.svg" alt="downloads"></a>
  <a href="https://github.com/nexurejs/nexurejs/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/nexurejs.svg" alt="license"></a>
  <img src="https://img.shields.io/badge/Node.js-16%2B-green.svg" alt="Node.js version">
</p>

**NexureJS** is a cutting-edge, high-performance Node.js framework engineered for speed, efficiency, and scalability. With native C++ modules, SIMD optimization, and advanced memory management, NexureJS delivers **3-8x faster performance** than Express.js while maintaining developer-friendly APIs.

## 🚀 Performance Highlights

Recent benchmark results (June 2025) on macOS ARM64 with Node.js v23.11.0:

| Metric | Result |
|--------|--------|
| **Basic Routing** | 7,858 req/s |
| **JSON Processing** | 6,509 req/s |
| **Response Time** | 0.116ms avg |
| **Memory Usage** | 11.4 MB |
| **Success Rate** | 100% |

*See [detailed benchmark results](docs/performance/benchmark-results.md) for complete analysis.*

## ✨ Key Features

### 🏎️ Performance & Speed
- **Native C++ Modules**: SIMD-accelerated operations for maximum performance
- **Advanced Memory Management**: Smart buffer pooling and garbage collection optimization
- **Zero-Copy Operations**: Minimize memory allocations for better throughput
- **HTTP/2 & HTTP/3 Support**: Modern protocol support out of the box

### 🛡️ Security & Reliability
- **Built-in Security Headers**: CORS, CSP, HSTS, and more
- **Advanced Rate Limiting**: Token bucket and sliding window algorithms
- **JWT Authentication**: Native JWT support with RS256/ES256
- **Input Validation**: Schema-based validation with type safety

### 🔧 Developer Experience
- **TypeScript First**: Full TypeScript support with excellent IntelliSense
- **Decorator Support**: Modern decorator patterns for routes and middleware
- **Dependency Injection**: Enterprise-grade DI container
- **Hot Reload**: Development server with intelligent hot reloading

### 📊 Monitoring & Observability
- **Real-time Metrics**: Built-in performance monitoring
- **Health Checks**: Configurable health check endpoints
- **Logging**: Structured logging with multiple transports
- **Profiling Tools**: Built-in CPU and memory profiling

## 🚀 Quick Start

### Installation

```bash
npm install nexurejs
# or
yarn add nexurejs
```

### Basic Server

```typescript
import { createApp } from 'nexurejs';

const app = createApp();

app.get('/hello', (ctx) => {
  ctx.response.json({ message: 'Hello, NexureJS!' });
});

app.get('/user/:id', (ctx) => {
  const { id } = ctx.params;
  ctx.response.json({
    id: parseInt(id),
    name: 'John Doe',
    timestamp: Date.now()
  });
});

await app.start(3000);
console.log('🚀 Server running on http://localhost:3000');
```

### Advanced Usage with Native Acceleration

```typescript
import { createApp, enableNativeAcceleration } from 'nexurejs';

const app = createApp({
  performance: {
    simd: true,
    nativeAcceleration: true,
    compression: 'brotli',
    caching: true
  },
  security: {
    cors: true,
    helmet: true,
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100 // limit each IP to 100 requests per windowMs
    }
  }
});

// Native JSON processing
app.post('/api/data', async (ctx) => {
  const data = await ctx.request.json();
  const processed = await app.native.jsonProcessor.process(data);
  ctx.response.json(processed);
});

await app.start(3000);
```

## 📖 Documentation

### Getting Started
- [Installation Guide](docs/getting-started/installation.md)
- [Quick Start Tutorial](docs/getting-started/quick-start.md)
- [First Application](docs/getting-started/first-app.md)
- [Migration from Express](docs/getting-started/migration.md)

### Core Concepts
- [Application Structure](docs/core/application.md)
- [Routing System](docs/core/routing.md)
- [Middleware](docs/core/middleware.md)
- [HTTP Handling](docs/core/http.md)
- [Error Handling](docs/core/error-handling.md)

### Performance
- [Benchmarks & Results](docs/performance/benchmark-results.md)
- [Optimization Guide](docs/performance/optimization.md)
- [Native Modules](docs/performance/native-modules/)
- [Profiling Tools](docs/performance/profiling.md)

### Advanced Features
- [WebSocket Support](docs/advanced/websockets.md)
- [Security Features](docs/security/overview.md)
- [Native Acceleration](docs/performance/native-modules/README.md)

## 🎯 Use Cases

NexureJS excels in:

- **High-Performance APIs**: REST APIs requiring low latency
- **Real-time Applications**: WebSocket servers and live data streaming
- **Microservices**: Lightweight, fast microservice architectures
- **Data Processing**: APIs with heavy JSON/data manipulation
- **Enterprise Applications**: Large-scale applications requiring reliability

## 🏗️ Architecture

NexureJS is built on a layered architecture:

```
┌─────────────────────────────────────┐
│          Application Layer          │
├─────────────────────────────────────┤
│         Framework Layer            │
├─────────────────────────────────────┤
│         Native Module Layer        │
├─────────────────────────────────────┤
│           Node.js Runtime          │
└─────────────────────────────────────┘
```

### Native Modules
- **HTTP Parser**: Fast HTTP request/response parsing
- **JSON Processor**: SIMD-accelerated JSON operations
- **Memory Manager**: Advanced memory allocation strategies
- **Compression Engine**: Brotli/Gzip with optimal settings
- **Crypto Operations**: Hardware-accelerated cryptography

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit
npm run test:integration
npm run test:performance

# Run benchmarks
npm run benchmark:all
npm run benchmark:compare
```

## 📊 Benchmarks

Run your own benchmarks:

```bash
# Simple HTTP benchmark
npm run benchmark

# Comprehensive performance testing
npm run benchmark:comprehensive

# Framework comparison
npm run benchmark:vs
```

Current benchmark results show NexureJS achieving:
- **7,858 requests/second** for basic routing
- **6,509 requests/second** for JSON processing
- **Sub-millisecond response times** (0.116ms average)
- **Excellent memory efficiency** (11.4 MB under load)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](docs/development/contributing.md) for details.

### Development Setup

```bash
git clone https://github.com/nexurejs/nexurejs.git
cd nexurejs
npm install
npm run build
npm test
```

## 📝 License

NexureJS is [MIT licensed](LICENSE).

## 🙋‍♂️ Support

- 📖 [Documentation](docs/)
- 🐛 [Issue Tracker](https://github.com/nexurejs/nexurejs/issues)
- 💬 [Discussions](https://github.com/nexurejs/nexurejs/discussions)
- 📧 [Email Support](mailto:support@nexurejs.com)

## 🗺️ Roadmap

- [ ] HTTP/3 Support
- [ ] GraphQL Integration
- [ ] Kubernetes Deployment Tools
- [ ] Advanced Caching Strategies
- [ ] Machine Learning Integration
- [ ] Edge Computing Support

---

<p align="center">
  Made with ❤️ by the NexureJS team
</p>
