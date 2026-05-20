/**
 * NexureJS Framework Setup
 *
 * This module initializes the framework and configures native modules
 * to be used by default for maximum performance.
 */

import { performance } from 'node:perf_hooks';
import { Logger } from './utils/logger.js';

const logger = new Logger();

/**
 * Framework initialization options
 */
export interface SetupOptions {
  /**
   * Whether to enable native modules
   * @default true
   */
  enableNativeModules?: boolean;

  /**
   * Whether to force using native modules even when potentially incompatible
   * @default false
   */
  forceNativeModules?: boolean;

  /**
   * Whether to show verbose logging during initialization
   * @default false
   */
  verbose?: boolean;

  /**
   * Custom native module path to load
   */
  modulePath?: string;

  /**
   * Whether to initialize the framework immediately
   * @default true
   */
  initializeImmediately?: boolean;
}

/**
 * Initialize the framework with native modules
 *
 * @param options Framework initialization options
 * @returns Object containing initialization status
 */
export function initializeFramework(options: SetupOptions = {}): {
  nativeModulesEnabled: boolean;
  nativeModulesLoaded: boolean;
  availableModules: string[];
  initTime: number;
} {
  const startTime = performance.now();

  const {
    enableNativeModules = true,
    forceNativeModules = false,
    verbose = false,
    modulePath,
    initializeImmediately = true
  } = options;

  // Set native modules as the default
  setUseNativeByDefault(enableNativeModules);

  // Configure native modules
  if (enableNativeModules && initializeImmediately) {
    if (verbose) {
      logger.info('Initializing native modules...');
    }

    configureNativeModules({
      enabled: true,
      forcedMode: forceNativeModules,
      verbose,
      modulePath
      // Additional options can be passed here
    });
  }

  // Get module status
  const status = getNativeModuleStatus();

  // Get available modules
  const availableModules = Object.entries(status)
    .filter(([key, value]) => key !== 'loaded' && value === true)
    .map(([key]) => key);

  // Get initialization time
  const endTime = performance.now();
  const initTime = endTime - startTime;

  if (verbose) {
    if (status.loaded) {
      logger.info(`Native modules loaded successfully in ${initTime.toFixed(2)}ms`);
      logger.info(`Available modules: ${availableModules.join(', ')}`);
    } else {
      logger.warn('Native modules could not be loaded, using JavaScript implementations');
      if (status.error) {
        logger.error(`Error loading native modules: ${status.error}`);
      }
    }
  }

  return {
    nativeModulesEnabled: enableNativeModules,
    nativeModulesLoaded: status.loaded,
    availableModules,
    initTime
  };
}

// Auto-initialize the framework if not in a testing environment
if (process.env.NODE_ENV !== 'test') {
  initializeFramework({
    enableNativeModules: true,
    verbose: process.env.DEBUG === 'true'
  });
}

// Custom implementations for native module functions
function setUseNativeByDefault(enabled: boolean): void {
  // Set a global flag for native module usage
  (global as any).__NEXURE_USE_NATIVE__ = enabled;

  if (enabled) {
    logger.debug('Native modules enabled by default');
  } else {
    logger.debug('Native modules disabled by default');
  }
}

interface NativeModuleConfig {
  enabled: boolean;
  verbose?: boolean;
  modulePath?: string;
  [key: string]: any;
}

function configureNativeModules(options: NativeModuleConfig): void {
  const { verbose, modulePath } = options;

  try {
    // Try to dynamically import native modules
    // This is just a stub - in a real implementation, this would
    // attempt to load the native modules from the specified path
    const nativeModulePath = modulePath || './build/Release/nexurejs_native.node';

    if (verbose) {
      logger.debug(`Attempting to load native modules from: ${nativeModulePath}`);
    }

    // Set configuration in global space for modules to access
    (global as any).__NEXURE_NATIVE_CONFIG__ = {
      ...options
    };
  } catch (error) {
    logger.error('Failed to configure native modules:', (error as Error).message);
  }
}

function getNativeModuleStatus(): any {
  // Check if native modules were loaded
  const nativeLoaded = (global as any).__NEXURE_NATIVE_LOADED__ === true;

  // Create a status object with information about available modules
  return {
    loaded: nativeLoaded,
    error: (global as any).__NEXURE_NATIVE_ERROR__,
    http: (global as any).__NEXURE_NATIVE_HTTP__ === true,
    json: (global as any).__NEXURE_NATIVE_JSON__ === true,
    websocket: (global as any).__NEXURE_NATIVE_WEBSOCKET__ === true,
    url: (global as any).__NEXURE_NATIVE_URL__ === true,
    crypto: (global as any).__NEXURE_NATIVE_CRYPTO__ === true,
    compression: (global as any).__NEXURE_NATIVE_COMPRESSION__ === true,
    router: (global as any).__NEXURE_NATIVE_ROUTER__ === true,
    schema: (global as any).__NEXURE_NATIVE_SCHEMA__ === true
  };
}

export default {
  initializeFramework,
  getNativeModuleStatus
};
