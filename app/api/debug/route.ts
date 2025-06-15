// app/api/debug/route.ts - Complete debug endpoint
import { NextRequest, NextResponse } from 'next/server';
import { createGetEndpoint, checkDatabaseHealth } from '@/lib/middleware/compose';
import { TakeoverService } from '@/lib/services/takeover-service';

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
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    // Database health check
    console.log('🔍 Running database health check...');
    const dbHealth = await checkDatabaseHealth();
    
    // Additional database checks
    let tableInfo = null;
    let takeoverCount = 0;
    let sampleTakeovers = [];
    let indexInfo = [];
    let schemaInfo = null;
    
    if (dbHealth.connected) {
      try {
        // Check takeovers table structure
        console.log('🔍 Checking table structure...');
        const tableStructure = await db.query(`
          SELECT 
            column_name, 
            data_type, 
            is_nullable, 
            column_default,
            character_maximum_length
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'takeovers'
          ORDER BY ordinal_position
        `);
        
        tableInfo = {
          exists: tableStructure.rows.length > 0,
          columns: tableStructure.rows,
          columnCount: tableStructure.rows.length,
        };
        
        // Get index information
        if (tableInfo.exists) {
          console.log('🔍 Checking indexes...');
          const indexResult = await db.query(`
            SELECT 
              indexname, 
              indexdef,
              tablename
            FROM pg_indexes 
            WHERE tablename = 'takeovers'
            ORDER BY indexname
          `);
          indexInfo = indexResult.rows;
        }
        
        // Get takeover count and sample data
        if (tableInfo.exists) {
          console.log('🔍 Getting takeover count...');
          const countResult = await db.query('SELECT COUNT(*) as count FROM takeovers');
          takeoverCount = parseInt(countResult.rows[0].count);
          
          // Get sample takeovers (limit 3)
          console.log('🔍 Getting sample takeovers...');
          const sampleResult = await db.query(`
            SELECT 
              id, 
              address, 
              token_name, 
              min_amount, 
              total_contributed,
              is_finalized, 
              created_at,
              reward_rate_bp,
              calculated_min_amount
            FROM takeovers
            ORDER BY created_at DESC
            LIMIT 3
          `);
          
          sampleTakeovers = sampleResult.rows.map(row => ({
            ...row,
            // Convert bigint to string for JSON serialization
            min_amount: row.min_amount?.toString(),
            total_contributed: row.total_contributed?.toString(),
            calculated_min_amount: row.calculated_min_amount?.toString(),
          }));
        }

        // Get database schema information
        console.log('🔍 Getting schema info...');
        const schemaResult = await db.query(`
          SELECT 
            schemaname,
            tablename,
            tableowner,
            tablespace
          FROM pg_tables 
          WHERE schemaname = 'public'
          ORDER BY tablename
        `);
        
        schemaInfo = {
          tables: schemaResult.rows,
          tableCount: schemaResult.rows.length,
        };
        
      } catch (dbError: any) {
        console.error('Database detail check failed:', dbError);
        tableInfo = {
          exists: false,
          error: dbError.message,
        };
      }
    }

    // API endpoint tests
    console.log('🔍 Testing API endpoints...');
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const endpoints = {
      main: { path: '/api/takeovers', status: 'unknown', responseTime: 0, error: null },
      simple: { path: '/api/simple-takeovers', status: 'unknown', responseTime: 0, error: null },
      debug: { path: '/api/debug', status: 'working', responseTime: 0, error: null },
    };

    // Test main takeovers endpoint
    try {
      const testStart = Date.now();
      const testResponse = await fetch(`${baseUrl}/api/takeovers?limit=1`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const testEnd = Date.now();
      
      endpoints.main.responseTime = testEnd - testStart;
      endpoints.main.status = testResponse.ok ? 'working' : `error-${testResponse.status}`;
      
      if (!testResponse.ok) {
        const errorText = await testResponse.text();
        endpoints.main.error = errorText;
      }
    } catch (error: any) {
      endpoints.main.status = 'unreachable';
      endpoints.main.error = error.message;
    }

    // Test simple takeovers endpoint
    try {
      const testStart = Date.now();
      const testResponse = await fetch(`${baseUrl}/api/simple-takeovers?limit=1`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const testEnd = Date.now();
      
      endpoints.simple.responseTime = testEnd - testStart;
      endpoints.simple.status = testResponse.ok ? 'working' : `error-${testResponse.status}`;
      
      if (!testResponse.ok) {
        const errorText = await testResponse.text();
        endpoints.simple.error = errorText;
      }
    } catch (error: any) {
      endpoints.simple.status = 'unreachable';
      endpoints.simple.error = error.message;
    }

    // Get takeover statistics using service
    let stats = null;
    if (dbHealth.connected && tableInfo?.exists) {
      try {
        console.log('🔍 Getting takeover statistics...');
        stats = await TakeoverService.getTakeoverStats(db);
      } catch (statsError: any) {
        console.error('Failed to get stats:', statsError);
        stats = { error: statsError.message };
      }
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
        indexes: indexInfo,
        schema: schemaInfo,
        takeoverCount,
        sampleTakeovers,
      },
      statistics: stats,
      endpoints,
      environment: {
        databaseUrl: process.env.DATABASE_URL ? 'configured' : 'missing',
        nextPublicBaseUrl: process.env.NEXT_PUBLIC_BASE_URL || 'not-set',
        nodeEnv: process.env.NODE_ENV,
        port: process.env.PORT || '3000',
        vercelUrl: process.env.VERCEL_URL || 'not-set',
      },
      recommendations: generateRecommendations(dbHealth, tableInfo, endpoints, takeoverCount),
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
  endpoints: any,
  takeoverCount: number
): string[] {
  const recommendations: string[] = [];

  // Database recommendations
  if (!dbHealth.connected) {
    recommendations.push('🔴 Database connection failed - check DATABASE_URL environment variable');
    recommendations.push('🔧 Verify your database is running and accessible');
  } else {
    recommendations.push('✅ Database connection is working');
  }

  if (!dbHealth.tablesExist || !tableInfo?.exists) {
    recommendations.push('🔴 Takeovers table does not exist - run database migrations');
    recommendations.push('🔧 Execute the SQL schema files to create the required tables');
  } else {
    recommendations.push('✅ Takeovers table exists and is accessible');
  }

  // API endpoint recommendations
  if (endpoints.main.status !== 'working') {
    recommendations.push('🟡 Main API endpoint is not working - check middleware configuration');
    if (endpoints.main.error) {
      recommendations.push(`🔧 Main API error: ${endpoints.main.error}`);
    }
  } else {
    recommendations.push('✅ Main API endpoint is working');
  }

  if (endpoints.simple.status !== 'working') {
    recommendations.push('🟡 Simple API endpoint is not working - check database connection');
    if (endpoints.simple.error) {
      recommendations.push(`🔧 Simple API error: ${endpoints.simple.error}`);
    }
  } else {
    recommendations.push('✅ Simple API endpoint is working');
  }

  // Data recommendations
  if (takeoverCount === 0) {
    recommendations.push('🟡 No takeovers found in database - consider adding test data');
    recommendations.push('🔧 Use the provided INSERT statements to add sample takeovers');
  } else {
    recommendations.push(`✅ Found ${takeoverCount} takeover${takeoverCount === 1 ? '' : 's'} in database`);
  }

  // Performance recommendations
  if (endpoints.main.responseTime > 1000) {
    recommendations.push('🟡 Main API response time is slow - consider optimizing database queries');
  }

  if (endpoints.simple.responseTime > 1000) {
    recommendations.push('🟡 Simple API response time is slow - check database performance');
  }

  // Overall system health
  if (dbHealth.connected && tableInfo?.exists && endpoints.simple.status === 'working') {
    recommendations.push('✅ System appears healthy - ready for production use');
  }

  if (recommendations.filter(r => r.startsWith('🔴')).length === 0) {
    recommendations.push('🎉 All critical systems are operational');
  }

  return recommendations;
}

// Additional utility endpoints for debugging

// POST endpoint for advanced debugging operations
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
      
      case 'check-specific-takeover':
        return await checkSpecificTakeover(body.address);
      
      default:
        return NextResponse.json({
          success: false,
          error: 'Unknown debug action',
          availableActions: ['test-query', 'clear-cache', 'test-endpoint', 'check-specific-takeover'],
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

    return NextResponse.json({
      success: true,
      data: {
        query,
        params,
        message: 'Query validation passed (execution disabled for security)',
        note: 'To execute queries, use a direct database connection',
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
        note: 'This is a placeholder - implement actual cache clearing logic',
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

async function checkSpecificTakeover(address: string) {
  try {
    if (!address) {
      return NextResponse.json({
        success: false,
        error: 'Takeover address is required',
      }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    
    // Test multiple endpoints for the specific takeover
    const results = {
      filtered: null,
      simple: null,
      main: null,
    };

    // Test filtered endpoint
    try {
      const response = await fetch(`${baseUrl}/api/takeovers?address=${address}`);
      const data = await response.json();
      results.filtered = {
        status: response.status,
        success: data.success,
        found: data.data?.takeovers?.length > 0 || data.takeovers?.length > 0,
        data: data.data?.takeovers?.[0] || data.takeovers?.[0] || null,
      };
    } catch (error: any) {
      results.filtered = { error: error.message };
    }

    // Test simple endpoint
    try {
      const response = await fetch(`${baseUrl}/api/simple-takeovers?address=${address}`);
      const data = await response.json();
      results.simple = {
        status: response.status,
        success: data.success,
        found: data.takeovers?.length > 0,
        data: data.takeovers?.[0] || null,
      };
    } catch (error: any) {
      results.simple = { error: error.message };
    }

    // Test main endpoint (get all and filter)
    try {
      const response = await fetch(`${baseUrl}/api/takeovers`);
      const data = await response.json();
      const takeovers = data.data?.takeovers || data.takeovers || [];
      const found = takeovers.find((t: any) => t.address === address);
      results.main = {
        status: response.status,
        success: data.success,
        totalTakeovers: takeovers.length,
        found: !!found,
        data: found || null,
      };
    } catch (error: any) {
      results.main = { error: error.message };
    }

    return NextResponse.json({
      success: true,
      data: {
        address,
        results,
        recommendation: results.simple?.found 
          ? 'Takeover found via simple endpoint - use this as primary'
          : 'Takeover not found - check if it exists in database',
      },
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}