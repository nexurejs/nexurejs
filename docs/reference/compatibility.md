# Compatibility Guide

This guide explains how to use NexureJS across different environments and versions.

## Node.js Version Compatibility

NexureJS officially supports the following Node.js versions:

| Node.js Version | Support Level | Native Module Support | Performance |
|-----------------|---------------|----------------------|-------------|
| 16.14.0 - 16.x  | Supported     | Limited              | Good        |
| 18.0.0 - 18.x   | Recommended   | Full                 | Excellent   |
| 20.0.0+         | Recommended   | Full                 | Excellent   |
| < 16.14.0       | Not Supported | None                 | N/A         |

### Supported Features by Node.js Version

| Feature                  | Node.js 16.14+ | Node.js 18+ | Node.js 20+ |
|--------------------------|---------------|-------------|-------------|
| ESM Modules              | ✅            | ✅           | ✅           |
| Web Streams API          | ⚠️ Partial    | ✅           | ✅           |
| Native Modules           | ⚠️ Limited    | ✅           | ✅           |
| HTTP/2                   | ✅            | ✅           | ✅           |
| WebSocket                | ✅            | ✅           | ✅           |
| Fetch API                | ❌            | ✅           | ✅           |
| Performance Hooks        | ⚠️ Limited    | ✅           | ✅           |

## Module System Compatibility

NexureJS supports both ESM (ECMAScript Modules) and CommonJS:

### Using with ESM (Recommended)

```javascript
// ESM style import (recommended)
import { createServer } from 'nexurejs';
import { Router } from 'nexurejs/routing';

const app = createServer();
const router = new Router();

// Define routes
router.get('/', (req, res) => {
  res.send('Hello from NexureJS!');
});

app.use(router);
app.listen(3000);
```

### Using with CommonJS

```javascript
// CommonJS style require
const { createServer } = require('nexurejs');
const { Router } = require('nexurejs/routing');

const app = createServer();
const router = new Router();

// Define routes
router.get('/', (req, res) => {
  res.send('Hello from NexureJS!');
});

app.use(router);
app.listen(3000);
```

## Browser and Runtime Support

NexureJS is designed primarily for server-side Node.js applications, but certain utilities can be used in other JavaScript runtimes:

| Runtime       | Support Level | Notes                                            |
|---------------|---------------|--------------------------------------------------|
| Node.js       | Full          | Primary development platform                     |
| Deno          | Partial       | Via npm compatibility layer                      |
| Bun           | Experimental  | Basic functionality works                        |
| Browsers      | Limited       | Only utility functions, not server components    |
| Cloudflare Workers | Partial  | Requires special build                           |

## Native Module Options

You can run NexureJS with or without native modules:

### Full Mode (Default)

Uses native C++ modules for maximum performance. Requires proper build tools on your system.

### Lite Mode (JavaScript Only)

Uses pure JavaScript implementations, trading some performance for simpler installation.

To enable lite mode:

```bash
# Option 1: Use environment variable
NEXUREJS_LITE_MODE=true npm install

# Option 2: Use installation flag
npm install nexurejs --lite

# Option 3: Add to your project
process.env.NEXUREJS_LITE_MODE = 'true';
import { createServer } from 'nexurejs';
```

## TypeScript Support

NexureJS is written in TypeScript and ships with type definitions. No additional packages are needed.

### Recommended tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true
  }
}
```

## Troubleshooting Compatibility Issues

### Module Resolution Errors

If you encounter errors related to module resolution:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...'
```

Make sure you:
1. Are using the correct import style for your module system
2. Have added the `.js` extension to imports in ESM mode
3. Have run `npm install` to install all dependencies

### Native Module Errors

If you encounter issues with native modules:

```
Error: Cannot find module 'nexurejs/native'
```

You can:
1. Install the required build tools for your platform
2. Switch to lite mode with `NEXUREJS_LITE_MODE=true`
3. Check the detailed installation guide for your OS

## Compatibility Utilities

NexureJS provides utilities to help with compatibility:

```javascript
import { checkNodeVersion, printVersionInfo } from 'nexurejs/utils/version-check';

// Check if current Node.js version is compatible
if (checkNodeVersion()) {
  // Safe to proceed
  const server = createServer();
} else {
  // Handle incompatible version
  console.error('Please upgrade Node.js to use NexureJS');
}

// Print detailed compatibility information
printVersionInfo();
```

## Platform-Specific Considerations

### Windows

- Ensure Visual Studio Build Tools are installed for native modules
- Command paths may need adjustments in some middleware (e.g., static file serving)

### macOS

- Xcode Command Line Tools are required for native modules
- Case sensitivity issues may occur if developing across platforms

### Linux

- Build-essential package is needed for native modules
- CPU-specific optimizations may vary across distributions

## Migration Guides

### Migrating from Express

See [Express Migration Guide](./migration-express.md)

### Migrating from Fastify

See [Fastify Migration Guide](./migration-fastify.md)

## Testing Across Environments

We recommend using Docker to test across different Node.js versions:

```bash
# Test with Node.js 16
docker run -it --rm -v $(pwd):/app -w /app node:16 npm test

# Test with Node.js 18
docker run -it --rm -v $(pwd):/app -w /app node:18 npm test

# Test with Node.js 20
docker run -it --rm -v $(pwd):/app -w /app node:20 npm test
```
