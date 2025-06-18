# 🚀 Getting Started with NexureJS

Welcome to **NexureJS** - a high-performance Node.js framework that combines native C++ modules with modern TypeScript development for exceptional performance and developer experience.

## ⚡ Quick Start

Get up and running in less than 2 minutes:

```bash
# Install NexureJS CLI globally
npm install -g nexurejs

# Create a new project
nexure create my-app

# Navigate and install dependencies
cd my-app && npm install

# Start development server
npm run dev
```

Your NexureJS application is now running at `http://localhost:3000`! 🎉

## 🛠️ CLI Commands

The NexureJS CLI provides powerful development commands:

```bash
# Project Creation
nexure create <name>                    # Create basic project
nexure create <name> --template api     # Create API project
nexure create <name> --typescript       # Create TypeScript project
nexure init                             # Initialize in current directory

# Development
nexure dev                              # Start development server
nexure build                            # Build for production
nexure test                             # Run tests
nexure test --coverage                  # Run tests with coverage

# Code Generation
nexure generate controller User         # Generate controller
nexure generate middleware Auth         # Generate middleware
nexure generate service Database        # Generate service
```

## 🏗️ Project Templates

### Basic Template
Perfect for simple applications and learning:
- Basic HTTP server setup
- Simple routing examples
- Health check endpoint
- Development scripts

### API Template
Ideal for building REST APIs:
- RESTful route structure
- CRUD operations example
- Request/response handling
- Parameter validation

### Full Template
For comprehensive applications:
- Complete project structure
- Authentication middleware
- Service layer examples
- Error handling and logging

## ⚡ Performance Features

### Native C++ Modules
NexureJS automatically uses native modules when available:

```javascript
import { getNativeModuleStatus } from 'nexurejs';

// Check which native modules are loaded
const status = getNativeModuleStatus();
console.log('Native modules loaded:', status.loaded);
console.log('String encoder available:', status.stringEncoder);
console.log('Thread pool available:', status.threadPool);
```

### High-Performance String Operations
```javascript
import { StringEncoder } from 'nexurejs';

const encoder = new StringEncoder();
const encoded = encoder.base64Encode('Hello, NexureJS!');
const decoded = encoder.base64Decode(encoded);
const urlSafe = encoder.urlEncode('special chars: @#$%');
```

### Thread Pool for CPU-Intensive Tasks
```javascript
import { runTask } from 'nexurejs';

// Run heavy computation in background thread
const result = await runTask(() => {
  return fibonacci(40); // CPU-intensive task
});
```

### Automatic Fallbacks
When native modules aren't available, NexureJS gracefully falls back to JavaScript implementations:

```javascript
import { isNative, isNativeAvailable } from 'nexurejs';

console.log(`Using native implementation: ${isNative}`);
console.log(`Native modules available: ${isNativeAvailable()}`);
```

## 📝 Example Application

Here's a complete example showing NexureJS in action:

```typescript
import { Nexure, HttpMethod } from 'nexurejs';

// Create application with native performance enabled
const app = new Nexure({
  logger: { level: 'info', prettyPrint: true },
  performance: { nativeModules: true }
});

// Basic route
app.route({
  path: '/',
  method: HttpMethod.GET,
  handler: (req, res) => {
    res.status(200).json({
      message: 'Hello from NexureJS!',
      native: req.app.isNativeEnabled,
      timestamp: new Date().toISOString()
    });
  }
});

// API route with parameters
app.route({
  path: '/users/:id',
  method: HttpMethod.GET,
  handler: async (req, res) => {
    const userId = parseInt(req.params.id);

    // Simulate database query
    const user = await getUserById(userId);

    res.status(200).json(user);
  }
});

// Start server
app.listen(3000, () => {
  console.log('🚀 Server running at http://localhost:3000');
});
```

## 🚀 Next Steps

### Learn More
- **[API Reference](./API_REFERENCE.md)** - Complete API documentation
- **[Examples Guide](./EXAMPLES.md)** - Real-world usage examples
- **[Performance Guide](./performance-optimization-guide.md)** - Optimization techniques

### Explore Features
- **WebSocket Support** - Real-time applications
- **Streaming** - Efficient file processing
- **Middleware System** - Extensible request processing
- **Dependency Injection** - Clean architecture patterns

### Get Involved
- **[GitHub Repository](https://github.com/Braineanear/nexurejs)** - Source code and issues
- **[Contributing Guide](./CONTRIBUTING.md)** - Help improve NexureJS
- **[Roadmap](./ROADMAP.md)** - See what's coming next

---

**Welcome to the NexureJS community!** 🎉

Start building high-performance Node.js applications today. The combination of modern developer experience and native performance makes NexureJS perfect for everything from simple APIs to complex, high-throughput systems.

Happy coding! ⚡🚀
