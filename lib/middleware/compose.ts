// lib/middleware/compose.ts
import { NextRequest, NextResponse } from 'next/server';
import { Pool, PoolClient } from 'pg';
import { z } from 'zod';
import { 
  withErrorHandler, 
  withRequestLogging, 
  withRateLimit,
  handleValidationError,
  handleDatabaseError,
  ApiError 
} from './error-handler';

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export interface ApiRouteContext {
  req: NextRequest;
  db: PoolClient;
  searchParams?: URLSearchParams;
  body?: any;
  user?: any; // For authentication
}

export interface ApiRouteOptions {
  validateQuery?: z.ZodSchema;
  validateBody?: z.ZodSchema;
  requireAuth?: boolean;
  rateLimit?: {
    maxRequests: number;
    windowMs: number;
  };
}

/**
 * Main API route creator with middleware composition
 */
export function createApiRoute<T = any>(
  handler: (context: ApiRouteContext) => Promise<T>,
  options: ApiRouteOptions = {}
) {
  return async (req: NextRequest, routeContext?: any): Promise<NextResponse> => {
    let dbClient: PoolClient | null = null;

    // Create the main handler that processes the request
    const processRequest = async (): Promise<NextResponse> => {
      try {
        // Get database connection
        dbClient = await pool.connect();
        
        // Parse search params
        const url = new URL(req.url);
        const searchParams = url.searchParams;

        // Parse and validate query parameters
        let validatedQuery = {};
        if (options.validateQuery) {
          try {
            const queryObject = Object.fromEntries(searchParams.entries());
            validatedQuery = options.validateQuery.parse(queryObject);
          } catch (error) {
            handleValidationError(error);
          }
        }

        // Parse and validate request body
        let validatedBody = {};
        if (options.validateBody && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
          try {
            const body = await req.json();
            validatedBody = options.validateBody.parse(body);
          } catch (error) {
            if (error instanceof SyntaxError) {
              throw new ApiError('Invalid JSON in request body', 'INVALID_JSON', 400);
            }
            handleValidationError(error);
          }
        }

        // TODO: Authentication middleware
        let user = null;
        if (options.requireAuth) {
          // Implement authentication logic here
          // For now, we'll skip this
        }

        // Create context
        const context: ApiRouteContext = {
          req,
          db: dbClient,
          searchParams,
          body: validatedBody,
          user,
        };

        // Call the actual handler
        const result = await handler(context);
        
        // Convert result to NextResponse if it isn't already
        return result instanceof NextResponse ? result : NextResponse.json(result);

      } catch (error: any) {
        console.error('API route error:', error);
        
        // Handle database errors
        if (error.code && typeof error.code === 'string') {
          handleDatabaseError(error);
        }
        
        throw error;
      } finally {
        // Always release the database connection
        if (dbClient) {
          dbClient.release();
        }
      }
    };

    // Create a wrapped handler for middleware that expects NextRequest signature
    const middlewareHandler = async (req: NextRequest, context?: any): Promise<NextResponse> => {
      return await processRequest();
    };

    let composedHandler = middlewareHandler;

    // Apply rate limiting if specified
    if (options.rateLimit) {
      const rateLimitMiddleware = withRateLimit(
        options.rateLimit.maxRequests,
        options.rateLimit.windowMs
      );
      composedHandler = rateLimitMiddleware(composedHandler);
    }

    // Apply request logging
    composedHandler = withRequestLogging(composedHandler);

    // Apply error handling
    composedHandler = withErrorHandler(composedHandler);

    // Execute the composed handler
    return await composedHandler(req, routeContext);
  };
}

/**
 * Database health check utility
 */
