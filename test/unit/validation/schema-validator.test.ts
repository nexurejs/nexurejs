/**
 * Tests for SchemaValidator object validation (JS fallback path).
 */

import { describe, test, expect } from 'vitest';
import { SchemaValidator } from '../../../src/validation/schema-validator.js';

const schema = {
  name: { type: 'string', required: true },
  age: { type: 'number' }
};

describe('SchemaValidator', () => {
  test('accepts data that satisfies the schema', () => {
    const result = new SchemaValidator().validate(schema, { name: 'ada', age: 36 });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('rejects a field with the wrong type', () => {
    const result = new SchemaValidator().validate(schema, { name: 123, age: 36 });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'name')).toBe(true);
  });

  test('rejects data that is missing a required field', () => {
    const result = new SchemaValidator().validate(schema, { age: 36 });
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.path === 'name')).toBe(true);
  });

  test('treats optional fields as valid when absent', () => {
    const result = new SchemaValidator().validate(schema, { name: 'grace' });
    expect(result.valid).toBe(true);
  });
});
