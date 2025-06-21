# Using Imports Without Extensions in NexureJS

This guide explains how to set up your NexureJS project to use imports without file extensions.

## Background

In modern ECMAScript modules (ESM), Node.js requires file extensions in import paths. This is different from CommonJS, where extensions were optional. However, TypeScript traditionally doesn't include extensions in import paths.

## How It Works in NexureJS

NexureJS supports a development workflow where you can write imports without extensions:

```typescript
// Instead of this:
import { Logger } from './utils/logger.js';

// You can write this:
import { Logger } from './utils/logger';
```

The build process will automatically add the required `.js` extensions when compiling to JavaScript.

## Setting Up Your Project

### 1. Configure TypeScript

Use the following `tsconfig.json` configuration:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "esModuleInterop": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

### 2. Set Up the Build Process

In your `package.json`, add these scripts:

```json
{
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "build:cjs": "tsc -p tsconfig.build.json --module commonjs --outDir dist/cjs",
    "postbuild": "node scripts/fix-imports.js"
  }
}
```

### 3. Create the Fix-Imports Script

Create a script at `scripts/fix-imports.js`:

```javascript
#!/usr/bin/env node

import { readdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const distDir = join(rootDir, 'dist');

async function processFile(filePath) {
  const content = await readFile(filePath, 'utf8');

  const newContent = content.replace(
    /(import|export)(.+from\s+['"])([^@\s'"./][^'"]*|\.\.?\/[^'"]*)(["'])/g,
    (match, statement, beforePath, path, quote) => {
      if (/\.(js|json|tsx?)$/.test(path) || !path.startsWith('.')) {
        return match;
      }
      return `${statement}${beforePath}${path}.js${quote}`;
    }
  );

  if (content !== newContent) {
    await writeFile(filePath, newContent, 'utf8');
  }
}

async function processDirectory(dir) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      await processDirectory(fullPath);
    } else if (entry.name.endsWith('.js')) {
      await processFile(fullPath);
    }
  }
}

async function main() {
  try {
    console.log('Fixing import paths...');
    await processDirectory(distDir);
    console.log('Import paths fixed successfully!');
  } catch (error) {
    console.error('Error fixing import paths:', error);
    process.exit(1);
  }
}

main();
```

### 4. Create a Custom Node.js Loader (Optional)

For an even better development experience, create a custom Node.js loader at `scripts/resolve-extensions.js`:

```javascript
/**
 * Custom Node.js loader that automatically resolves imports without extensions
 */
import { resolve as pathResolve, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { cwd } from 'node:process';

const baseURL = pathToFileURL(`${cwd()}/`).href;
const extensions = ['.js', '.json', '.node', '.mjs'];

export async function resolveHook(specifier, context, nextResolve) {
  // Skip if already has extension or is not a relative path
  if (extname(specifier) || !/^\.{1,2}\/|^\/.+/.test(specifier)) {
    return nextResolve(specifier, context);
  }

  const { parentURL = baseURL } = context;
  let url;

  try {
    url = new URL(specifier, parentURL);
  } catch {
    return nextResolve(specifier, context);
  }

  const filePath = fileURLToPath(url);

  // Try each extension
  for (const ext of extensions) {
    const fileWithExt = `${filePath}${ext}`;
    if (existsSync(fileWithExt)) {
      return nextResolve(`${specifier}${ext}`, context);
    }
  }

  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  return nextLoad(url, context);
}
```

Then add a script to use it:

```json
{
  "scripts": {
    "dev:run": "node --loader ./scripts/resolve-extensions.js dist/index.js",
    "start:dev": "ts-node --experimental-specifier-resolution=node src/index.ts"
  }
}
```

### 5. Disable ESLint Warnings (Optional)

If you're using ESLint, you may want to disable the warnings about missing extensions:

```javascript
// eslint.config.js
export default [
  {
    // Your other rules...
    rules: {
      // Disable the rule requiring extensions in imports
      '@typescript-eslint/extension-require-in-import-files': 'off',
      '@typescript-eslint/consistent-type-imports': 'off',
      'import/extensions': 'off'
    }
  }
];
```

## Example Usage

Here's an example of how to use imports without extensions in your code:

```typescript
// app.ts
import { Nexure } from 'nexurejs';
import { UserController } from './controllers/user-controller';
import { UserService } from './services/user-service';
import { Logger } from './utils/logger';

const logger = new Logger();
logger.info('Starting application...');

const app = new Nexure();
app.register(UserService);
app.register(UserController);

app.listen(3000, () => {
  logger.info('Server running on http://localhost:3000');
});
```

## Running in Development

For development with ts-node:

```bash
# Using ts-node with experimental resolver
npm run start:dev

# Or directly with ts-node
ts-node --experimental-specifier-resolution=node src/index.ts
```

Running compiled code with custom loader:

```bash
# Using the custom loader
npm run dev:run

# Or directly with Node.js
node --loader ./scripts/resolve-extensions.js dist/index.js
```

## Building for Production

When you run `npm run build`, the script will:

1. Compile TypeScript files to JavaScript
2. Add the necessary `.js` extensions to import statements in the compiled files
3. Make the output compatible with Node.js ESM

This approach gives you the best of both worlds - a clean development experience without extensions, and proper Node.js compatibility in production.

## Troubleshooting

If you encounter issues:

1. Make sure your `package.json` has `"type": "module"`
2. Ensure the fix-imports script has execute permissions (`chmod +x scripts/fix-imports.js`)
3. For third-party packages, you might still need the `.js` extension if they require it
4. If running with Node.js directly, use the `--loader` flag with the custom resolver
