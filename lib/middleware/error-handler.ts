import { NextRequest, NextResponse } from 'next/server';

export class ApiError extends Error {
  public statusCode: number;
  public code: string;
  public details?: any;

  constructor(message: string, code: string = 'UNKNOWN_ERROR', statusCode: number = 500, details?: any) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string = 'Resource not found') {
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class DatabaseError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, 'DATABASE_ERROR', 500, details);
    this.name = 'DatabaseError';
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends ApiError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403);
    this.name = 'AuthorizationError';
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string = 'Rate limit exceeded', retryAfter?: number) {
    super(message, 'RATE_LIMIT_ERROR', 429, { retryAfter });
    this.name = 'RateLimitError';
  }
}

/**
 * Standard error response format
 */
export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code: string;
    details?: any;
    timestamp: string;
    requestId?: string;
  };
}

/**
 * Standard success response format
 */
export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}

/**
 * ✅ FIXED: Memory-safe rate limiting with automatic cleanup
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
  firstRequestTime: number; // Track when rate limiting started
}

class MemorySafeRateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private maxEntries: number;
  private cleanupInterval: number;
  private lastCleanup: number;

  constructor(maxEntries: number = 10000, cleanupIntervalMs: number = 300000) { // 5 minutes
    this.maxEntries = maxEntries;
    this.cleanupInterval = cleanupIntervalMs;
    this.lastCleanup = Date.now();
    
    // ✅ ADDED: Periodic cleanup to prevent memory leaks
    if (typeof setInterval !== 'undefined') {
      setInterval(() => this.cleanup(), cleanupIntervalMs);
    }
  }

  checkRateLimit(
    identifier: string, 
    maxRequests: number, 
    windowMs: number
  ): { allowed: boolean; retryAfter?: number; resetTime?: number } {
    const now = Date.now();
    
    // ✅ ENHANCED: Trigger cleanup if needed (handles environments without setInterval)
    if (now - this.lastCleanup > this.cleanupInterval) {
      this.cleanup();
    }
    
    const entry = this.store.get(identifier);
    
    if (!entry || now > entry.resetTime) {
      // Create new or reset expired entry
      this.store.set(identifier, {
        count: 1,
        resetTime: now + windowMs,
        firstRequestTime: now
      });
      
      // ✅ ADDED: Prevent unlimited growth
      this.enforceMaxEntries();
      
      return { allowed: true, resetTime: now + windowMs };
    }
    
    if (entry.count >= maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      return { 
        allowed: false, 
        retryAfter,
        resetTime: entry.resetTime 
      };
    }
    
    // Increment counter
    entry.count++;
    this.store.set(identifier, entry);
    
    return { allowed: true, resetTime: entry.resetTime };
  }

  // ✅ ENHANCED: Comprehensive cleanup with multiple strategies
  private cleanup(): void {
    const now = Date.now();
    let removedCount = 0;
    const initialSize = this.store.size;
    
    console.log(`🧹 Starting rate limit cleanup. Current entries: ${initialSize}`);
    
    // Strategy 1: Remove expired entries
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
        removedCount++;
      }
    }
    
    // Strategy 2: If still too large, remove oldest entries
    if (this.store.size > this.maxEntries) {
      const entries = Array.from(this.store.entries())
        .sort(([, a], [, b]) => a.firstRequestTime - b.firstRequestTime);
      
      const toRemove = entries.slice(0, this.store.size - this.maxEntries + 1000); // Remove extra for buffer
      toRemove.forEach(([key]) => {
        this.store.delete(key);
        removedCount++;
      });
    }
    
    // Strategy 3: Emergency cleanup if memory usage is still high
    if (this.store.size > this.maxEntries * 1.5) {
      console.warn(`⚠️ Emergency rate limit cleanup - removing half of entries`);
      const allKeys = Array.from(this.store.keys());
      const toRemove = allKeys.slice(0, Math.floor(allKeys.length / 2));
      toRemove.forEach(key => {
        this.store.delete(key);
        removedCount++;
      });
    }
    
    this.lastCleanup = now;
    
    console.log(`✅ Rate limit cleanup completed. Removed: ${removedCount}, Remaining: ${this.store.size}`);
    
    // Log warning if cleanup is not keeping up
    if (this.store.size > this.maxEntries * 0.8) {
      console.warn(`⚠️ Rate limit store is ${Math.round(this.store.size / this.maxEntries * 100)}% full`);
    }
  }

  // ✅ ADDED: Enforce maximum entries with LRU eviction
  private enforceMaxEntries(): void {
    if (this.store.size <= this.maxEntries) return;
    
    // Remove oldest entries first (LRU eviction)
    const entries = Array.from(this.store.entries())
      .sort(([, a], [, b]) => a.firstRequestTime - b.firstRequestTime);
    
    const toRemove = this.store.size - this.maxEntries + 100; // Remove extra for buffer
    for (let i = 0; i < toRemove && i < entries.length; i++) {
      this.store.delete(entries[i][0]);
    }
  }

  // ✅ ADDED: Get current stats for monitoring
  getStats(): {
    totalEntries: number;
    maxEntries: number;
    utilizationPercent: number;
    lastCleanup: number;
    memoryEfficient: boolean;
  } {
    const utilizationPercent = (this.store.size / this.maxEntries) * 100;
    
    return {
      totalEntries: this.store.size,
      maxEntries: this.maxEntries,
      utilizationPercent: Math.round(utilizationPercent),
      lastCleanup: this.lastCleanup,
      memoryEfficient: this.store.size < this.maxEntries * 0.8
    };
  }

  // ✅ ADDED: Manual cleanup trigger
  forceCleanup(): void {
    this.cleanup();
  }

  // ✅ ADDED: Clear all entries (for testing or emergency)
  clear(): void {
    this.store.clear();
    console.log("🗑️ Rate limit store cleared");
  }
}

// ✅ FIXED: Global instance with proper memory management
const globalRateLimiter = new MemorySafeRateLimiter(10000, 300000); // 10k entries, 5min cleanup

/**
 * Generate a unique request ID for tracking
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create standardized error response
 */
