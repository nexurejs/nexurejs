/**
 * Secure environment variable handler
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Logger } from './logger.js';

/**
 * Environment variable options
 */
export interface EnvOptions {
  /**
   * Path to .env file
   */
  path?: string;

  /**
   * Whether to throw an error if .env file is not found
   * @default false
   */
  required?: boolean;

  /**
   * Whether to override existing environment variables
   * @default false
   */
  override?: boolean;

  /**
   * Whether to enable debug logging
   * @default false
   */
  debug?: boolean;
}

/**
 * Environment variable manager
 */
export class Env {
  private logger: Logger;
  private cache = new Map<string, string>();
  private loaded = false;

  /**
   * Create a new environment variable manager
   * @param options Environment variable options
   */
  constructor(private options: EnvOptions = {}) {
    this.logger = new Logger({
      console: options.debug === true
    });
  }

  /**
   * Load environment variables from .env file
   */
  load(): void {
    if (this.loaded) {
      return;
    }

    const path = this.options.path || '.env';
    const required = this.options.required === true;
    const override = this.options.override === true;

    try {
      // Read .env file
      const envPath = resolve(process.cwd(), path);
      const content = readFileSync(envPath, 'utf8');

      // Parse .env file
      const env = this.parse(content);

      // Set environment variables
      for (const [key, value] of Object.entries(env)) {
        if (override || process.env[key] === undefined) {
          process.env[key] = value;
          this.cache.set(key, value);
        }
      }

      this.loaded = true;
      this.logger.info(`Loaded environment variables from ${envPath}`);
    } catch (error) {
      if (required) {
        throw new Error(`Failed to load environment variables: ${(error as Error).message}`);
      }

      this.logger.warn(`Failed to load environment variables: ${(error as Error).message}`);
    }
  }

  /**
   * Parse .env file content
   * @param content The .env file content
   */
  private parse(content: string): Record<string, string> {
    const env: Record<string, string> = {};

    // Split content into lines
    const lines = content.split('\n');

    for (const line of lines) {
      // Skip comments and empty lines
      if (line.trim().startsWith('#') || !line.trim()) {
        continue;
      }

      // Parse key-value pair
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);

      if (match) {
        const key = match[1]!;
        let value = match[2] || '';

        // Remove quotes
        const quoteRegex = /^(['"])(.*)(\1)$/;
        const quoteMatch = value.match(quoteRegex);

        if (quoteMatch) {
          value = quoteMatch[2]!;
        }

        // Replace escaped newlines
        value = value.replace(/\\n/g, '\n');

        // Set environment variable
        env[key] = value;
      }
    }

    return env;
  }

  /**
   * Get an environment variable
   * @param key The environment variable key
   * @param defaultValue The default value if the environment variable is not set
   */
  get(key: string, defaultValue?: string): string | undefined {
    // Ensure environment variables are loaded
    if (!this.loaded) {
      this.load();
    }

    // Get from process.env or cache
    const value = process.env[key] || this.cache.get(key) || defaultValue;

    return value;
  }

  /**
   * Get a required environment variable
   * @param key The environment variable key
   * @throws Error if the environment variable is not set
   */
  getRequired(key: string): string {
    const value = this.get(key);

    if (value === undefined) {
      throw new Error(`Required environment variable ${key} is not set`);
    }

    return value;
  }

  /**
   * Get an environment variable as a number
   * @param key The environment variable key
   * @param defaultValue The default value if the environment variable is not set
   */
  getNumber(key: string, defaultValue?: number): number | undefined {
    const value = this.get(key);

    if (value === undefined) {
      return defaultValue;
    }

    const num = Number(value);

    if (isNaN(num)) {
      this.logger.warn(`Environment variable ${key} is not a number: ${value}`);
      return defaultValue;
    }

    return num;
  }

  /**
   * Get a required environment variable as a number
   * @param key The environment variable key
   * @throws Error if the environment variable is not set or not a number
   */
  getRequiredNumber(key: string): number {
    const value = this.getRequired(key);
    const num = Number(value);

    if (isNaN(num)) {
      throw new Error(`Required environment variable ${key} is not a number: ${value}`);
    }

    return num;
  }

  /**
   * Get an environment variable as a boolean
   * @param key The environment variable key
   * @param defaultValue The default value if the environment variable is not set
   */
  getBoolean(key: string, defaultValue?: boolean): boolean | undefined {
    const value = this.get(key);

    if (value === undefined) {
      return defaultValue;
    }

    return value.toLowerCase() === 'true';
  }

  /**
   * Get a required environment variable as a boolean
   * @param key The environment variable key
   * @throws Error if the environment variable is not set
   */
  getRequiredBoolean(key: string): boolean {
    const value = this.getRequired(key);
    return value.toLowerCase() === 'true';
  }

  /**
   * Get an environment variable as JSON
   * @param key The environment variable key
   * @param defaultValue The default value if the environment variable is not set
   */
  getJson<T = any>(key: string, defaultValue?: T): T | undefined {
    const value = this.get(key);

    if (value === undefined) {
      return defaultValue;
    }

    try {
      return JSON.parse(value) as T;
    } catch (_error) {
      this.logger.warn(`Environment variable ${key} is not valid JSON: ${value}`);
      return defaultValue;
    }
  }

  /**
   * Get a required environment variable as JSON
   * @param key The environment variable key
   * @throws Error if the environment variable is not set or not valid JSON
   */
  getRequiredJson<T = any>(key: string): T {
    const value = this.getRequired(key);

    try {
      return JSON.parse(value) as T;
    } catch (_error) {
      throw new Error(`Required environment variable ${key} is not valid JSON: ${value}`);
    }
  }
}
