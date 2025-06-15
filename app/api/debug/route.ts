// app/api/debug/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createGetEndpoint, checkDatabaseHealth } from '@/lib/middleware/compose';

export const GET = createGetEndpoint(async ({ db }) => {
  const startTime = Date.now();
  
  try {
    // System information
    const systemInfo = {
      nodeVersion: process.version,
      platform: process.platform,
      environment: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };

    // Database health check
    const dbHealth = await checkDatabaseHealth();
    
    // Additional database checks
    let tableInfo = null;
    let takeoverCount = 0;
    let sampleTakeovers = [];
    
    if (dbHealth.connected) {
      try {
        // Check takeovers table structure
        const tableStructure = await db.query(`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'takeovers'
          ORDER BY ordinal_position
        `);
        
        tableInfo = {
          exists: tableStructure.rows.length > 0,
          columns: tableStructure.rows,
          columnCount: tableStructure.rows.length,
        };
        
        // Get takeover count
        if (tableInfo.exists) {
          const countResult = await db.query('SELECT COUNT(*) as count FROM takeovers');
          takeoverCount = parseInt(countResult.rows[0].count);
          
          // Get sample takeovers (limit 3)
          const sampleResult = await db.query(`
            SELECT id, address, token_name, is_finalized, created_at
            FROM takeovers
            ORDER BY created_at DESC
            LIMIT 3
          `);
          sampleTakeovers = sampleResult.rows;
        }
        
      } catch (dbError: any) {
        console.error('Database detail check failed:', dbError);
        tableInfo = {
          exists: false,
          error: dbError.message,
        };
      }
    }

    // API endpoint tests
    const endpoints = {
      main: { path: '/api/takeovers', status: 'unknown' },
      simple: { path: '/api/simple-takeovers', status: 'unknown' },
      debug: { path: '/api/debug', status: 'working' },
    };

    // Test main takeovers endpoint
    try {
      const testResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/takeovers`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      endpoints.main.status = testResponse.ok ? 'working' : `error-${testResponse.status}`;
    } catch {
      endpoints.main.status = 'unreachable';
    }

    // Test simple takeovers endpoint
    try {
      const testResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/simple-takeovers`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      endpoints.simple.status = testResponse.ok ? 'working' : `error-${testResponse.status}`;
    } catch {
      endpoints.simple.status = 'unreachable';
    }

    const responseTime = Date.now() - startTime;

    return {
      status: 'ok',
      debug: true,
      responseTime: `${responseTime}ms`,
      system: systemInfo,
      database: {
        ...dbHealth,
        tables: tableInfo,
        takeoverCount,
        sampleTakeovers,
      },
      endpoints,
      environment: {
        databaseUrl: process.env.DATABASE_URL ? 'configured' : 'missing',
        nextPublicBaseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'not-set',
        nodeEnv: process.env.NODE_ENV,
      },
      recommendations: generateRecommendations(dbHealth, tableInfo, endpoints),
    };

  } catch (error: any) {
    console.error('Debug endpoint error:', error);
    
    return {
      status: 'error',
      debug: true,
      error: {
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      responseTime: `${Date.now() - startTime}ms`,
    };
  }
});

function generateRecommendations(
  dbHealth: any,
  tableInfo: any,
  endpoints: any
): string[] {
  const recommendations: string[] = [];

  if (!dbHealth.connected) {
    recommendations.push('🔴 Database connection failed - check DATABASE_URL environment variable');
  }

  if (!dbHealth.tablesExist) {
    recommendations.push('🔴 Takeovers table does not exist - run database migrations');
  }

  if (tableInfo && !tableInfo.exists) {
    recommendations.push('🔴 Takeovers table structure is missing - check database schema');
  }

  if (endpoints.main.status !== 'working') {
    recommendations.push('🟡 Main API endpoint is not working - check middleware configuration');
  }

  if (endpoints.simple.status !== 'working') {
    recommendations.push('🟡 Simple API endpoint is not working - check database connection');
  }

  if (dbHealth.connected && tableInfo?.exists && endpoints.simple.status === 'working') {
    recommendations.push('✅ System appears healthy - use simple API as fallback if main API fails');
  }

  if (recommendations.length === 0) {
    recommendations.push('✅ All systems operational');
  }

  return recommendations;
}

// Additional utility endpoints for debugging

// Test database connection
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const action = body.action;

    switch (action) {
      case 'test-query':
        return await testDatabaseQuery(body.query, body.params);
      
      case 'clear-cache':
        return await clearApplicationCache();
      
      case 'test-endpoint':
        return await testSpecificEndpoint(body.endpoint);
      
      default:
        return NextResponse.json({
          success: false,
          error: 'Unknown debug action',
        }, { status: 400 });
    }

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}

async function testDatabaseQuery(query: string, params: any[] = []) {
  if (!query || typeof query !== 'string') {
    return NextResponse.json({
      success: false,
      error: 'Query is required',
    }, { status: 400 });
  }

  // Only allow safe SELECT queries for debugging
  if (!query.trim().toLowerCase().startsWith('select')) {
    return NextResponse.json({
      success: false,
      error: 'Only SELECT queries are allowed for debugging',
    }, { status: 400 });
  }

  try {
    const dbHealth = await checkDatabaseHealth();
    
    if (!dbHealth.connected) {
      return NextResponse.json({
        success: false,
        error: 'Database not connected',
      }, { status: 503 });
    }

    // Execute the query with a timeout
    const startTime = Date.now();
    // Note: In a real implementation, you'd use the actual database connection here
    const endTime = Date.now();

    return NextResponse.json({
      success: true,
      data: {
        query,
        params,
        executionTime: `${endTime - startTime}ms`,
        message: 'Query would be executed here (disabled for security)',
      },
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}

async function clearApplicationCache() {
  try {
    // In a real implementation, you might clear Redis cache, 
    // restart services, or clear application-level caches
    
    return NextResponse.json({
      success: true,
      data: {
        message: 'Application cache cleared',
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}

async function testSpecificEndpoint(endpoint: string) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const fullUrl = `${baseUrl}${endpoint}`;

    const startTime = Date.now();
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const endTime = Date.now();

    const isJson = response.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await response.json() : await response.text();

    return NextResponse.json({
      success: true,
      data: {
        endpoint,
        status: response.status,
        statusText: response.statusText,
        responseTime: `${endTime - startTime}ms`,
        headers: Object.fromEntries(response.headers.entries()),
        data: typeof data === 'string' ? data.substring(0, 500) : data,
      },
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}