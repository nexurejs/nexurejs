/**
 * Security headers middleware with enhanced CSP implementation
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { MiddlewareHandler } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * Content Security Policy directive types
 */
export interface CSPDirectives {
  'default-src'?: string[];
  'script-src'?: string[];
  'style-src'?: string[];
  'img-src'?: string[];
  'connect-src'?: string[];
  'font-src'?: string[];
  'object-src'?: string[];
  'media-src'?: string[];
  'frame-src'?: string[];
  'worker-src'?: string[];
  'manifest-src'?: string[];
  'form-action'?: string[];
  'base-uri'?: string[];
  'frame-ancestors'?: string[];
  'report-to'?: string[];
  'report-uri'?: string[];
  'upgrade-insecure-requests'?: boolean;
  'block-all-mixed-content'?: boolean;
  'require-trusted-types-for'?: string[];
  'trusted-types'?: string[];
  [key: string]: string[] | boolean | undefined;
}

/**
 * Content Security Policy options
 */
export interface CSPOptions {
  /**
   * CSP directives to use
   */
  directives?: CSPDirectives;

  /**
   * Whether to generate nonces for inline scripts and styles
   * @default true
   */
  useNonce?: boolean;

  /**
   * Whether to add CSP reporting
   * @default false
   */
  enableReporting?: boolean;

  /**
   * Endpoint to send CSP violation reports to
   * @default "/api/csp-report"
   */
  reportUri?: string;

  /**
   * Whether to use the Report-To header instead of report-uri
   * @default true
   */
  useReportTo?: boolean;

  /**
   * Report-To header configuration
   */
  reportToConfig?: {
    group: string;
    max_age: number;
    endpoints: { url: string }[];
  };

  /**
   * Whether to use CSP in report-only mode
   * @default false
   */
  reportOnly?: boolean;
}

/**
 * Security headers options
 */
export interface SecurityHeadersOptions {
  /**
   * Content Security Policy options
   */
  contentSecurityPolicy?: CSPOptions | string | false;

  /**
   * X-Frame-Options
   * @default "SAMEORIGIN"
   */
  frameOptions?: 'DENY' | 'SAMEORIGIN' | false;

  /**
   * X-Content-Type-Options
   * @default "nosniff"
   */
  contentTypeOptions?: 'nosniff' | false;

  /**
   * X-XSS-Protection
   * @default "1; mode=block"
   */
  xssProtection?: string | false;

  /**
   * Strict-Transport-Security
   * @default "max-age=15552000; includeSubDomains"
   */
  strictTransportSecurity?: string | false;

  /**
   * Referrer-Policy
   * @default "no-referrer-when-downgrade"
   */
  referrerPolicy?: string | false;

  /**
   * Permissions-Policy
   */
  permissionsPolicy?: string | false;

  /**
   * Cache-Control
   * @default "no-store, no-cache, must-revalidate, proxy-revalidate"
   */
  cacheControl?: string | false;

  /**
   * Pragma
   * @default "no-cache"
   */
  pragma?: string | false;

  /**
   * Expires
   * @default "0"
   */
  expires?: string | false;

  /**
   * Cross-Origin-Embedder-Policy
   */
  crossOriginEmbedderPolicy?: string | false;

  /**
   * Cross-Origin-Opener-Policy
   */
  crossOriginOpenerPolicy?: string | false;

  /**
   * Cross-Origin-Resource-Policy
   */
  crossOriginResourcePolicy?: string | false;

  /**
   * Origin-Agent-Cluster
   */
  originAgentCluster?: '?1' | false;
}

/**
 * Default CSP directives
 */
const DEFAULT_CSP_DIRECTIVES: CSPDirectives = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'"],
  'img-src': ["'self'"],
  'connect-src': ["'self'"],
  'font-src': ["'self'"],
  'object-src': ["'none'"],
  'media-src': ["'self'"],
  'frame-src': ["'self'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'self'"]
};

/**
 * Generate a CSP nonce
 * @returns A cryptographically secure random nonce
 */
export function generateNonce(): string {
  return randomBytes(16).toString('base64');
}

/**
 * Build a CSP directive string from directives object
 */
function buildCSPDirective(directives: CSPDirectives, nonce?: string): string {
  return Object.entries(directives)
    .map(([key, value]) => {
      if (typeof value === 'boolean') {
        return value === true ? key : '';
      }
      if (Array.isArray(value)) {
        // Add nonce to script-src and style-src if provided
        if (nonce && (key === 'script-src' || key === 'style-src')) {
          if (!value.some(src => src.includes("'nonce-"))) {
            value = [...value, `'nonce-${nonce}'`];
          }
        }
        return `${key} ${value.join(' ')}`;
      }
      return '';
    })
    .filter(Boolean)
    .join('; ');
}

/**
 * Create security headers middleware
 * @param options Security headers options
 */
