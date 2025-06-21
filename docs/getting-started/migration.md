# NexureJS Migration Guide

This document provides guidance for migrating between different versions of NexureJS, with a special focus on ESM compatibility.

## Migrating to ESM

NexureJS now supports both ESM (ECMAScript Modules) and CommonJS module formats. This guide will help you migrate your existing code to use ESM.

### Why Migrate to ESM?

- **Future-proof**: ESM is the official standard module system for JavaScript
- **Better tree-shaking**: ESM enables better dead code elimination
- **Top-level await**: ESM supports using await outside of async functions
- **Static analysis**: ESM allows for better static analysis and optimization

### ESM Migration Checklist

1. Update your `package.json` to use ESM:
   ```json
   {
     "type": "module"
   }
   ```

2. Rename your files with `.mjs` extension or keep `.js` extension with `"type": "module"` in package.json

3. Update your imports:
   ```javascript
   // CommonJS (old)
   const { Router } = require('nexurejs');

   // ESM (new)
   import { Router } from 'nexurejs';
   ```

4. Add file extensions to relative imports:
   ```javascript
   // Without extension (will not work in ESM)
   import { User } from './models/user';

   // With extension (works in ESM)
   import { User } from './models/user.js';
   ```

5. Replace CommonJS patterns:
   ```javascript
   // CommonJS (old)
   module.exports = MyClass;
   const myUtil = require('./utils');

   // ESM (new)
   export default MyClass;
   import myUtil from './utils.js';
   ```

6. Update dynamic imports:
   ```javascript
   // CommonJS (old)
   const module = require(dynamicPath);

   // ESM (new)
   const module = await import(dynamicPath);
   ```

### Breaking Changes in ESM

1. **File extensions required**: You must include file extensions in import paths for local modules
2. **No `__dirname` or `__filename`**: These CommonJS variables are not available in ESM
3. **No `require`**: The `require` function is not available in ESM
4. **Top-level await**: ESM modules using top-level await will cause parent modules to wait

### Using NexureJS with ESM

NexureJS supports both ESM and CommonJS through conditional exports. You can import it in either format:

```javascript
// ESM
import { Router, VERSION } from 'nexurejs';

// CommonJS
const { Router, VERSION } = require('nexurejs');
```

When using submodules, the same pattern applies:

```javascript
// ESM
import { Router } from 'nexurejs/routing';

// CommonJS
const { Router } = require('nexurejs/routing');
```

### Alternative to `__dirname` in ESM

If you need `__dirname` or `__filename` in ESM:

```javascript
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

### Handling Mixed Environments

For libraries or applications that need to support both ESM and CommonJS:

1. Use the `exports` field in package.json (NexureJS already does this):
   ```json
   "exports": {
     ".": {
       "import": "./dist/index.js",
       "require": "./dist/cjs/index.js"
     }
   }
   ```

2. For TypeScript projects, use the `moduleResolution` option:
   ```json
   {
     "compilerOptions": {
       "moduleResolution": "NodeNext"
     }
   }
   ```

## Troubleshooting Common ESM Issues

### Error: Cannot use import statement outside a module

**Solution:** Add `"type": "module"` to package.json or use `.mjs` file extension.

### Error: ERR_MODULE_NOT_FOUND

**Solution:** Ensure you've added file extensions to your import paths.

### Error: Cannot find module

**Solution:** Check that the path is correct and includes the file extension.

### Error: Unexpected token 'export'

**Solution:** You're trying to require an ESM module in CommonJS. Use dynamic import instead.

## Need Help?

If you encounter any issues during migration, please:

1. Check the [GitHub Issues](https://github.com/Braineanear/nexurejs/issues) for similar problems
2. Run the diagnostic tool: `node scripts/debug-utils.cjs`
3. Open a new issue with detailed information about your problem
