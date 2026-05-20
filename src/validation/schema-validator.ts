/**
 * Unified Schema Validator
 *
 * This module provides a unified interface for schema validation,
 * automatically using the native implementation when available and
 * falling back to the JS implementation when needed.
 */

import { logger } from '../utils/logger.js';
import { Validator } from '../validation/validator.js';
import { NativeSchemaValidator } from '../types/index.js';

/**
 * Validation error
 */
export interface ValidationError {
  /**
   * Field path
   */
  path: string;

  /**
   * Error message
   */
  message: string;

  /**
   * Rule that failed
   */
  rule?: string;

  /**
   * Rule parameters
   */
  params?: Record<string, any>;
}

/**
 * Validation result
 */
export interface ValidationResult {
  /**
   * Whether validation passed
   */
  valid: boolean;

  /**
   * Validation errors
   */
  errors: ValidationError[];

  /**
   * Sanitized data
   */
  data?: any;
}

/**
 * Schema validation options
 */
export interface SchemaValidationOptions {
  /**
   * Whether to strip unknown properties
   * @default false
   */
  stripUnknown?: boolean;

  /**
   * Whether to allow unknown properties
   * @default true
   */
  allowUnknown?: boolean;
}

/**
 * Unified Schema Validator
 * Uses native implementation when available, falls back to JS implementation
 */
export class SchemaValidator {
  private nativeValidator: NativeSchemaValidator | null = null;
  private jsValidator: Validator | null = null;
  private useNative: boolean = false;

  /**
   * Create a new schema validator
   */
  constructor() {
    try {
      this.nativeValidator = new NativeSchemaValidator();
      // Verify the native validator actually enforces rules. A real validator
      // must ACCEPT valid input and REJECT a missing required value; a stub
      // that always returns { valid: true } fails this probe, so we fall back
      // to the (working) JS validator.
      const accepts = this.nativeValidator.validate(
        { type: 'string', required: true },
        'present'
      );
      const rejects = this.nativeValidator.validate(
        { type: 'string', required: true },
        undefined
      );
      if (accepts?.valid === true && rejects?.valid === false) {
        this.useNative = true;
      } else {
        this.useNative = false;
        this.jsValidator = new Validator();
      }
    } catch (error) {
      logger.error('Error creating schema validator:', error);
      this.useNative = false;
      this.jsValidator = new Validator();
    }
  }

  /**
   * Validate data against a schema
   * @param schema The schema to validate against
   * @param data The data to validate
   * @param options Validation options
   * @returns Validation result
   */
  validate(schema: object, data: any, options?: SchemaValidationOptions): ValidationResult {
    if (this.useNative && this.nativeValidator) {
      // Use native validator
      const result = this.nativeValidator.validate(schema, data);
      return {
        valid: result.valid,
        errors: result.errors.map(error => ({
          path: error.path,
          message: error.message
        })),
        data
      };
    } else if (this.jsValidator) {
      // Use JS validator
      const result = this.validateWithJs(schema, data, options);
      return result;
    } else {
      // No validator available
      throw new Error('No validator available');
    }
  }

  /**
   * Validate partial updates against an existing object
   * @param schema The schema for the entire object
   * @param data The existing data object
   * @param updates The partial updates to apply and validate
   * @param options Validation options
   * @returns Validation result
   */
  validatePartial(
    schema: object,
    data: object,
    updates: object,
    options?: SchemaValidationOptions
  ): ValidationResult {
    if (this.useNative && this.nativeValidator) {
      // Use native validator for partial validation
      const result = this.nativeValidator.validatePartial(schema, data, updates);
      return {
        valid: result.valid,
        errors: result.errors.map(error => ({
          path: error.path,
          message: error.message
        })),
        data: { ...data, ...updates }
      };
    } else if (this.jsValidator) {
      // Merge updates with data and validate
      const mergedData = { ...data, ...updates };
      return this.validateWithJs(schema, mergedData, options);
    } else {
      // No validator available
      throw new Error('No validator available');
    }
  }

  /**
   * Compile a schema for faster validation
   * @param schema The schema to compile
   * @returns A reference to the compiled schema
   */
  compileSchema(schema: object): { id: string; hash: string; version: number } {
    if (this.useNative && this.nativeValidator) {
      return this.nativeValidator.compileSchema(schema);
    }

    // JS implementation doesn't support schema compilation
    return { id: '', hash: '', version: 0 };
  }

  /**
   * Clear the schema cache
   */
  clearCache(): void {
    if (this.useNative && this.nativeValidator) {
      this.nativeValidator.clearCache();
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    cacheSize: number;
    cacheHits: number;
    cacheMisses: number;
    cacheEvictions: number;
    hitRatio: number;
    totalValidations: number;
  } {
    if (this.useNative && this.nativeValidator) {
      const stats = this.nativeValidator.getCacheStats();
      return {
        cacheSize: stats.cacheSize,
        cacheHits: stats.cacheHits,
        cacheMisses: stats.cacheMisses,
        cacheEvictions: stats.cacheEvictions,
        hitRatio: stats.hitRatio,
        totalValidations: stats.totalValidations
      };
    }

    // JS implementation doesn't have cache stats
    return {
      cacheSize: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheEvictions: 0,
      hitRatio: 0,
      totalValidations: 0
    };
  }

  /**
   * Check if the native validator is being used
   * @returns True if using native validator
   */
  isUsingNative(): boolean {
    return this.useNative;
  }

  /**
   * Force use of JS validator (for testing)
   */
  forceJsValidator(): void {
    this.useNative = false;
    if (!this.jsValidator) {
      this.jsValidator = new Validator();
    }
  }

  /**
   * Validate with JS validator
   * @private
   */
  private validateWithJs(
    schema: any,
    data: any,
    _options?: SchemaValidationOptions
  ): ValidationResult {
    if (!this.jsValidator) {
      throw new Error('JS validator not initialized');
    }

    // Treat the schema as a map of field name -> field rules, and validate
    // each field of the data object against its rules. (Previously this only
    // inspected top-level schema keys, so a field-map schema validated nothing
    // and every object was reported as valid.)
    const errors: ValidationError[] = [];

    for (const [field, fieldRules] of Object.entries(schema as Record<string, any>)) {
      if (!fieldRules || typeof fieldRules !== 'object') {
        continue;
      }
      const fieldSchema = this.convertToValidationSchema(fieldRules, field);
      const fieldValue = data == null ? undefined : data[field];
      const fieldResult = this.jsValidator.validate(fieldValue, fieldSchema);
      if (!fieldResult.valid) {
        errors.push(...fieldResult.errors);
      }
    }

    return { valid: errors.length === 0, errors, data };
  }

  /**
   * Convert JSON schema to ValidationSchema format
   * @private
   */
  private convertToValidationSchema(schema: any, path: string = '$'): any {
    // Basic mapping of JSON schema to ValidationSchema
    const result: any = {
      path
    };

    if (schema.type) {
      result.type = schema.type;
    }

    if (schema.required) {
      result.required = true;
    }

    if (schema.format) {
      result.format = schema.format;
    }

    // Accept both shorthand (min/max) and JSON-Schema (minimum/maximum) names;
    // use !== undefined so a bound of 0 is not dropped.
    const min = schema.min ?? schema.minimum;
    if (min !== undefined) {
      result.min = min;
    }

    const max = schema.max ?? schema.maximum;
    if (max !== undefined) {
      result.max = max;
    }

    return result;
  }
}
