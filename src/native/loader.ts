/**
 * Native module loader
 *
 * This module handles the loading of native C++ modules with graceful fallback
 * to JavaScript implementations when native modules are not available.
 */

import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Simple logging implementation instead of using Logger to avoid circular dependencies
const log = {
  debug: (message: string, ...args: any[]): void => {
    if (process.env.NEXURE_NATIVE_DEBUG === 'true') {
      console.debug(`[NativeLoader] ${message}`, ...args);
    }
  },
  info: (message: string, ...args: any[]): void => {
    if (process.env.NEXURE_NATIVE_DEBUG === 'true') {
      console.info(`[NativeLoader] ${message}`, ...args);
    }
  },
  warn: (message: string, ...args: any[]): void => {
    console.warn(`[NativeLoader] ${message}`, ...args);
  },
  error: (message: string, ...args: any[]): void => {
    console.error(`[NativeLoader] ${message}`, ...args);
  }
};

// Handle both ESM and CommonJS environments for require
let customRequire: NodeRequire;

try {
  // ESM environment with compatibility for CJS build
  const metaUrl = typeof import.meta !== 'undefined' ? import.meta.url : '';
  if (metaUrl) {
    customRequire = createRequire(metaUrl);
  } else {
    // Fallback if import.meta is not available (during CJS build)
    customRequire = require;
  }
} catch (_err) {
  // Final fallback
  customRequire = require;
}

// Define binding types
export enum BindingType {
  WEBSOCKET = 'websocket',
  JSON = 'json',
  HTTP = 'http',
  URL = 'url',
  CRYPTO = 'crypto',
  COMPRESSION = 'compression',
  ROUTER = 'router',
  SCHEMA = 'schema'
}

// Define binding module interface
export interface NativeBindingModule {
  [key: string]: any;
}

// This is a hack to prevent crashes if there are memory issues
// when loading and unloading the module. We'll keep a global reference
// to prevent the module from being garbage collected.
let _globalModuleRef: any = null;

// Module cache to prevent redundant loading attempts
const moduleCache: Record<string, any> = {};

// Check if native modules are disabled
export function isNativeDisabled(): boolean {
  return (
    process.env.NEXUREJS_NATIVE_DISABLED === 'true' ||
    process.env.NEXUREJS_LITE_MODE === 'true'
  );
}

/**
 * Safe loading of native modules with proper error handling
 * and crash prevention
 */
function safeLoadNativeModule(modulePath: string): any {
  // Signal to Node.js not to exit on uncaught exceptions
  // This is to handle any potential segfaults or errors
  // during module loading
  const existingHandler = process.listeners('uncaughtException').pop();

  try {
    // Add a temporary handler to catch any errors during module loading
    process.once('uncaughtException', (err) => {
      log.error(`Uncaught exception while loading native module: ${err.message}`);
      log.error(err.stack || 'No stack trace available');

      // Re-add the existing handler if any
      if (existingHandler) {
        process.on('uncaughtException', existingHandler);
      }

      return false; // Return a value to indicate failure
    });

    // Try to load the module
    const module = customRequire(modulePath);

    // Store in global ref to prevent garbage collection
    // This is important to prevent crashes during cleanup
    _globalModuleRef = module;

    // Re-add the existing handler if any
    if (existingHandler) {
      process.on('uncaughtException', existingHandler);
    }

    return module;
  } catch (err: any) {
    log.warn(`Error loading native module: ${err.message}`);

    // Re-add the existing handler if any
    if (existingHandler) {
      process.on('uncaughtException', existingHandler);
    }

    return null;
  }
}

/**
 * Try to load a native binding module
 * @param bindingPath The path to the binding module
 * @returns The loaded module or null if not found
 */
