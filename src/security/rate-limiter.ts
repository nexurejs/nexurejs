/**
 * Rate Limiting Middleware with Token Bucket Algorithm
 *
 * This implementation provides advanced rate limiting features:
 * - Token bucket algorithm for smoother rate limiting
 * - Distributed rate limiting with Redis support
 * - Tiered rate limiting based on user roles or other factors
 * - Rate limit groups for shared limits across endpoints
 */

import { IncomingMessage, ServerResponse } from 'node:http';
import { HttpException, MiddlewareHandler } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * Rate limiter options
 */
export interface RateLimiterOptions {
  /**
   * Maximum number of requests allowed in the window
   * @default 100
   */
  max?: number;

  /**
   * Time window in milliseconds
   * @default 60000 (1 minute)
   */
  windowMs?: number;

  /**
   * Token refill rate, in tokens per **millisecond** (this is how the bucket
   * consumes it: tokensToAdd = elapsedMs * refillRate).
   * @default max / windowMs
   */
  refillRate?: number;

  /**
   * Maximum burst size for token bucket algorithm
   * @default same as max
   */
  burstSize?: number;

  /**
   * Whether to add rate limit headers to the response
   * @default true
   */
  headers?: boolean;

  /**
   * Function to generate a key for the request
   * @default IP address
   */
  keyGenerator?: (req: IncomingMessage) => string;

  /**
   * Function to determine the rate limit tier for a request
   * @default Standard tier (returns 1.0 multiplier)
   */
  tierGenerator?: (req: IncomingMessage) => Promise<RateLimitTier> | RateLimitTier;

  /**
   * Rate limit group name (for shared limits across endpoints)
   */
  group?: string;

  /**
   * Function to skip rate limiting for certain requests
   * @default false
   */
  skip?: (req: IncomingMessage) => boolean;

  /**
   * Status code to use when rate limit is exceeded
   * @default 429
   */
  statusCode?: number;

  /**
   * Message to use when rate limit is exceeded
   * @default 'Too many requests, please try again later.'
   */
  message?: string;

  /**
   * Header names
   */
  headerNames?: {
    /**
     * Header for remaining requests
     * @default 'X-RateLimit-Remaining'
     */
    remaining?: string;

    /**
     * Header for rate limit
     * @default 'X-RateLimit-Limit'
     */
    limit?: string;

    /**
     * Header for reset time
     * @default 'X-RateLimit-Reset'
     */
    reset?: string;

    /**
     * Header for retry after
     * @default 'Retry-After'
     */
    retryAfter?: string;
  };

  /**
   * Whether to track across distributed instances
   * @default false
   */
  distributed?: boolean;

  /**
   * Response handler for when rate limit is exceeded
   */
  handler?: (req: IncomingMessage, res: ServerResponse, next: () => Promise<void>) => Promise<void>;
}

/**
 * Rate limit tier information
 */
export interface RateLimitTier {
  /**
   * Multiplier for the base rate limit (e.g., 1.0 for standard, 2.0 for premium)
   */
  multiplier: number;

  /**
   * Tier name for logging and headers
   */
  name: string;
}

/**
 * Token bucket data structure
 */
interface TokenBucket {
  /**
   * Current token count
   */
  tokens: number;

  /**
   * Last refill timestamp
   */
  lastRefill: number;

  /**
   * Maximum capacity
   */
  capacity: number;

  /**
   * Refill rate (tokens per millisecond)
   */
  refillRate: number;

  /**
   * Tier information
   */
  tier: RateLimitTier;
}

/**
 * Result of a rate limit check
 */
interface RateLimitResult {
  /**
   * Whether the request is allowed
   */
  allowed: boolean;

  /**
   * Remaining tokens
   */
  remaining: number;

  /**
   * Maximum tokens
   */
  limit: number;

  /**
   * When the bucket will be full again (epoch ms)
   */
  resetTime: number;

  /**
   * Tier information
   */
  tier: RateLimitTier;
}

/**
 * Token bucket store implementation
 */
export class TokenBucketStore {
  private buckets: Map<string, TokenBucket>;

  constructor() {
    this.buckets = new Map();
  }

