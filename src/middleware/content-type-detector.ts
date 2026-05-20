/**
 * Content Type Detector Middleware
 *
 * Detects the content type of incoming requests and sets up appropriate
 * optimized streaming transformers based on the content type.
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { PassThrough, Transform } from 'node:stream';
import { getContentType, createJsonTransformer, createTextTransformer } from '../types/index.js';
import { logger } from '../utils/logger.js';

interface ContentTypeOptions {
  /** Whether to automatically transform content based on type */
  autoTransform?: boolean;
  /** Whether to expose stream transformers on the request object */
  exposeStreams?: boolean;
}

// Extend the IncomingMessage type to include our custom properties
declare module 'node:http' {
  interface IncomingMessage {
    contentType?: string;
    rawBodyStream?: PassThrough;
    jsonBodyStream?: Transform;
    textBodyStream?: Transform;
    formBodyStream?: Transform;
    multipartBodyStream?: PassThrough;
    bodyStream?: PassThrough;
    jsonBody?: any;
    textBody?: string;
    formBody?: Record<string, string>;
    originalPipe?: typeof IncomingMessage.prototype.pipe;
  }
}

/**
 * Middleware that detects content type and sets up appropriate stream transformers
 */
export function contentTypeDetector(
  options: ContentTypeOptions = { autoTransform: true, exposeStreams: true }
): (req: IncomingMessage, res: ServerResponse, next: (err?: Error) => void) => void {
  const { autoTransform = true, exposeStreams = true } = options;

  return (req: IncomingMessage, res: ServerResponse, next: (err?: Error) => void): void => {
    try {
      // Get content type
      const contentType = getContentType(req);

      // Set content type property on request
      req.contentType = contentType;

      // Set up stream transformers based on content type
      if (exposeStreams) {
        // Create a PassThrough for raw access to the body
        const rawStream = new PassThrough();
        req.rawBodyStream = rawStream;

        // Set up specific transformers for different content types
        if (/json/.test(contentType)) {
          setupJsonTransformers(req, rawStream, autoTransform);
        } else if (/text\/plain/.test(contentType)) {
          setupTextTransformers(req, rawStream, autoTransform);
        } else if (/application\/x-www-form-urlencoded/.test(contentType)) {
          setupFormTransformers(req, rawStream, autoTransform);
        } else if (/multipart\/form-data/.test(contentType)) {
          setupMultipartTransformers(req, rawStream, autoTransform);
        } else {
          // Default to raw body
          setupRawTransformers(req, rawStream, autoTransform);
        }
      }

      next();
    } catch (err) {
      next(err instanceof Error ? err : new Error(String(err)));
    }
  };
}

/**
 * Set up JSON transformers for the request
 */
function setupJsonTransformers(
  req: IncomingMessage,
  rawStream: PassThrough,
  autoTransform: boolean
): void {
  // Store original pipe method
  const originalPipe = req.pipe;

  // Create JSON transformer
  const jsonTransformer = createJsonTransformer({
    processJson: (data: any) => {
      // Store parsed JSON on request
      req.jsonBody = data;
      return data;
    },
    processError: (err: Error) => {
      logger.warn('JSON parse error:', err.message);
    }
  });

  // Expose transformers
  req.jsonBodyStream = jsonTransformer;

  // Set up automatic transform piping if enabled
  if (autoTransform) {
    // Override pipe to intercept the first pipe call
    req.pipe = function <T extends NodeJS.WritableStream>(
      destination: T,
      _options?: { end?: boolean }
    ): T {
      // Pipe through our transformers
      req.pipe = originalPipe; // Restore original pipe

      // Set up pipeline: req -> rawStream -> jsonTransformer -> destination
      originalPipe.call(req, rawStream);
      rawStream.pipe(jsonTransformer);
      jsonTransformer.pipe(destination);
      return destination;
    };
  }
}

/**
 * Set up text transformers for the request
 */
