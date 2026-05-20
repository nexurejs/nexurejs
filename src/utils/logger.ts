/**
 * Logger Service
 *
 * Unified logging service with configurable output, levels, and formatting.
 */

/**
 * Log level enum
 */
export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
  FATAL = 5,
  SILENT = 6
}

/**
 * Log level names mapped to their numeric values
 */
export const LOG_LEVELS: Record<string, LogLevel> = {
  trace: LogLevel.TRACE,
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
  fatal: LogLevel.FATAL,
  silent: LogLevel.SILENT
};

/**
 * Logger configuration options
 */
export interface LoggerOptions {
  /**
   * Log level
   * @default LogLevel.INFO
   */
  level?: LogLevel | string;

  /**
   * Include timestamps in logs
   * @default true
   */
  timestamp?: boolean;

  /**
   * Include log level in output
   * @default true
   */
  showLevel?: boolean;

  /**
   * Output to console
   * @default true
   */
  console?: boolean;

  /**
   * JSON format
   * @default false
   */
  json?: boolean;

  /**
   * Custom formatters for different log levels
   */
  formatters?: Partial<Record<keyof typeof LogLevel, (args: any[]) => any[]>>;

  /**
   * Custom transports
   */
  transports?: LogTransport[];
}

/**
 * Custom log transport interface
 */
export interface LogTransport {
  /**
   * Log method to call with formatted message
   */
  log(level: LogLevel, message: string, meta: Record<string, any>): void;

  /**
   * Optional level - transport will only receive logs at or above this level
   */
  level?: LogLevel;
}

/**
 * Default logger options
 */
const DEFAULT_OPTIONS: Required<Omit<LoggerOptions, 'formatters' | 'transports'>> = {
  level: LogLevel.INFO,
  timestamp: true,
  showLevel: true,
  console: true,
  json: false
};

/**
 * Unified logger implementation
 */
export class Logger {
  private options: Required<Omit<LoggerOptions, 'formatters' | 'transports'>> &
    Pick<LoggerOptions, 'formatters' | 'transports'>;
  private transports: LogTransport[] = [];

  /**
   * Create a new logger instance
   * @param options Logger configuration
   */
  constructor(options: LoggerOptions = {}) {
    // Process level if provided as string
    let level = options.level;
    if (typeof level === 'string') {
      const levelName = level.toLowerCase();
      level = LOG_LEVELS[levelName] ?? DEFAULT_OPTIONS.level;
    }

    // Merge with defaults
    this.options = {
      ...DEFAULT_OPTIONS,
      ...options,
      level: level ?? DEFAULT_OPTIONS.level
    };

    // Configure transports
    if (this.options.console) {
      this.transports.push(this.createConsoleTransport());
    }

    if (this.options.transports) {
      this.transports.push(...this.options.transports);
    }
  }

  /**
   * Log at TRACE level
   */
  trace(...args: any[]): void {
    this.log(LogLevel.TRACE, ...args);
  }

  /**
   * Log at DEBUG level
   */
  debug(...args: any[]): void {
    this.log(LogLevel.DEBUG, ...args);
  }

  /**
   * Log at INFO level
   */
  info(...args: any[]): void {
    this.log(LogLevel.INFO, ...args);
  }

  /**
   * Log at WARN level
   */
  warn(...args: any[]): void {
    this.log(LogLevel.WARN, ...args);
  }

  /**
   * Log at ERROR level
   */
  error(...args: any[]): void {
    this.log(LogLevel.ERROR, ...args);
  }

  /**
   * Log at FATAL level
   */
  fatal(...args: any[]): void {
    this.log(LogLevel.FATAL, ...args);
  }

  /**
   * Set the log level
   */
  setLevel(level: LogLevel | string): void {
    if (typeof level === 'string') {
      const levelName = level.toLowerCase();
      this.options.level = LOG_LEVELS[levelName] ?? this.options.level;
    } else {
      this.options.level = level;
    }
  }