export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  tablesExist: boolean;
  tableCount: number;
  error?: string;
}> {
  let client: PoolClient | null = null;
  
  try {
    client = await pool.connect();
    
    // Test basic connectivity
    const timeResult = await client.query('SELECT NOW() as current_time');
    
    // Check if takeovers table exists
    const tableResult = await client.query(`
      SELECT COUNT(*) as count
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'takeovers'
    `);
    
    const tablesExist = parseInt(tableResult.rows[0].count) > 0;
    
    // Get total table count
    const allTablesResult = await client.query(`
      SELECT COUNT(*) as count
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    
    const tableCount = parseInt(allTablesResult.rows[0].count);
    
    return {
      connected: true,
      tablesExist,
      tableCount,
    };
    
  } catch (error: any) {
    console.error('Database health check failed:', error);
    return {
      connected: false,
      tablesExist: false,
      tableCount: 0,
      error: error.message,
    };
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * Graceful database connection cleanup
 */
export async function closeDatabasePool(): Promise<void> {
  try {
    await pool.end();
    console.log('✅ Database pool closed gracefully');
  } catch (error) {
    console.error('❌ Error closing database pool:', error);
  }
}

/**
 * Database transaction wrapper
 */
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Utility to execute raw SQL queries safely
 */
export async function executeQuery<T = any>(
  query: string,
  params: any[] = []
): Promise<T[]> {
  const client = await pool.connect();
  
  try {
    const result = await client.query(query, params);
    return result.rows;
  } catch (error) {
    console.error('Query execution failed:', error);
    console.error('Query:', query);
    console.error('Params:', params);
    handleDatabaseError(error);
  } finally {
    client.release();
  }
}

/**
 * Middleware for CORS handling
 */
export function withCors(
  origins: string[] = ['*'],
  methods: string[] = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
) {
  return function<T = any>(
    handler: (req: NextRequest, context?: any) => Promise<T>
  ) {
    return async (req: NextRequest, context?: any): Promise<NextResponse> => {
      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        return new NextResponse(null, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': origins.includes('*') ? '*' : origins.join(', '),
            'Access-Control-Allow-Methods': methods.join(', '),
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
          },
        });
      }

      const result = await handler(req, context);
      
      if (result instanceof NextResponse) {
        // Add CORS headers to existing response
        result.headers.set('Access-Control-Allow-Origin', origins.includes('*') ? '*' : origins.join(', '));
        result.headers.set('Access-Control-Allow-Methods', methods.join(', '));
        return result;
      }

      // Create new response with CORS headers
      return NextResponse.json(result, {
        headers: {
          'Access-Control-Allow-Origin': origins.includes('*') ? '*' : origins.join(', '),
          'Access-Control-Allow-Methods': methods.join(', '),
        },
      });
    };
  };
}

/**
 * Middleware for basic authentication (placeholder)
 */
export function withAuth(
  requiredRole?: string
) {
  return function<T = any>(
    handler: (req: NextRequest, context?: any) => Promise<T>
  ) {
    return async (req: NextRequest, context?: any): Promise<T> => {
      // TODO: Implement actual authentication logic
      // For now, this is a placeholder
      
      const authHeader = req.headers.get('authorization');
      
      if (!authHeader) {
        throw new ApiError('Authentication required', 'AUTHENTICATION_REQUIRED', 401);
      }
      
      // Placeholder authentication logic
      // In a real implementation, you would validate the token here
      
      return handler(req, context);
    };
  };
}

/**
 * Utility to create a simple GET endpoint
 */
export function createGetEndpoint<T = any>(
  handler: (context: ApiRouteContext) => Promise<T>,
  options: Omit<ApiRouteOptions, 'validateBody'> = {}
) {
  return createApiRoute(handler, {
    ...options,
    validateBody: undefined, // GET requests don't have bodies
  });
}

/**
 * Utility to create a simple POST endpoint
 */
export function createPostEndpoint<T = any>(
  handler: (context: ApiRouteContext) => Promise<T>,
  options: ApiRouteOptions = {}
) {
  return createApiRoute(handler, options);
}

/**
 * Health check endpoint factory
 */
export function createHealthEndpoint() {
  return createGetEndpoint(async () => {
    const dbHealth = await checkDatabaseHealth();
    
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: dbHealth,
      environment: process.env.NODE_ENV,
    };
  });
}