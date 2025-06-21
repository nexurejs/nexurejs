# NexureJS Import Style Guide

## Import Patterns

This document outlines the import patterns used in the NexureJS codebase.

### Style Guide

In our codebase, we follow these import style guidelines:

1. **No Extensions for Local Imports**
   ```typescript
   // ✅ DO use imports without extensions
   import { Logger } from './utils/logger';
   import { Router } from '../routing/router';

   // ❌ DON'T use .js extensions in TypeScript files
   import { Logger } from './utils/logger.js'; // avoid
   ```

2. **Node Native Modules**
   ```typescript
   // ✅ DO use node: prefix
   import { existsSync } from 'node:fs';
   import { join } from 'node:path';

   // ❌ DON'T omit node: prefix
   import { existsSync } from 'fs'; // avoid
   ```

3. **NPM Packages**
   ```typescript
   // ✅ DO import packages directly
   import { parse } from 'simdjson';

   // For types
   import type { Request, Response } from 'express';
   ```

4. **Type Imports**
   ```typescript
   // ✅ DO use type imports for types only
   import type { UserOptions } from './types';

   // ✅ DO combine value and type imports
   import { User, type UserRole } from './models/user';
   ```

5. **Barrel Exports**
   ```typescript
   // In index.ts files, re-export components
   export * from './component-a';
   export * from './component-b';

   // Then import from the directory
   import { ComponentA, ComponentB } from './components';
   ```

## Development vs. Production

We use different import strategies for development and production:

### Development

In development mode, we use:
- TypeScript files with imports without extensions
- ts-node with `experimentalSpecifierResolution=node` for resolution
- Custom Node.js loaders for runtime resolution

### Production

In production builds, we:
1. Compile TypeScript to JavaScript
2. Automatically add `.js` extensions to imports
3. Ensure Node.js ESM compatibility

## Running the Code

To run the code:

```bash
# Development with automatic resolution
npm run start:dev

# Running compiled code with Node.js loader
npm run dev:run

# Running example without extension linting
npm run example:nolint
```

## Why This Approach?

This approach gives us:
1. Clean, readable imports in source code without extensions
2. Compatibility with Node.js ESM in production
3. A better developer experience
4. Consistency across the codebase