  /**
   * Get the current log level
   */
  getLevel(): LogLevel {
    return this.options.level as LogLevel;
  }

  /**
   * Add a transport
   */
  addTransport(transport: LogTransport): void {
    this.transports.push(transport);
  }

  /**
   * Create a child logger with the same options
   */
  child(options: Partial<LoggerOptions> = {}): Logger {
    return new Logger({
      ...this.options,
      ...options
    });
  }

  /**
   * Determine if a given level would be logged
   */
  isLevelEnabled(level: LogLevel): boolean {
    return level >= (this.options.level as LogLevel);
  }

  /**
   * Internal logging method
   */
  private log(level: LogLevel, ...args: any[]): void {
    // Nothing to do when the level is filtered out or there is nowhere to
    // write — skip building the message entirely.
    if (this.transports.length === 0 || !this.isLevelEnabled(level)) {
      return;
    }

    // Format arguments if a custom formatter exists for this level.
    // `formatters` is keyed by the (uppercase) LogLevel member names.
    let formattedArgs = args;
    const levelName = LogLevel[level] as keyof typeof LogLevel;

    if (this.options.formatters && levelName in this.options.formatters) {
      const formatter = this.options.formatters[levelName];
      if (formatter) {
        formattedArgs = formatter(args);
      }
    }

    // Create metadata
    const meta: Record<string, any> = {};

    // Format message (simple version for non-JSON)
    const message = this.formatMessage(level, formattedArgs, meta);

    // Send to all transports
    for (const transport of this.transports) {
      if (transport.level === undefined || level >= transport.level) {
        transport.log(level, message, meta);
      }
    }
  }

  /**
   * Format log message
   */
  private formatMessage(level: LogLevel, args: any[], meta: Record<string, any>): string {
    // Add timestamp if enabled
    if (this.options.timestamp) {
      meta.timestamp = new Date().toISOString();
    }

    // Add level if enabled
    if (this.options.showLevel) {
      meta.level = LogLevel[level];
    }

    // Process message
    let message = '';

    if (args.length === 1 && typeof args[0] === 'string') {
      message = args[0];
    } else {
      for (const arg of args) {
        if (typeof arg === 'string') {
          message += (message ? ' ' : '') + arg;
        } else if (arg instanceof Error) {
          message += (message ? ' ' : '') + arg.message;
          // Use a different property name to avoid conflict with ...arg
          const errorProps = {};
          Object.getOwnPropertyNames(arg).forEach(key => {
            if (key !== 'message' && key !== 'stack') {
              (errorProps as any)[key] = (arg as any)[key];
            }
          });
          meta.error = {
            message: arg.message,
            stack: arg.stack,
            ...errorProps
          };
        } else if (typeof arg === 'object' && arg !== null) {
          Object.assign(meta, arg);
        } else {
          message += (message ? ' ' : '') + String(arg);
        }
      }
    }

    // Format the output
    if (this.options.json) {
      // Use message in meta for JSON output
      meta.message = message;
      return JSON.stringify(meta);
    }

    // Simple format for console
    let output = '';

    if (this.options.timestamp) {
      output += `[${meta.timestamp}] `;
    }

    if (this.options.showLevel) {
      output += `${LogLevel[level].padEnd(5)} `;
    }

    output += message;

    return output;
  }

  /**
   * Create console transport
   */
  private createConsoleTransport(): LogTransport {
    return {
      log: (level: LogLevel, message: string, _meta: Record<string, any>): void => {
        switch (level) {
          case LogLevel.TRACE:
          case LogLevel.DEBUG:
            console.debug(message);
            break;
          case LogLevel.INFO:
            console.info(message);
            break;
          case LogLevel.WARN:
            console.warn(message);
            break;
          case LogLevel.ERROR:
          case LogLevel.FATAL:
            console.error(message);
            break;
        }
      }
    };
  }
}

/**
 * Global logger instance
 */
export const logger = new Logger();