export function tryLoadNativeBinding(bindingPath: string): NativeBindingModule | null {
  // Skip if native modules are disabled
  if (isNativeDisabled()) {
    log.debug(`Native module loading skipped because it is disabled by environment variable`);
    return null;
  }

  // Check if module is already cached
  if (moduleCache[bindingPath] !== undefined) {
    return moduleCache[bindingPath];
  }

  try {
    const startTime = performance.now();

    // Check if the file exists
    if (!existsSync(bindingPath)) {
      log.debug(`Native binding module not found at: ${bindingPath}`);
      moduleCache[bindingPath] = null;
      return null;
    }

    // Try to load the module safely
    const nativeBinding = safeLoadNativeModule(bindingPath);

    if (nativeBinding) {
      const endTime = performance.now();
      log.debug(
        `Native binding loaded successfully in ${(endTime - startTime).toFixed(2)}ms: ${bindingPath}`
      );

      // Cache the loaded module
      moduleCache[bindingPath] = nativeBinding;
      return nativeBinding;
    } else {
      log.warn(`Failed to load native binding: ${bindingPath}`);
      moduleCache[bindingPath] = null;
      return null;
    }
  } catch (error: any) {
    log.warn(`Failed to load native binding: ${bindingPath}`, error.message);

    // Cache the failure
    moduleCache[bindingPath] = null;
    return null;
  }
}

/**
 * Load and cache native binding modules
 * @param modulePath Optional specific path to load from
 * @returns Loaded native modules or null if not available
 */
export function loadNativeBinding(modulePath?: string): NativeBindingModule | null {
  // Skip if native modules are disabled
  if (isNativeDisabled()) {
    log.debug(`Native module loading skipped because it is disabled by environment variable`);
    return null;
  }

  // Get the absolute path of the current file's directory
  // Handle both ESM and CJS environments
  let currentDir: string;
  try {
    // ESM environment
    const __filename = fileURLToPath(import.meta.url);
    currentDir = dirname(__filename);
  } catch {
    // CJS environment fallback
    currentDir = process.cwd();
  }
  const rootDir = join(currentDir, '..', '..');

  const paths = [
    // If a specific path is provided, try it first
    modulePath,
    // Try loading from various possible locations with absolute paths
    join(rootDir, 'build/Release/nexurejs_native.node'),
    join(rootDir, 'build', 'Release', 'nexurejs_native.node'),
    join(process.cwd(), 'build/Release/nexurejs_native.node'),
    join(process.cwd(), 'build', 'Release', 'nexurejs_native.node'),
    // Add platform-specific paths
    `nexurejs-native-${process.platform}-${process.arch}`,
  ].filter(Boolean);

  // Try each path
  for (const path of paths) {
    if (!path) continue;
    const binding = tryLoadNativeBinding(path);
    if (binding) {
      return binding;
    }
  }

  return null;
}

/**
 * Check if a specific binding type is available
 * @param bindingType The binding type to check
 * @returns True if the binding is available
 */
export function isBindingAvailable(bindingType: BindingType): boolean {
  // Skip if native modules are disabled
  if (isNativeDisabled()) {
    return false;
  }

  const nativeModule = loadNativeBinding();

  if (!nativeModule) {
    return false;
  }

  switch (bindingType) {
    case BindingType.WEBSOCKET:
      return Boolean(nativeModule.WebSocketServer || nativeModule.NativeWebSocketServer);
    case BindingType.JSON:
      return Boolean(nativeModule.JsonProcessor);
    case BindingType.HTTP:
      return Boolean(nativeModule.HttpParser);
    case BindingType.URL:
      return Boolean(nativeModule.parseQueryString && nativeModule.format);
    case BindingType.CRYPTO:
      return Boolean(nativeModule.Crypto);
    case BindingType.COMPRESSION:
      return Boolean(nativeModule.compress && nativeModule.decompress);
    case BindingType.ROUTER:
      return Boolean(nativeModule.RadixRouter);
    case BindingType.SCHEMA:
      return Boolean(nativeModule.validate && nativeModule.validatePartial);
    default:
      return false;
  }
}

/**
 * Clear the module cache
 * Useful for testing or reloading modules
 */
export function clearModuleCache(): void {
  Object.keys(moduleCache).forEach(key => {
    delete moduleCache[key];
  });
  log.debug('Native module cache cleared');
}

/**
 * Get performance metrics for native module operations
 */
export function getNativeLoaderMetrics(): {
  loadAttempts: number;
  loadSuccesses: number;
  loadTime: number;
} {
  // This would normally track actual metrics, but for now just returns placeholders
  return {
    loadAttempts: Object.keys(moduleCache).length,
    loadSuccesses: Object.values(moduleCache).filter(Boolean).length,
    loadTime: 0 // Would track actual load time in a real implementation
  };
}

/**
 * Reset performance metrics for native module operations
 */
export function resetNativeLoaderMetrics(): void {
  // In a real implementation, this would reset counters
}