function setupTextTransformers(
  req: IncomingMessage,
  rawStream: PassThrough,
  autoTransform: boolean
): void {
  // Store original pipe method
  const originalPipe = req.pipe;

  // Create text transformer
  const textTransformer = createTextTransformer({
    processText: (text: string) => {
      // Store text on request
      req.textBody = text;
      return text;
    }
  });

  // Expose transformers
  req.textBodyStream = textTransformer;

  // Set up automatic transform piping if enabled
  if (autoTransform) {
    // Override pipe to intercept the first pipe call
    req.pipe = function <T extends NodeJS.WritableStream>(
      destination: T,
      _options?: { end?: boolean }
    ): T {
      // Pipe through our transformers
      req.pipe = originalPipe; // Restore original pipe

      // Set up pipeline: req -> rawStream -> textTransformer -> destination
      originalPipe.call(req, rawStream);
      rawStream.pipe(textTransformer);
      textTransformer.pipe(destination);
      return destination;
    };
  }
}

/**
 * Set up form transformers for the request
 */
function setupFormTransformers(
  req: IncomingMessage,
  rawStream: PassThrough,
  autoTransform: boolean
): void {
  // Store original pipe method
  const originalPipe = req.pipe;

  // Create text transformer that will be used to parse form data
  const textTransformer = createTextTransformer({
    processText: (text: string) => {
      // Parse form data. URLSearchParams decodes '+' as a space and splits
      // only on the first '=', so values may themselves contain '='.
      const formData: Record<string, string> = {};
      const formParams = new URLSearchParams(text);
      for (const [key, value] of formParams.entries()) {
        formData[key] = value;
      }

      // Store on request
      req.formBody = formData;
      return text;
    }
  });

  // Expose transformers
  req.formBodyStream = textTransformer;

  // Set up automatic transform piping if enabled
  if (autoTransform) {
    // Override pipe to intercept the first pipe call
    req.pipe = function <T extends NodeJS.WritableStream>(
      destination: T,
      _options?: { end?: boolean }
    ): T {
      // Pipe through our transformers
      req.pipe = originalPipe; // Restore original pipe

      // Set up pipeline: req -> rawStream -> textTransformer -> destination
      originalPipe.call(req, rawStream);
      rawStream.pipe(textTransformer);
      textTransformer.pipe(destination);
      return destination;
    };
  }
}

/**
 * Set up multipart transformers for the request
 */
function setupMultipartTransformers(
  req: IncomingMessage,
  rawStream: PassThrough,
  autoTransform: boolean
): void {
  // For multipart, we don't auto-transform as it's more complex
  // Instead, we just expose the raw stream for specialized parsers to use

  // Store original pipe method
  const originalPipe = req.pipe;

  // Expose the raw stream
  req.multipartBodyStream = rawStream;

  // Set up automatic piping if enabled
  if (autoTransform) {
    // Override pipe to intercept the first pipe call
    req.pipe = function <T extends NodeJS.WritableStream>(
      destination: T,
      _options?: { end?: boolean }
    ): T {
      // Pipe through our transformers
      req.pipe = originalPipe; // Restore original pipe

      // For multipart, just set up: req -> rawStream -> destination
      originalPipe.call(req, rawStream);
      rawStream.pipe(destination);
      return destination;
    };
  }
}

/**
 * Set up raw body transformers for the request
 */
function setupRawTransformers(
  req: IncomingMessage,
  rawStream: PassThrough,
  autoTransform: boolean
): void {
  // Store original pipe method
  const originalPipe = req.pipe;

  // Expose the raw stream
  req.bodyStream = rawStream;

  // Set up automatic piping if enabled
  if (autoTransform) {
    // Override pipe to intercept the first pipe call
    req.pipe = function <T extends NodeJS.WritableStream>(
      destination: T,
      _options?: { end?: boolean }
    ): T {
      // Pipe through our transformers
      req.pipe = originalPipe; // Restore original pipe

      // Just set up: req -> rawStream -> destination
      originalPipe.call(req, rawStream);
      rawStream.pipe(destination);
      return destination;
    };
  }
}

export default contentTypeDetector;