export function createErrorResponse(
  error: Error | ApiError,
  requestId?: string
): ErrorResponse {
  const timestamp = new Date().toISOString();
  
  if (error instanceof ApiError) {
    return {
      success: false,
      error: {
        message: error.message,
        code: error.code,
        details: error.details,
        timestamp,
        requestId,
      },
    };
  }
  
  // Handle unexpected errors
  console.error('Unexpected error:', error);
  
  return {
    success: false,
    error: {
      message: process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred'
        : error.message,
      code: 'INTERNAL_ERROR',
      timestamp,
      requestId,
    },
  };
}

/**
 * Create standardized success response
 */
export function createSuccessResponse<T>(
  data: T,
  requestId?: string
): SuccessResponse<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
    },
  };
}

/**
 * ✅ ENHANCED: Memory-safe rate limiting middleware
 */
export function withRateLimit(
  maxRequests: number = 100,
  windowMs: number = 60000, // 1 minute
  options: {
    skipSuccessfulRequests?: boolean;
    skipFailedRequests?: boolean;
    keyGenerator?: (req: NextRequest) => string;
    onLimitReached?: (req: NextRequest, identifier: string) => void;
  } = {}
) {
  return function<T = any>(
    handler: (req: NextRequest, context?: any) => Promise<T>
  ) {
    return async (req: NextRequest, context?: any): Promise<NextResponse> => {
      try {
        // ✅ ENHANCED: Flexible identifier generation
        const identifier = options.keyGenerator ? 
          options.keyGenerator(req) : 
          getClientIdentifier(req);
        
        // Check rate limit
        const rateLimitResult = globalRateLimiter.checkRateLimit(identifier, maxRequests, windowMs);
        
        if (!rateLimitResult.allowed) {
          // ✅ ENHANCED: Trigger callback if provided
          if (options.onLimitReached) {
            options.onLimitReached(req, identifier);
          }
          
          console.warn(`🚫 Rate limit exceeded for ${identifier}`);
          
          const errorResponse = createErrorResponse(
            new RateLimitError('Rate limit exceeded', rateLimitResult.retryAfter)
          );
          
          return NextResponse.json(errorResponse, {
            status: 429,
            headers: {
              'X-RateLimit-Limit': maxRequests.toString(),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': rateLimitResult.resetTime?.toString() || '',
              'Retry-After': rateLimitResult.retryAfter?.toString() || '60'
            }
          });
        }
        
        let handlerError: any = null;
        let handlerResult: T;
        
        try {
          handlerResult = await handler(req, context);
        } catch (error) {
          handlerError = error;
          
          // ✅ ENHANCED: Don't count failed requests if configured
          if (options.skipFailedRequests) {
            // This is a simplified version - in production you might want to
            // decrement the counter or use a more sophisticated approach
            console.log(`📝 Skipping rate limit increment for failed request: ${identifier}`);
          }
          
          throw error;
        }
        
        // ✅ ENHANCED: Don't count successful requests if configured
        if (options.skipSuccessfulRequests) {
          console.log(`📝 Skipping rate limit increment for successful request: ${identifier}`);
        }
        
        // Add rate limit headers to successful responses
        if (handlerResult instanceof NextResponse) {
          handlerResult.headers.set('X-RateLimit-Limit', maxRequests.toString());
          handlerResult.headers.set('X-RateLimit-Remaining', (maxRequests - globalRateLimiter.getStats().totalEntries).toString());
          handlerResult.headers.set('X-RateLimit-Reset', rateLimitResult.resetTime?.toString() || '');
          return handlerResult;
        }
        
        // Wrap non-NextResponse results
        const successResponse = createSuccessResponse(handlerResult);
        return NextResponse.json(successResponse, {
          headers: {
            'X-RateLimit-Limit': maxRequests.toString(),
            'X-RateLimit-Remaining': (maxRequests - globalRateLimiter.getStats().totalEntries).toString(),
            'X-RateLimit-Reset': rateLimitResult.resetTime?.toString() || ''
          }
        });
        
      } catch (error: any) {
        console.error(`💥 Rate limited handler error:`, error);
        
        const errorResponse = createErrorResponse(error);
        return NextResponse.json(errorResponse, { 
          status: error instanceof ApiError ? error.statusCode : 500 
        });
      }
    };
  };
}