export function createSecurityHeadersMiddleware(
  options: SecurityHeadersOptions = {}
): MiddlewareHandler {
  // Set content security policy
  let cspHeaderName = 'Content-Security-Policy';
  // Copy the defaults — this object is mutated per-instance (report-to /
  // report-uri) and must never corrupt the shared DEFAULT_CSP_DIRECTIVES.
  let cspDirectives: CSPDirectives = { ...DEFAULT_CSP_DIRECTIVES };
  let useNonce = true;
  let reportToConfig: any = null;

  // Process CSP options
  if (typeof options.contentSecurityPolicy === 'object') {
    const cspOptions: CSPOptions = options.contentSecurityPolicy;
    // Assign (do not redeclare) so the configured directives are actually used
    // when the header is built; copy so the caller's object is not mutated.
    cspDirectives = { ...(cspOptions.directives || { 'default-src': ["'self'"] }) };

    // Set nonce usage
    if (cspOptions.useNonce !== undefined) {
      useNonce = cspOptions.useNonce;
    }

    // Set up reporting
    if (cspOptions.enableReporting) {
      const reportUri = cspOptions.reportUri || '/api/csp-report';

      if (cspOptions.useReportTo !== false) {
        // Set up Report-To header
        reportToConfig = cspOptions.reportToConfig || {
          group: 'csp-endpoint',
          max_age: 10886400,
          endpoints: [{ url: reportUri }]
        };

        cspDirectives['report-to'] = ['csp-endpoint'];
      } else {
        // Use legacy report-uri directive
        cspDirectives['report-uri'] = [reportUri];
      }
    }

    // Set report-only mode
    if (cspOptions.reportOnly) {
      cspHeaderName = 'Content-Security-Policy-Report-Only';
    }
  } else if (typeof options.contentSecurityPolicy === 'string') {
    // If a string is provided, use it directly and disable nonce
    return createBasicSecurityHeadersMiddleware({
      ...options,
      contentSecurityPolicy: options.contentSecurityPolicy
    });
  } else if (options.contentSecurityPolicy === false) {
    // Disable CSP if explicitly set to false
    return createBasicSecurityHeadersMiddleware({
      ...options,
      contentSecurityPolicy: false
    });
  }

  // Other security headers settings
  const frameOptions = options.frameOptions !== undefined ? options.frameOptions : 'SAMEORIGIN';

  const contentTypeOptions =
    options.contentTypeOptions !== undefined ? options.contentTypeOptions : 'nosniff';

  const xssProtection =
    options.xssProtection !== undefined ? options.xssProtection : '1; mode=block';

  const strictTransportSecurity =
    options.strictTransportSecurity !== undefined
      ? options.strictTransportSecurity
      : 'max-age=15552000; includeSubDomains';

  const referrerPolicy =
    options.referrerPolicy !== undefined ? options.referrerPolicy : 'no-referrer-when-downgrade';

  const permissionsPolicy = options.permissionsPolicy;

  const cacheControl =
    options.cacheControl !== undefined
      ? options.cacheControl
      : 'no-store, no-cache, must-revalidate, proxy-revalidate';

  const pragma = options.pragma !== undefined ? options.pragma : 'no-cache';

  const expires = options.expires !== undefined ? options.expires : '0';

  const crossOriginEmbedderPolicy = options.crossOriginEmbedderPolicy;
  const crossOriginOpenerPolicy = options.crossOriginOpenerPolicy;
  const crossOriginResourcePolicy = options.crossOriginResourcePolicy;
  const originAgentCluster = options.originAgentCluster;

  return async (req: IncomingMessage, res: ServerResponse, next: () => Promise<void>) => {
    // Generate nonce for this request if needed
    let nonce: string | undefined;
    if (useNonce) {
      nonce = generateNonce();
      (req as any).cspNonce = nonce;
    }

    // Build CSP directive
    const csp = buildCSPDirective(cspDirectives, nonce);

    // Set CSP header
    if (csp) {
      res.setHeader(cspHeaderName, csp);
    }

    // Set Report-To header if configured
    if (reportToConfig) {
      res.setHeader('Report-To', JSON.stringify(reportToConfig));
    }

    // Set other security headers
    if (frameOptions) {
      res.setHeader('X-Frame-Options', frameOptions);
    }

    if (contentTypeOptions) {
      res.setHeader('X-Content-Type-Options', contentTypeOptions);
    }

    if (xssProtection) {
      res.setHeader('X-XSS-Protection', xssProtection);
    }

    if (strictTransportSecurity) {
      res.setHeader('Strict-Transport-Security', strictTransportSecurity);
    }

    if (referrerPolicy) {
      res.setHeader('Referrer-Policy', referrerPolicy);
    }

    if (permissionsPolicy) {
      res.setHeader('Permissions-Policy', permissionsPolicy);
    }

    if (cacheControl) {
      res.setHeader('Cache-Control', cacheControl);
    }

    if (pragma) {
      res.setHeader('Pragma', pragma);
    }

    if (expires) {
      res.setHeader('Expires', expires);
    }

    if (crossOriginEmbedderPolicy) {
      res.setHeader('Cross-Origin-Embedder-Policy', crossOriginEmbedderPolicy);
    }

    if (crossOriginOpenerPolicy) {
      res.setHeader('Cross-Origin-Opener-Policy', crossOriginOpenerPolicy);
    }

    if (crossOriginResourcePolicy) {
      res.setHeader('Cross-Origin-Resource-Policy', crossOriginResourcePolicy);
    }

    if (originAgentCluster) {
      res.setHeader('Origin-Agent-Cluster', originAgentCluster);
    }

    // Continue to next middleware
    await next();
  };
}