  /**
   * Check if a request is allowed and consume a token if it is
   */
  async check(
    key: string,
    options: {
      capacity: number;
      refillRate: number;
      tier: RateLimitTier;
    }
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const bucket = this.getBucket(key, options);

    // Refill tokens based on time elapsed
    this.refillBucket(bucket, now);

    // Check if the bucket has tokens
    const allowed = bucket.tokens >= 1;

    // Consume a token if allowed
    if (allowed) {
      bucket.tokens -= 1;
    }

    // Calculate reset time (when the bucket will be full again)
    const tokensNeeded = bucket.capacity - bucket.tokens;
    const resetTime = now + Math.ceil(tokensNeeded / bucket.refillRate);

    return {
      allowed,
      remaining: Math.floor(bucket.tokens),
      limit: Math.floor(bucket.capacity),
      resetTime,
      tier: bucket.tier
    };
  }

  /**
   * Reset a bucket
   */
  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }

  /**
   * Get a bucket, creating it if it doesn't exist
   */
  private getBucket(
    key: string,
    options: {
      capacity: number;
      refillRate: number;
      tier: RateLimitTier;
    }
  ): TokenBucket {
    if (!this.buckets.has(key)) {
      // Create a new bucket
      this.buckets.set(key, {
        tokens: options.capacity, // Start with full capacity
        lastRefill: Date.now(),
        capacity: options.capacity,
        refillRate: options.refillRate,
        tier: options.tier
      });
    } else {
      // Update existing bucket with new options
      const bucket = this.buckets.get(key)!;

      // Only update if the tier changes
      if (bucket.tier.multiplier !== options.tier.multiplier) {
        const newCapacity = options.capacity;

        // Scale tokens proportionally to new capacity
        if (bucket.capacity > 0) {
          bucket.tokens = (bucket.tokens / bucket.capacity) * newCapacity;
        } else {
          bucket.tokens = newCapacity;
        }

        bucket.capacity = newCapacity;
        bucket.refillRate = options.refillRate;
        bucket.tier = options.tier;
      }
    }

    return this.buckets.get(key)!;
  }

  /**
   * Refill a bucket based on time elapsed
   */
  private refillBucket(bucket: TokenBucket, now: number): void {
    const elapsed = now - bucket.lastRefill;

    if (elapsed > 0) {
      // Add tokens based on time elapsed
      const tokensToAdd = elapsed * bucket.refillRate;

      // Cap at capacity
      bucket.tokens = Math.min(bucket.capacity, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }
  }

  /**
   * Clean up expired buckets
   */
  private cleanup(): void {
    const now = Date.now();
    const expireTime = 3600000; // 1 hour

    for (const [key, bucket] of this.buckets.entries()) {
      // If the bucket hasn't been used in an hour and is full, remove it
      if (now - bucket.lastRefill > expireTime && bucket.tokens >= bucket.capacity) {
        this.buckets.delete(key);
      }
    }
  }

  /**
   * Destroy the store and clean up resources
   */
  destroy(): void {
    this.cleanup();
  }
}

/**
 * Redis store using token bucket algorithm
 */
export class RedisTokenBucketStore {
  private prefix: string;
  private client: any;

  constructor(redisClient: any, prefix: string = 'rate:') {
    this.client = redisClient;
    this.prefix = prefix;
  }

  /**
   * Check if a request is allowed and consume a token if it is
   */
  async check(
    key: string,
    options: {
      capacity: number;
      refillRate: number;
      tier: RateLimitTier;
    }
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const bucketKey = `${this.prefix}${key}`;

    // Use Redis transaction to ensure atomicity
    const result = await this.client.eval(
      `
      local bucket = redis.call('HMGET', KEYS[1], 'tokens', 'lastRefill', 'capacity', 'refillRate', 'tierMultiplier')
      local tokens = tonumber(bucket[1]) or tonumber(ARGV[1])
      local lastRefill = tonumber(bucket[2]) or tonumber(ARGV[4])
      local capacity = tonumber(bucket[3]) or tonumber(ARGV[1])
      local refillRate = tonumber(bucket[4]) or tonumber(ARGV[2])
      local tierMultiplier = tonumber(bucket[5]) or tonumber(ARGV[3])

      -- Update capacity and refill rate if tier changed
      if tierMultiplier ~= tonumber(ARGV[3]) then
        local newCapacity = tonumber(ARGV[1])
        if capacity > 0 then
          tokens = (tokens / capacity) * newCapacity
        else
          tokens = newCapacity
        end
        capacity = newCapacity
        refillRate = tonumber(ARGV[2])
        tierMultiplier = tonumber(ARGV[3])
      end

      -- Refill tokens based on time elapsed
      local now = tonumber(ARGV[4])
      local elapsed = now - lastRefill
      if elapsed > 0 then
        local tokensToAdd = elapsed * refillRate
        tokens = math.min(capacity, tokens + tokensToAdd)
        lastRefill = now
      end

      -- Check if request is allowed
      local allowed = 0
      if tokens >= 1 then
        tokens = tokens - 1
        allowed = 1
      end

      -- Calculate reset time
      local tokensNeeded = capacity - tokens
      local resetTime = now + math.ceil(tokensNeeded / refillRate)

      -- Save the updated bucket
      redis.call('HMSET', KEYS[1],
        'tokens', tokens,
        'lastRefill', lastRefill,
        'capacity', capacity,
        'refillRate', refillRate,
        'tierMultiplier', tierMultiplier
      )

      -- Set expiration (1 hour from last use)
      redis.call('EXPIRE', KEYS[1], 3600)

      return {allowed, tokens, capacity, resetTime, tierMultiplier}
    `,
      1,
      bucketKey,
      options.capacity,
      options.refillRate,
      options.tier.multiplier,
      now
    );

    // Parse result
    const [allowed, remaining, limit, resetTime, tierMultiplier] = result;

    return {
      allowed: allowed === 1,
      remaining: Math.floor(remaining),
      limit: Math.floor(limit),
      resetTime,
      tier: {
        multiplier: tierMultiplier,
        name: options.tier.name
      }
    };
  }

