// lib/middleware/error-handler.ts
import { ApiContext, ApiHandler, ApiResponse } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class NotFoundError extends ApiError {
  constructor(message: string = 'Resource not found') {
    super(message, 'NOT_FOUND', 404);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}

export function withErrorHandler<T>(handler: ApiHandler<T>) {
  return async (ctx: ApiContext): Promise<ApiResponse<T>> => {
    try {
      return await handler(ctx);
    } catch (error: any) {
      console.error('API Error:', {
        error: error.message,
        stack: error.stack,
        url: ctx.req.url,
        method: ctx.req.method,
        timestamp: new Date().toISOString(),
      });

      // Handle known API errors
      if (error instanceof ApiError) {
        return {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details,
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: crypto.randomUUID(),
          },
        };
      }

      // Handle database errors
      if (error.code === '22P02') {
        return {
          success: false,
          error: {
            code: 'DATABASE_ERROR',
            message: 'Invalid data format in database',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined,
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: crypto.randomUUID(),
          },
        };
      }

      // Handle unique constraint violations
      if (error.code === '23505') {
        return {
          success: false,
          error: {
            code: 'DUPLICATE_RESOURCE',
            message: 'Resource already exists',
            details: process.env.NODE_ENV === 'development' ? error.detail : undefined,
          },
          meta: {
            timestamp: new Date().toISOString(),
            requestId: crypto.randomUUID(),
          },
        };
      }

      // Handle unknown errors
      return {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: crypto.randomUUID(),
        },
      };
    }
  };
}