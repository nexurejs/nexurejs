/**
 * NexureJS Logger Utility
 *
 * High-performance logging system with multiple output formats
 * and configurable levels for production and development use.
 */

import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { LoggingOptions, LogEntry } from '../types/index.js';

export class Logger {
  private readonly options: LoggingOptions;
  private readonly levels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    trace: 4
  };

  constructor(options: LoggingOptions) {
    this.options = {
      level: 'info',
      format: 'json',
      destination: 'console',
      timestamp: true,
      colorize: true,
      ...options
    };

    // Ensure log directory exists if file destination
    if (this.options.destination === 'file' && this.options.file) {
      const dir = dirname(this.options.file);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Log an error message
   */
  error(message: string, meta?: any): void {
    this.log('error', message, meta);
  }

  /**
   * Log a warning message
   */
  warn(message: string, meta?: any): void {
    this.log('warn', message, meta);
  }

  /**
   * Log an info message
   */
  info(message: string, meta?: any): void {
    this.log('info', message, meta);
  }

  /**
   * Log a debug message
   */
  debug(message: string, meta?: any): void {
    this.log('debug', message, meta);
  }

  /**
   * Log a trace message
   */
  trace(message: string, meta?: any): void {
    this.log('trace', message, meta);
  }

  /**
   * Core logging method
   */
  private log(level: keyof typeof this.levels, message: string, meta?: any): void {
    // Check if level should be logged
    if (this.levels[level] > this.levels[this.options.level]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(meta && { meta })
    };

    const formatted = this.formatEntry(entry);
    this.output(formatted);
  }

  /**
   * Format log entry based on configuration
   */
  private formatEntry(entry: LogEntry): string {
    switch (this.options.format) {
      case 'json':
        return JSON.stringify(entry);

      case 'text':
        return `${entry.timestamp} [${entry.level.toUpperCase()}] ${entry.message}${
          entry.meta ? ` ${JSON.stringify(entry.meta)}` : ''
        }`;

      case 'pretty':
        const color = this.getColor(entry.level);
        const timestamp = this.options.timestamp ? `${entry.timestamp} ` : '';
        const levelStr = `[${entry.level.toUpperCase()}]`.padEnd(7);
        const metaStr = entry.meta ? ` ${JSON.stringify(entry.meta, null, 2)}` : '';

        if (this.options.colorize && this.options.destination === 'console') {
          return `${timestamp}${color}${levelStr}\x1b[0m ${entry.message}${metaStr}`;
        }
        return `${timestamp}${levelStr} ${entry.message}${metaStr}`;

      default:
        return JSON.stringify(entry);
    }
  }

  /**
   * Get ANSI color code for log level
   */
  private getColor(level: string): string {
    const colors = {
      error: '\x1b[31m',   // Red
      warn: '\x1b[33m',    // Yellow
      info: '\x1b[36m',    // Cyan
      debug: '\x1b[35m',   // Magenta
      trace: '\x1b[37m'    // White
    };
    return colors[level as keyof typeof colors] || '\x1b[0m';
  }

  /**
   * Output formatted log entry
   */
  private output(formatted: string): void {
    switch (this.options.destination) {
      case 'console':
        console.log(formatted);
        break;

      case 'file':
        if (this.options.file) {
          try {
            appendFileSync(this.options.file, `${formatted  }\n`);
          } catch (error) {
            console.error('Failed to write to log file:', error);
            console.log(formatted);
          }
        }
        break;

      case 'syslog':
        // Basic syslog implementation
        console.log(formatted);
        break;

      default:
        console.log(formatted);
    }
  }

  /**
   * Create child logger with additional context
   */
  child(context: Record<string, any>): Logger {
    const childLogger = new Logger(this.options);
    const originalLog = childLogger.log.bind(childLogger);

    childLogger.log = (level: keyof typeof this.levels, message: string, meta?: any) => {
      const combinedMeta = { ...context, ...meta };
      originalLog(level, message, combinedMeta);
    };

    return childLogger;
  }

  /**
   * Get current log level
   */
  getLevel(): string {
    return this.options.level;
  }

  /**
   * Set log level
   */
  setLevel(level: LoggingOptions['level']): void {
    (this.options as any).level = level;
  }

  /**
   * Check if level is enabled
   */
  isLevelEnabled(level: keyof typeof this.levels): boolean {
    return this.levels[level] <= this.levels[this.options.level];
  }
}
