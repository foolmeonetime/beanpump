// lib/middleware/error-handler.ts
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
  constructor(message: string = 'Rate limit exceeded') {
    super(message, 'RATE_LIMIT_ERROR', 429);
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
 * Rate limiting middleware (simple in-memory implementation)
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

export function withRateLimit(
  maxRequests: number = 100,
  windowMs: number = 60000 // 1 minute
) {
  return function<T = any>(
    handler: (req: NextRequest, context?: any) => Promise<T>
  ) {
    return async (req: NextRequest, context?: any): Promise<T> => {
      // Get client IP with fallback
      const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || 
                       req.headers.get('x-real-ip') || 
                       'unknown';
      const now = Date.now();
      const windowStart = now - windowMs;
      
      // Clean up old entries
      for (const [key, value] of rateLimitStore.entries()) {
        if (value.resetTime < now) {
          rateLimitStore.delete(key);
        }
      }
      
      // Check current rate limit
      const current = rateLimitStore.get(clientIp);
      
      if (!current || current.resetTime < now) {
        // First request in window or window has reset
        rateLimitStore.set(clientIp, {
          count: 1,
          resetTime: now + windowMs,
        });
      } else {
        // Increment count
        current.count++;
        
        if (current.count > maxRequests) {
          throw new RateLimitError(
            `Rate limit exceeded. Maximum ${maxRequests} requests per ${windowMs}ms.`
          );
        }
      }
      
      return handler(req, context);
    };
  };
}