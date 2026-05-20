/**
 * Unified JSON Processor
 *
 * This module provides a unified interface for JSON processing,
 * automatically using the native implementation when available and
 * falling back to the JS implementation when needed.
 */

import { logger } from '../utils/logger.js';
import { NativeJsonProcessor } from '../types/index.js';

/**
 * JSON processing options
 */
export interface JsonProcessingOptions {
  /**
   * Parse reviver function
   */
  reviver?: (key: string, value: any) => any;

  /**
   * Stringify replacer function or array
   */
  replacer?: ((key: string, value: any) => any) | Array<string | number>;

  /**
   * Indentation spaces
   */
  spaces?: number;
}

/**
 * Unified JSON Processor
 * Uses native implementation when available, falls back to JS implementation
 */
export class JsonProcessor {
  private nativeProcessor: NativeJsonProcessor | null = null;
  private useNative: boolean = false;

  /**
   * Create a new JSON processor
   */
  constructor() {
    try {
      this.nativeProcessor = new NativeJsonProcessor();
      // Test if native processor is usable
      const testResult = this.nativeProcessor.parse('{"test":true}');
      if (testResult && testResult.test === true) {
        this.useNative = true;
      } else {
        this.useNative = false;
      }
    } catch (error) {
      logger.error('Error initializing native JSON processor:', error);
      this.useNative = false;
    }
  }

  /**
   * Parse JSON string
   * @param json JSON string to parse
   * @param options Parsing options
   * @returns Parsed object
   */
  parse(json: string | Buffer, options?: JsonProcessingOptions): any {
    if (this.useNative && this.nativeProcessor && !options?.reviver) {
      // Use native parser for better performance (when no reviver is needed)
      return this.nativeProcessor.parse(json);
    } else {
      // Use JS parser
      try {
        const jsonStr = typeof json === 'string' ? json : json.toString('utf8');
        return JSON.parse(jsonStr, options?.reviver);
      } catch (_error) {
        return null;
      }
    }
  }

  /**
   * Convert object to JSON string
   * @param value Object to stringify
   * @param options Stringify options
   * @returns JSON string
   */
  stringify(value: any, options?: JsonProcessingOptions): string {
    if (this.useNative && this.nativeProcessor && !options?.replacer && !options?.spaces) {
      // Use native stringify for better performance (when no replacer or spaces are needed)
      return this.nativeProcessor.stringify(value);
    } else {
      // Use JS stringify
      try {
        return JSON.stringify(value, options?.replacer as any, options?.spaces);
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`JSON stringify error: ${error.message}`);
        }
        throw error;
      }
    }
  }

  /**
   * Parse a stream of JSON objects
   * @param buffer Buffer containing multiple JSON objects
   * @param options Parsing options
   * @returns Array of parsed objects
   */
  parseStream(buffer: Buffer, options?: JsonProcessingOptions): any[] {
    if (this.useNative && this.nativeProcessor && !options?.reviver) {
      // Use native parseStream for better performance
      return this.nativeProcessor.parseStream(buffer);
    } else {
      // Use JS parser with a basic streaming implementation
      const str = buffer.toString('utf8');
      const results: any[] = [];
      let startPos = 0;

      while (startPos < str.length) {
        try {
          startPos = this.parseNextObject(str, startPos, results, options);
        } catch (_e) {
          startPos++; // Skip problematic character and try again
        }
      }

      return results;
    }
  }

  /**
   * Parse next JSON object from a string
   * @private
   */
  private parseNextObject(
    str: string,
    startPos: number,
    results: any[],
    options?: JsonProcessingOptions
  ): number {
    // Find opening brace or bracket
    let openPos = str.indexOf('{', startPos);
    const arrayOpenPos = str.indexOf('[', startPos);

    if (arrayOpenPos !== -1 && (openPos === -1 || arrayOpenPos < openPos)) {
      openPos = arrayOpenPos;
    }

    if (openPos === -1) return str.length;

    // Parse one object
    let depth = 1;
    let closePos = openPos + 1;
    const openChar = str[openPos];
    const closeChar = openChar === '{' ? '}' : ']';

    while (depth > 0 && closePos < str.length) {
      if (str[closePos] === openChar) depth++;
      else if (str[closePos] === closeChar) depth--;
      closePos++;
    }

    if (depth === 0) {
      const jsonStr = str.substring(openPos, closePos);
      const parsed = JSON.parse(jsonStr, options?.reviver);
      results.push(parsed);
      return closePos;
    } else {
      return str.length; // Incomplete JSON
    }
  }

  /**
   * Convert array of objects to JSON stream
   * @param values Array of objects to stringify
   * @param options Stringify options
   * @returns JSON string containing all objects
   */
  stringifyStream(values: any[], options?: JsonProcessingOptions): string {
    if (this.useNative && this.nativeProcessor && !options?.replacer && !options?.spaces) {
      // Use native stringifyStream for better performance
      return this.nativeProcessor.stringifyStream(values);
    } else {
      // Use JS stringify
      try {
        return values
          .map(value => JSON.stringify(value, options?.replacer as any, options?.spaces))
          .join('\n');
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(`JSON stringify stream error: ${error.message}`);
        }
        throw error;
      }
    }
  }

  /**
   * Check if native processor is being used
   */
  isUsingNative(): boolean {
    return this.useNative;
  }
}
