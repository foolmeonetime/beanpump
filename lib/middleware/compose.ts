// lib/middleware/compose.ts
import { NextRequest } from 'next/server';
import { ApiContext, ApiHandler, ApiResponse, MiddlewareConfig } from './types';
import { withDatabase } from './database';
import { withValidation } from './validation';
import { withErrorHandler } from './error-handler';
import { createApiResponse } from './response';

export function createApiRoute<T>(
  handler: ApiHandler<T>,
  config: MiddlewareConfig = {}
) {
  return async (req: NextRequest): Promise<Response> => {
    // Create base context
    const url = new URL(req.url);
    let body;
    
    try {
      if (req.method !== 'GET' && req.headers.get('content-type')?.includes('application/json')) {
        body = await req.json();
      }
    } catch {
      // Ignore JSON parsing errors, will be handled by validation
    }

    const baseContext = {
      req,
      body,
      searchParams: url.searchParams,
    };

    // Build middleware chain
    let composedHandler = handler;

    // Add validation middleware if schemas provided
    if (config.validateBody || config.validateQuery) {
      composedHandler = withValidation(
        {
          body: config.validateBody,
          query: config.validateQuery,
        },
        composedHandler
      );
    }

    // Add database middleware
    composedHandler = withDatabase(composedHandler);

    // Add error handling (always last)
    composedHandler = withErrorHandler(composedHandler);

    // Execute the composed handler
    const result = await composedHandler(baseContext as ApiContext);
    
    return createApiResponse(result);
  };
}