/**
 * Create basic security headers middleware for simple string CSP
 * This is used internally when a string CSP value is provided
 */
function createBasicSecurityHeadersMiddleware(options: SecurityHeadersOptions): MiddlewareHandler {
  // Extract all options
  const contentSecurityPolicy = options.contentSecurityPolicy;
  const frameOptions = options.frameOptions !== undefined ? options.frameOptions : 'SAMEORIGIN';
  const contentTypeOptions =
    options.contentTypeOptions !== undefined ? options.contentTypeOptions : 'nosniff';
  const xssProtection =
    options.xssProtection !== undefined ? options.xssProtection : '1; mode=block';
  const strictTransportSecurity =
    options.strictTransportSecurity !== undefined
      ? options.strictTransportSecurity
      : 'max-age=15552000; includeSubDomains';
  const referrerPolicy =
    options.referrerPolicy !== undefined ? options.referrerPolicy : 'no-referrer-when-downgrade';
  const permissionsPolicy = options.permissionsPolicy;
  const cacheControl =
    options.cacheControl !== undefined
      ? options.cacheControl
      : 'no-store, no-cache, must-revalidate, proxy-revalidate';
  const pragma = options.pragma !== undefined ? options.pragma : 'no-cache';
  const expires = options.expires !== undefined ? options.expires : '0';
  const crossOriginEmbedderPolicy = options.crossOriginEmbedderPolicy;
  const crossOriginOpenerPolicy = options.crossOriginOpenerPolicy;
  const crossOriginResourcePolicy = options.crossOriginResourcePolicy;
  const originAgentCluster = options.originAgentCluster;

  return async (_req: IncomingMessage, res: ServerResponse, next: () => Promise<void>) => {
    // Set security headers
    if (contentSecurityPolicy && typeof contentSecurityPolicy === 'string') {
      res.setHeader('Content-Security-Policy', contentSecurityPolicy);
    }

    if (frameOptions) {
      res.setHeader('X-Frame-Options', frameOptions);
    }

    if (contentTypeOptions) {
      res.setHeader('X-Content-Type-Options', contentTypeOptions);
    }

    if (xssProtection) {
      res.setHeader('X-XSS-Protection', xssProtection);
    }

    if (strictTransportSecurity) {
      res.setHeader('Strict-Transport-Security', strictTransportSecurity);
    }

    if (referrerPolicy) {
      res.setHeader('Referrer-Policy', referrerPolicy);
    }

    if (permissionsPolicy) {
      res.setHeader('Permissions-Policy', permissionsPolicy);
    }

    if (cacheControl) {
      res.setHeader('Cache-Control', cacheControl);
    }

    if (pragma) {
      res.setHeader('Pragma', pragma);
    }

    if (expires) {
      res.setHeader('Expires', expires);
    }

    if (crossOriginEmbedderPolicy) {
      res.setHeader('Cross-Origin-Embedder-Policy', crossOriginEmbedderPolicy);
    }

    if (crossOriginOpenerPolicy) {
      res.setHeader('Cross-Origin-Opener-Policy', crossOriginOpenerPolicy);
    }

    if (crossOriginResourcePolicy) {
      res.setHeader('Cross-Origin-Resource-Policy', crossOriginResourcePolicy);
    }

    if (originAgentCluster) {
      res.setHeader('Origin-Agent-Cluster', originAgentCluster);
    }

    // Continue to next middleware
    await next();
  };
}

/**
 * Get the CSP nonce for the current request
 * This can be used in templates to add the nonce to inline scripts
 *
 * @param req The request object
 * @returns The CSP nonce or undefined if not available
 */
export function getNonce(req: IncomingMessage): string | undefined {
  return (req as any).cspNonce;
}

/**
 * Create a middleware for handling CSP violation reports
 * @param handler Custom handler for CSP violation reports
 */
export function createCSPReportingMiddleware(
  handler?: (report: any, req: IncomingMessage, res: ServerResponse) => Promise<void>
): MiddlewareHandler {
  return async (req: IncomingMessage, res: ServerResponse, next: () => Promise<void>) => {
    // Only handle POST requests to the CSP reporting endpoint
    if (req.method !== 'POST' || !req.url || !req.url.endsWith('/api/csp-report')) {
      return next();
    }

    // Parse the report
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk.toString();
      }

      const report = JSON.parse(body);

      // Log the report
      logger.warn('CSP Violation:', report);

      // Call custom handler if provided
      if (handler) {
        await handler(report, req, res);
      } else {
        // Default response
        res.statusCode = 204;
        res.end();
      }
    } catch (error) {
      logger.error('Error processing CSP report:', error);
      res.statusCode = 400;
      res.end('Bad Request');
    }
  };
}
