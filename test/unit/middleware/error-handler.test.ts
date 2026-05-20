/**
 * Tests for the createErrorHandler middleware factory.
 */

import { describe, test, expect } from 'vitest';
import { createErrorHandler } from '../../../src/middleware/error-handler.js';
import { NotFoundError } from '../../../src/errors/http-errors.js';

function mockReqRes() {
  const req = { url: '/x', method: 'GET' } as any;
  const chunks: string[] = [];
  const headers: Record<string, unknown> = {};
  const res = {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    setHeader(key: string, value: unknown) {
      headers[key] = value;
    },
    hasHeader(key: string) {
      return key in headers;
    },
    end(chunk?: string) {
      if (chunk) chunks.push(chunk);
      this.writableEnded = true;
    }
  } as any;
  return { req, res, body: () => chunks.join('') };
}

describe('createErrorHandler', () => {
  test('writes a JSON error response carrying the error status', async () => {
    const handler = createErrorHandler({ logErrors: false });
    const { req, res, body } = mockReqRes();
    await handler(new NotFoundError('missing'), req, res, async () => {});
    expect(res.statusCode).toBe(404);
    const parsed = JSON.parse(body());
    expect(parsed.error.statusCode).toBe(404);
    expect(parsed.error.message).toBe('missing');
  });

  test('does not write a body once the response has already started', async () => {
    const handler = createErrorHandler({ logErrors: false });
    const { req, res, body } = mockReqRes();
    res.headersSent = true;
    await handler(new Error('late failure'), req, res, async () => {});
    expect(body()).toBe('');
  });
});