  /**
   * Reset a bucket
   */
  async reset(key: string): Promise<void> {
    await this.client.del(`${this.prefix}${key}`);
  }
}

// Standard rate limit tiers
export const RateLimitTiers = {
  STANDARD: { multiplier: 1.0, name: 'standard' },
  PREMIUM: { multiplier: 2.0, name: 'premium' },
  BUSINESS: { multiplier: 5.0, name: 'business' },
  UNLIMITED: { multiplier: 1000.0, name: 'unlimited' }
};

/**
 * Prepare rate limiter configuration with defaults
 */
function prepareRateLimiterConfig(
  options: RateLimiterOptions = {},
  store?: TokenBucketStore | RedisTokenBucketStore
): {
  headers: boolean;
  headerNames: {
    remaining: string;
    limit: string;
    reset: string;
    retryAfter: string;
  };
  burstSize: number;
  refillRate: number;
  keyGenerator: (req: IncomingMessage) => string;
  tierGenerator: (req: IncomingMessage) => Promise<RateLimitTier> | RateLimitTier;
  skip: (req: IncomingMessage) => boolean;
  bucketStore: TokenBucketStore | RedisTokenBucketStore;
  handler: (req: IncomingMessage, res: ServerResponse, next: () => Promise<void>) => Promise<void>;
} {
  const config = getDefaultOptions(options);
  const headerNames = getHeaderNames(options.headerNames || {});
  const handlers = getHandlers(options, config.statusCode, config.message, config.group);

  // Use provided store or create appropriate store
  const bucketStore = store || (config.distributed ? null : new TokenBucketStore());

  // If distributed is true but no store provided, throw error
  if (config.distributed && !store) {
    throw new Error('A store must be provided for distributed rate limiting');
  }

  return {
    headers: config.headers,
    headerNames,
    burstSize: config.burstSize,
    refillRate: config.refillRate,
    keyGenerator: handlers.keyGenerator,
    tierGenerator: handlers.tierGenerator,
    skip: handlers.skip,
    bucketStore: bucketStore!,
    handler: handlers.handler
  };
}

/**
 * Get default options for rate limiter
 */
function getDefaultOptions(options: RateLimiterOptions): {
  max: number;
  windowMs: number;
  headers: boolean;
  statusCode: number;
  message: string;
  group: string;
  distributed: boolean;
  burstSize: number;
  refillRate: number;
} {
  const max = options.max || 100;
  const windowMs = options.windowMs || 60000;

  return {
    max,
    windowMs,
    headers: options.headers !== false,
    statusCode: options.statusCode || 429,
    message: options.message || 'Too many requests, please try again later.',
    group: options.group || '',
    distributed: options.distributed || false,
    burstSize: options.burstSize || max,
    refillRate: options.refillRate || max / windowMs
  };
}

/**
 * Get header names for rate limiter
 */
function getHeaderNames(headerNames: RateLimiterOptions['headerNames'] = {}): {
  remaining: string;
  limit: string;
  reset: string;
  retryAfter: string;
} {
  return {
    remaining: headerNames.remaining || 'X-RateLimit-Remaining',
    limit: headerNames.limit || 'X-RateLimit-Limit',
    reset: headerNames.reset || 'X-RateLimit-Reset',
    retryAfter: headerNames.retryAfter || 'Retry-After'
  };
}

