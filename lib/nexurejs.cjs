// Nexure.js JavaScript Wrapper (CommonJS version)
const nativeModule = require('../build/Release/nexurejs_native.node');
const { ThreadPool, StringEncoder } = nativeModule;

// Configuration defaults
const DEFAULT_CONFIG = {
  logging: {
    level: 2, // INFO level
    file: './logs/nexurejs.log',
    console: true
  },
  threadPool: {
    threadCount: null, // Use hardware concurrency by default
    enableRetry: true,
    maxRetries: 3,
    retryDelay: 50
  }
};

/**
 * Main NexureJS class - provides access to all native modules
 */
class NexureJS {
  constructor(config = {}) {
    // Merge with default config
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      logging: { ...DEFAULT_CONFIG.logging, ...config.logging },
      threadPool: { ...DEFAULT_CONFIG.threadPool, ...config.threadPool }
    };

    // Create log directory if needed
    const logFile = this.config.logging.file;
    if (logFile) {
      const fs = require('fs');
      const path = require('path');
      const logDir = path.dirname(logFile);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    }

    // Initialize native modules
    this._initThreadPool();
    this._initStringEncoder();
  }

  /**
   * Initialize ThreadPool with configuration
   */
  _initThreadPool() {
    const threadCount = this.config.threadPool.threadCount || undefined;
    this.threadPool = new ThreadPool(threadCount);

    // Configure logging
    this.threadPool.setLogLevel(this.config.logging.level);
    if (this.config.logging.file) {
      this.threadPool.setLogFile(this.config.logging.file, this.config.logging.console);
    }
  }

  /**
   * Initialize StringEncoder with configuration
   */
  _initStringEncoder() {
    this.stringEncoder = new StringEncoder();

    // Configure logging
    this.stringEncoder.setLogLevel(this.config.logging.level);
    if (this.config.logging.file) {
      this.stringEncoder.setLogFile(this.config.logging.file, this.config.logging.console);
    }
  }

  /**
   * Run a task in the thread pool
   * @param {Function} task - The task to execute
   * @param {Number} priority - Priority level (0=LOW, 1=NORMAL, 2=HIGH, 3=CRITICAL)
   * @returns {Promise} - Promise that resolves with the task result
   */
  async runTask(task, priority = 1) {
    if (typeof task !== 'function') {
      throw new Error('Task must be a function');
    }

    if (priority !== undefined) {
      return this.threadPool.submitWithPriority(task, priority);
    } else {
      return this.threadPool.submit(task);
    }
  }

  /**
   * Run multiple tasks in parallel and wait for all to complete
   * @param {Array<Function>} tasks - Array of tasks to run
   * @param {Number} priority - Priority level for all tasks
   * @param {Number} timeoutMs - Optional timeout in milliseconds
   * @returns {Promise<Array>} - Promise resolving to array of results
   */
  async runAll(tasks, priority = 1, timeoutMs = 0) {
    if (!Array.isArray(tasks)) {
      throw new Error('Tasks must be an array of functions');
    }

    // Submit all tasks
    const promises = tasks.map(task => this.runTask(task, priority));

    // Wait for completion if timeout provided
    if (timeoutMs > 0) {
      const waitPromise = this.threadPool.waitAll(timeoutMs);
      const results = await Promise.all(promises);
      await waitPromise;
      return results;
    }

    // Otherwise just wait for all promises
    return Promise.all(promises);
  }

  /**
   * Encode a string using the specified encoding
   * @param {String} str - String to encode
   * @param {String} encoding - Encoding type ('base64', 'url', 'html')
   * @returns {String} - Encoded string
   */
  encode(str, encoding = 'base64') {
    if (typeof str !== 'string') {
      throw new Error('Input must be a string');
    }

    switch (encoding.toLowerCase()) {
      case 'base64':
        return this.stringEncoder.base64Encode(str);
      case 'url':
        return this.stringEncoder.urlEncode(str);
      case 'html':
        return this.stringEncoder.htmlEncode(str);
      default:
        throw new Error(`Unsupported encoding type: ${encoding}`);
    }
  }

  /**
   * Decode a string using the specified encoding
   * @param {String} str - String to decode
   * @param {String} encoding - Encoding type ('base64', 'url', 'html')
   * @returns {String} - Decoded string
   */
  decode(str, encoding = 'base64') {
    if (typeof str !== 'string') {
      throw new Error('Input must be a string');
    }

    switch (encoding.toLowerCase()) {
      case 'base64':
        return this.stringEncoder.base64Decode(str);
      case 'url':
        return this.stringEncoder.urlDecode(str);
      case 'html':
        return this.stringEncoder.htmlDecode(str);
      default:
        throw new Error(`Unsupported encoding type: ${encoding}`);
    }
  }

  /**
   * Get performance metrics for all components
   * @returns {Object} - Object containing metrics
   */
  getMetrics() {
    return {
      threadPool: this.threadPool.getMetrics(),
      stringEncoder: this.stringEncoder.getMetrics()
    };
  }

  /**
   * Reset metrics for all components
   */
  resetMetrics() {
    this.threadPool.resetMetrics();
    this.stringEncoder.resetMetrics();
  }
}

// Create a singleton instance with default config
const defaultInstance = new NexureJS();

// Export both the class and the default instance
module.exports = {
  NexureJS,
  default: defaultInstance
};