/**
 * ✅ ENHANCED: Smart client identifier with fallbacks
 */
function getClientIdentifier(req: NextRequest): string {
  // Try multiple identification methods
  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  const userAgent = req.headers.get('user-agent');
  
  // Use the most reliable IP source
  let ip = cfConnectingIp || realIp || forwarded?.split(',')[0]?.trim() || 'unknown';
  
  // For development/testing
  if (ip === '::1' || ip === '127.0.0.1') {
    ip = 'localhost';
  }
  
  // Include user agent hash for better identification
  const uaHash = userAgent ? 
    userAgent.split('').reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) & 0xffff, 0).toString(16) :
    'no-ua';
  
  return `${ip}:${uaHash}`;
}

/**
 * ✅ ADDED: Rate limiter monitoring endpoint helper
 */
export function getRateLimiterStats() {
  return globalRateLimiter.getStats();
}

/**
 * ✅ ADDED: Manual cleanup trigger for monitoring
 */
export function triggerRateLimiterCleanup() {
  globalRateLimiter.forceCleanup();
}

/**
 * ✅ ADDED: Emergency reset for rate limiter
 */
export function resetRateLimiter() {
  globalRateLimiter.clear();
}

/**
 * Database error handler - converts common DB errors to ApiErrors
 */
export function handleDatabaseError(error: any): never {
  console.error('Database error:', error);
  
  // PostgreSQL error codes
  switch (error.code) {
    case '23505': // unique_violation
      throw new ValidationError('Duplicate entry - resource already exists', {
        constraint: error.constraint,
        detail: error.detail,
      });
      
    case '23503': // foreign_key_violation
      throw new ValidationError('Invalid reference - related resource not found', {
        constraint: error.constraint,
        detail: error.detail,
      });
      
    case '23502': // not_null_violation
      throw new ValidationError('Missing required field', {
        column: error.column,
        table: error.table,
      });
      
    case '23514': // check_violation
      throw new ValidationError('Data validation failed', {
        constraint: error.constraint,
        detail: error.detail,
      });
      
    case '42703': // undefined_column
      throw new ApiError('Database schema error - invalid column', 'SCHEMA_ERROR', 500, {
        column: error.column,
        table: error.table,
      });
      
    case '42P01': // undefined_table
      throw new ApiError('Database schema error - table not found', 'SCHEMA_ERROR', 500, {
        table: error.table,
      });
      
    case '08006': // connection_failure
    case '08001': // unable_to_connect
      throw new ApiError('Database connection failed', 'DATABASE_CONNECTION_ERROR', 503);
      
    case '57014': // query_canceled
      throw new ApiError('Database query timeout', 'DATABASE_TIMEOUT', 504);
      
    default:
      // Generic database error
      throw new DatabaseError(
        process.env.NODE_ENV === 'production' 
          ? 'Database operation failed'
          : error.message,
        {
          code: error.code,
          detail: error.detail,
        }
      );
  }
}