/**
 * Get handlers for rate limiter
 */
function getHandlers(
  options: RateLimiterOptions,
  statusCode: number,
  message: string,
  group: string
): {
  keyGenerator: (req: IncomingMessage) => string;
  tierGenerator: (req: IncomingMessage) => Promise<RateLimitTier> | RateLimitTier;
  skip: (req: IncomingMessage) => boolean;
  handler: (req: IncomingMessage, res: ServerResponse, next: () => Promise<void>) => Promise<void>;
} {
  // Set default key generator
  const keyGenerator =
    options.keyGenerator ||
    ((req: IncomingMessage): string => {
      return `${group ? `${group}:` : ''}${req.socket.remoteAddress || 'unknown'}`;
    });

  // Set default tier generator
  const tierGenerator = options.tierGenerator || ((): RateLimitTier => RateLimitTiers.STANDARD);

  // Set default skip function
  const skip = options.skip || ((): boolean => false);

  // Set default handler
  const handler =
    options.handler ||
    (async (
      req: IncomingMessage,
      _res: ServerResponse,
      _next: () => Promise<void>
    ): Promise<void> => {
      const retry =
        Math.ceil((req as any).rateLimit.resetTime / 1000) - Math.ceil(Date.now() / 1000);
      throw new HttpException(statusCode, message, {
        retryAfter: retry
      });
    });

  return {
    keyGenerator,
    tierGenerator,
    skip,
    handler
  };
}

/**
 * Create rate limiting middleware with token bucket algorithm
 * @param options Rate limiter options
 * @param store Rate limiter store
 */
export function createRateLimiterMiddleware(
  options: RateLimiterOptions = {},
  store?: TokenBucketStore | RedisTokenBucketStore
): MiddlewareHandler {
  const config = prepareRateLimiterConfig(options, store);

  // Return middleware
  return async (req: IncomingMessage, res: ServerResponse, next: () => Promise<void>) => {
    // Skip rate limiting if needed
    if (config.skip(req)) {
      return next();
    }

    try {
      // Generate key for this request
      const key = config.keyGenerator(req);

      // Get tier for this request
      const tier = await Promise.resolve(config.tierGenerator(req));

      // Apply tier multiplier to limits
      const tierMax = Math.ceil(config.burstSize * tier.multiplier);
      const tierRefillRate = config.refillRate * tier.multiplier;

      // Check rate limit
      const result = await config.bucketStore.check(key, {
        capacity: tierMax,
        // tierRefillRate is already tokens-per-millisecond (max / windowMs).
        // The previous "/ 1000" double-converted it, making refill 1000x too
        // slow — clients stayed locked out long past the configured window.
        refillRate: tierRefillRate,
        tier
      });

      // Store rate limit info on request
      (req as any).rateLimit = result;

      // Add headers if enabled
      if (config.headers) {
        res.setHeader(config.headerNames.remaining, result.remaining.toString());
        res.setHeader(config.headerNames.limit, result.limit.toString());
        res.setHeader(config.headerNames.reset, Math.ceil(result.resetTime / 1000).toString());

        // Add tier header
        res.setHeader('X-RateLimit-Tier', result.tier.name);
      }

      // If not allowed, handle rate limit exceeded
      if (!result.allowed) {
        if (config.headers) {
          // Add retry-after header
          const retryAfter = Math.ceil((result.resetTime - Date.now()) / 1000);
          res.setHeader(config.headerNames.retryAfter, retryAfter.toString());
        }

        return config.handler(req, res, next);
      }

      // Continue to next middleware
      await next();
    } catch (error) {
      // If the rate limiter fails, allow the request
      logger.error('Rate limiter error:', error);
      await next();
    }
  };
}

/**
 * Create a Redis store for distributed rate limiting
 * @param redisClient Redis client instance
 * @param prefix Key prefix
 */
export function createRedisStore(
  redisClient: any,
  prefix: string = 'rate:'
): RedisTokenBucketStore {
  return new RedisTokenBucketStore(redisClient, prefix);
}

/**
 * Create a rate limiter group for shared limits across endpoints
 */
export function createRateLimiterGroup(
  groupName: string,
  options: RateLimiterOptions = {},
  store?: TokenBucketStore | RedisTokenBucketStore
): MiddlewareHandler {
  return createRateLimiterMiddleware(
    {
      ...options,
      group: groupName
    },
    store
  );
}
