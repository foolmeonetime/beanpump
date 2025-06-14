// lib/middleware/validation.ts
import { z } from 'zod';
import { ApiContext, ApiHandler, ApiResponse } from './types';

export function withValidation<T>(
  schema: { body?: z.ZodSchema; query?: z.ZodSchema },
  handler: ApiHandler<T>
) {
  return async (ctx: ApiContext): Promise<ApiResponse<T>> => {
    try {
      // Validate request body
      if (schema.body && ctx.body) {
        const validationResult = schema.body.safeParse(ctx.body);
        if (!validationResult.success) {
          return {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid request body',
              details: validationResult.error.flatten(),
            },
            meta: {
              timestamp: new Date().toISOString(),
              requestId: crypto.randomUUID(),
            },
          };
        }
        ctx.body = validationResult.data;
      }

      // Validate query parameters
      if (schema.query && ctx.searchParams) {
        const queryObject = Object.fromEntries(ctx.searchParams.entries());
        const validationResult = schema.query.safeParse(queryObject);
        if (!validationResult.success) {
          return {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Invalid query parameters',
              details: validationResult.error.flatten(),
            },
            meta: {
              timestamp: new Date().toISOString(),
              requestId: crypto.randomUUID(),
            },
          };
        }
      }

      return await handler(ctx);
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message || 'Validation failed',
        },
        meta: {
          timestamp: new Date().toISOString(),
          requestId: crypto.randomUUID(),
        },
      };
    }
  };
}