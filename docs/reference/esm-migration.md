# ESM Migration Guide

## What changed?

Starting with Node.js v16 and specifically with the "node16" or "nodenext" module resolution strategy in TypeScript, ECMAScript modules (ESM) require explicit file extensions in import paths, unlike CommonJS.

For example:
```ts
// ❌ This works in CommonJS but not in ESM
import { Router } from '../routing/router';

// ✅ In ESM, we need the file extension
import { Router } from '../routing/router.js';
```

## Why does this happen?

1. When TypeScript compiles your code, it converts `.ts` files to `.js` files
2. Node.js's ESM loader strictly enforces that import paths must include the file extension
3. This is different from CommonJS, which has more flexible module resolution

## Our Solution

NexureJS provides a script that automatically adds the `.js` extensions to all relative imports in your TypeScript files:

```bash
# Run the fix-ts-imports script
npm run fix:ts-imports

# Or with verbose output to see what's being changed
npm run fix:ts-imports:dry-run
```

The script has been integrated into the build process so it runs automatically when you build the project.

## Module Dual Support

NexureJS maintains dual module support:

1. **ESM** (default): Used when importing with `import` syntax
2. **CommonJS**: Used when importing with `require()` syntax

The `package.json` exports field handles this for you:

```json
"exports": {
  ".": {
    "import": "./dist/index.js",
    "require": "./dist/cjs/index.js"
  }
}
```

## TypeScript Configuration

We use two TypeScript configurations:

1. `tsconfig.json` - For ESM output
2. `tsconfig.cjs.json` - For CommonJS output

## Migrating Your Own Code

If you're extending NexureJS or creating applications with it:

1. Always include file extensions in relative imports (`.js`, not `.ts`)
2. Use the ESM migration script on your codebase: `npx nexurejs-fix-imports`
3. Configure TypeScript with `"module": "NodeNext"` and `"moduleResolution": "NodeNext"`

## Common Issues and Solutions

### Missing file extensions in imports

Error:
```
ERR_MODULE_NOT_FOUND: Cannot find module '../utils/logger'
```

Solution: Add `.js` extension to the import path:
```ts
import { Logger } from '../utils/logger.js';
```

### The "type": "module" field is missing

If your package.json doesn't have `"type": "module"`, Node.js will treat `.js` files as CommonJS by default.

Solution: Add `"type": "module"` to your package.json, or use `.mjs` file extensions.

### TypeScript configured incorrectly

Solution: Update your tsconfig.json:
```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

### Running the build

To build both ESM and CommonJS output:

```bash
npm run build:all
```
