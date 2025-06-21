/**
 * Error Handling Example
 *
 * This example demonstrates advanced error handling capabilities in NexureJS:
 * - Custom HTTP error types (NotFoundError, BadRequestError, InternalServerError)
 * - Error handler middleware with customizable options
 * - Detailed error information including stack traces in development
 * - Error codes and additional metadata for better debugging
 * - Handling of both synchronous and asynchronous errors
 *
 * For complete API documentation, see:
 * - API Reference: ./docs/API_REFERENCE.md
 * - Examples Guide: ./docs/EXAMPLES.md
 */

import http from 'node:http';
import {
  NotFoundError,
  BadRequestError,
  InternalServerError
} from '../dist/errors/http-errors.js';
import { createErrorHandler } from '../dist/middleware/error-handler.js';

// Set environment to development to show stack traces
process.env.NODE_ENV = 'development';

// Create the development error handler
const developmentErrorHandler = createErrorHandler({
  includeStacktrace: true,
  logErrors: true
});

// Create a simple server
const server = http.createServer(async (req, res) => {
  try {
    // Simple routing
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;

    console.log(`${req.method} ${path}`);

    if (path === '/') {
      // Root path - show instructions
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <head><title>Error Handling Example</title></head>
          <body>
            <h1>Error Handling Example</h1>
            <p>Try these endpoints:</p>
            <ul>
              <li><a href="/not-found">404 Not Found Error</a></li>
              <li><a href="/bad-request">400 Bad Request Error</a></li>
              <li><a href="/runtime-error">500 Runtime Error</a></li>
              <li><a href="/async-error">500 Async Error</a></li>
              <li><a href="/custom-error">Custom Error with Details</a></li>
            </ul>
          </body>
        </html>
      `);
      return;
    }

    if (path === '/not-found') {
      // Demonstrate 404 error
      throw new NotFoundError('The requested resource was not found');
    }

    if (path === '/bad-request') {
      // Demonstrate 400 error with details
      throw new BadRequestError('Invalid parameters', 'VALIDATION_ERROR', {
        fields: ['username', 'email'],
        reason: 'Missing required fields'
      });
    }

    if (path === '/runtime-error') {
      // Demonstrate a runtime error that gets converted to 500
      const obj = null;
      // This will throw a TypeError
      obj.nonExistentMethod();
      return;
    }

    if (path === '/async-error') {
      // Demonstrate an async error
      await new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Async operation failed')), 100);
      });
      return;
    }

    if (path === '/custom-error') {
      // Demonstrate a custom error with details
      const error = new InternalServerError(
        'A custom error occurred',
        'CUSTOM_ERROR_CODE',
        {
          timestamp: new Date().toISOString(),
          context: 'Processing user request',
          requestId: '12345',
          user: { id: 1, role: 'admin' }
        }
      );
      throw error;
    }

    // Default case - 404
    throw new NotFoundError(`Cannot ${req.method} ${path}`);

  } catch (error) {
    // Use our improved error handler
    await developmentErrorHandler(error, req, res, () => {
      // This is the fallback if the error handler fails
      res.statusCode = 500;
      res.end(JSON.stringify({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred'
      }));
    });
  }
});

// Start the server
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Error handling example running at http://localhost:${PORT}/`);
});
