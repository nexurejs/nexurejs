/**
 * Error Handler Middleware
 *
 * Provides centralized error handling for HTTP applications
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { logger } from '../utils/logger.js';
import { isHttpError, toHttpError, HttpError } from '../errors/http-errors.js';

/**
 * Configuration options for the error handler
 */
export interface ErrorHandlerOptions {
  /**
   * Whether to log errors (default: true)
   */
  logErrors?: boolean;

  /**
   * Whether to include stacktraces in error responses (default: false)
   */
  includeStacktrace?: boolean;

  /**
   * Default status code for errors without a status code (default: 500)
   */
  fallbackStatusCode?: number;

  /**
   * Default error message for errors without a message (default: 'Internal Server Error')
   */
  fallbackErrorMessage?: string;

  /**
   * Default headers to include in error responses
   */
  headers?: Record<string, string>;
}

/**
 * Default options for the error handler
 */
const defaultOptions: Required<ErrorHandlerOptions> = {
  logErrors: true,
  includeStacktrace: false,
  fallbackStatusCode: 500,
  fallbackErrorMessage: 'Internal Server Error',
  headers: {
    'Content-Type': 'application/json'
  }
};

/**
 * Type for a middleware error handler function
 */
export type ErrorHandlerFunction = (
  err: Error,
  req: IncomingMessage,
  res: ServerResponse,
  next: () => Promise<void> | void
) => Promise<void> | void;

/**
 * Creates a middleware for handling errors
 *
 * @param options Configuration options
 * @returns Middleware error handler function
 */
export function createErrorHandler(options: ErrorHandlerOptions = {}): ErrorHandlerFunction {
  const config = { ...defaultOptions, ...options };

  return async (err: Error, req: IncomingMessage, res: ServerResponse): Promise<void> => {
    // If the response has already started, an error body cannot be written —
    // just ensure the socket is closed instead of throwing again.
    if (res.headersSent || res.writableEnded) {
      if (!res.writableEnded) {
        res.end();
      }
      return;
    }

    // Convert to HttpError if it's not already
    const httpError: HttpError = isHttpError(err)
      ? (err as HttpError)
      : toHttpError(err, config.fallbackStatusCode);

    // Set the status code
    res.statusCode = httpError.statusCode || config.fallbackStatusCode;

    // Log the error if enabled
    if (config.logErrors) {
      const logMethod = httpError.statusCode >= 500 ? 'error' : 'warn';
      const logContext = {
        url: req.url,
        method: req.method,
        statusCode: httpError.statusCode,
        errorName: httpError.name,
        errorCode: httpError.code
      };

      logger[logMethod](`Request error: ${httpError.message}`, logContext);

      if (httpError.statusCode >= 500) {
        logger.error(err.stack || err);
      }
    }

    // Set headers
    const headers = {
      ...config.headers,
      ...(typeof httpError.getHeaders === 'function' ? httpError.getHeaders() : {})
    };

    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }

    // Prepare the error response
    const errorResponse = {
      error: {
        statusCode: httpError.statusCode,
        message: httpError.message || config.fallbackErrorMessage,
        name: httpError.name,
        code: httpError.code || 'UNKNOWN_ERROR',
        ...(Object.keys(httpError.details || {}).length > 0 && { details: httpError.details })
      } as {
        statusCode: number;
        message: string;
        name: string;
        code: string;
        details?: any;
        stack?: string[];
      }
    };

    // Include stacktrace if enabled and available (only in non-production)
    if (config.includeStacktrace && process.env.NODE_ENV !== 'production' && err.stack) {
      errorResponse.error.stack = err.stack.split('\n').map(line => line.trim());
    }

    // Send the response
    res.end(JSON.stringify(errorResponse));
  };
}

/**
 * Default error handler with standard configuration
 */
export const errorHandler = createErrorHandler();

/**
 * Development error handler with stacktraces
 */
export const developmentErrorHandler = createErrorHandler({
  includeStacktrace: true
});