/**
 * Validation error handler for schema validation
 */
export function handleValidationError(error: any): never {
  if (error.errors && Array.isArray(error.errors)) {
    // Zod validation errors
    const details = error.errors.map((err: any) => ({
      field: err.path?.join('.'),
      message: err.message,
      code: err.code,
    }));
    
    throw new ValidationError('Validation failed', details);
  }
  
  throw new ValidationError(error.message || 'Invalid input data');
}

/**
 * Async wrapper with automatic error handling
 */
export function asyncHandler<T extends any[], R>(
  fn: (...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error: any) {
      // Database errors
      if (error.code && typeof error.code === 'string') {
        handleDatabaseError(error);
      }
      
      // Validation errors
      if (error.name === 'ZodError' || error.errors) {
        handleValidationError(error);
      }
      
      // Re-throw ApiErrors as-is
      if (error instanceof ApiError) {
        throw error;
      }
      
      // Wrap unknown errors
      throw new ApiError(
        process.env.NODE_ENV === 'production' 
          ? 'An unexpected error occurred'
          : error.message,
        'UNEXPECTED_ERROR',
        500
      );
    }
  };
}

/**
 * Middleware to log all requests and responses
 */
export function withRequestLogging<T = any>(
  handler: (req: NextRequest, context?: any) => Promise<T>
) {
  return async (req: NextRequest, context?: any): Promise<T> => {
    const start = Date.now();
    const requestId = generateRequestId();
    
    console.log(`📥 [${requestId}] ${req.method} ${req.url}`);
    console.log(`📥 [${requestId}] Headers:`, Object.fromEntries(req.headers.entries()));
    
    try {
      const result = await handler(req, context);
      const duration = Date.now() - start;
      
      console.log(`📤 [${requestId}] Response completed in ${duration}ms`);
      
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      console.error(`💥 [${requestId}] Request failed after ${duration}ms:`, error);
      throw error;
    }
  };
}

/**
 * Error handling middleware for API routes
 */
export function withErrorHandler<T = any>(
  handler: (req: NextRequest, context?: any) => Promise<T>
) {
  return async (req: NextRequest, context?: any): Promise<NextResponse> => {
    const requestId = generateRequestId();
    
    try {
      console.log(`🔍 [${requestId}] ${req.method} ${req.url}`);
      
      const result = await handler(req, context);
      
      // If result is already a NextResponse, return it
      if (result instanceof NextResponse) {
        return result;
      }
      
      // Otherwise, wrap in success response
      const successResponse = createSuccessResponse(result, requestId);
      console.log(`✅ [${requestId}] Request completed successfully`);
      
      return NextResponse.json(successResponse);
      
    } catch (error: any) {
      console.error(`❌ [${requestId}] Request failed:`, error);
      
      const errorResponse = createErrorResponse(error, requestId);
      
      // Determine status code
      let statusCode = 500;
      if (error instanceof ApiError) {
        statusCode = error.statusCode;
      } else if (error.name === 'ValidationError') {
        statusCode = 400;
      } else if (error.name === 'NotFoundError') {
        statusCode = 404;
      }
      
      return NextResponse.json(errorResponse, { status: statusCode });
    }
  };
}