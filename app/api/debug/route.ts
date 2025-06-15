// app/api/debug/route.ts - Complete debug endpoint with fixed types
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { TakeoverService } from '@/lib/services/takeover-service';
import { processTakeoverCalculations } from '@/lib/utils/takeover-calculations';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Interface for API responses - fixes type assignment errors
interface ApiResponse<T = any> {
  status: number;
  success: boolean;
  found?: boolean;
  data?: T;
  error?: any;
  totalTakeovers?: number;
}

interface DebugResult {
  error?: string;
  [key: string]: any;
}

async function checkDatabaseHealth(): Promise<ApiResponse> {
  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT NOW()');
      return {
        status: 200,
        success: true,
        data: { connected: true, timestamp: new Date().toISOString() }
      };
    } finally {
      client.release();
    }
  } catch (error: any) {
    return {
      status: 500,
      success: false,
      error: error.message
    };
  }
}

async function testTakeoverEndpoint(address: string, baseUrl: string): Promise<ApiResponse> {
  try {
    const response = await fetch(`${baseUrl}/api/takeovers?address=${address}`);
    const data = await response.json();
    
    return {
      status: response.status,
      success: data.success || false,
      found: data.data?.takeovers?.length > 0 || false,
      data: data.data?.takeovers?.[0] || data.takeovers?.[0] || null,
    };
  } catch (error: any) {
    return {
      status: 500,
      success: false,
      error: error.message
    };
  }
}

async function testSimpleEndpoint(address: string, baseUrl: string): Promise<ApiResponse> {
  try {
    const response = await fetch(`${baseUrl}/api/simple-takeovers?address=${address}`);
    const data = await response.json();
    
    return {
      status: response.status,
      success: data.success || false,
      found: data.takeovers?.length > 0 || false,
      data: data.takeovers?.[0] || null,
    };
  } catch (error: any) {
    return {
      status: 500,
      success: false,
      error: error.message
    };
  }
}

async function testMainEndpoint(address: string, baseUrl: string): Promise<ApiResponse> {
  try {
    const response = await fetch(`${baseUrl}/api/takeovers`);
    const data = await response.json();
    const takeovers = data.data?.takeovers || data.takeovers || [];
    const found = takeovers.find((t: any) => t.address === address);
    
    return {
      status: response.status,
      success: data.success || false,
      totalTakeovers: takeovers.length,
      found: !!found,
      data: found || null,
    };
  } catch (error: any) {
    return {
      status: 500,
      success: false,
      error: error.message
    };
  }
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address');
  
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
    let tableInfo: any = null;
    let takeoverCount = 0;
    let sampleTakeovers: any[] = [];
    let indexInfo: any[] = [];
    let schemaInfo: any = null;
    
    if (dbHealth.success) {
      const client = await pool.connect();
      try {
        // Check takeovers table structure
        console.log('🔍 Checking table structure...');
        const tableStructure = await client.query(`
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
          columns: tableStructure.rows.length,
          columnDetails: tableStructure.rows
        };

        if (tableInfo.exists) {
          // Get takeover count
          const countResult = await client.query('SELECT COUNT(*) as count FROM takeovers');
          takeoverCount = parseInt(countResult.rows[0].count);

          // Get sample takeovers
          if (takeoverCount > 0) {
            const sampleResult = await client.query(`
              SELECT id, address, authority, token_name, total_contributed, 
                     min_amount, is_finalized, is_successful, created_at
              FROM takeovers 
              ORDER BY created_at DESC 
              LIMIT 3
            `);
            sampleTakeovers = sampleResult.rows;
          }

          // Check indexes
          const indexResult = await client.query(`
            SELECT indexname, indexdef 
            FROM pg_indexes 
            WHERE tablename = 'takeovers'
          `);
          indexInfo = indexResult.rows;
        }

        // Schema information
        const schemaResult = await client.query(`
          SELECT 
            table_name,
            column_name,
            data_type,
            is_nullable
          FROM information_schema.columns
          WHERE table_schema = 'public'
          ORDER BY table_name, ordinal_position
        `);
        
        schemaInfo = {
          tables: [...new Set(schemaResult.rows.map(r => r.table_name))],
          totalColumns: schemaResult.rows.length
        };

      } finally {
        client.release();
      }
    }

    // Test specific takeover if address provided
    let takeoverTests: DebugResult = {};
    if (address) {
      console.log(`🔍 Testing takeover endpoints for address: ${address}`);
      
      const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
      
      // Test all endpoints
      const [filteredResult, simpleResult, mainResult] = await Promise.allSettled([
        testTakeoverEndpoint(address, baseUrl),
        testSimpleEndpoint(address, baseUrl),
        testMainEndpoint(address, baseUrl)
      ]);

      takeoverTests = {
        filtered: filteredResult.status === 'fulfilled' ? filteredResult.value : { error: filteredResult.reason?.message },
        simple: simpleResult.status === 'fulfilled' ? simpleResult.value : { error: simpleResult.reason?.message },
        main: mainResult.status === 'fulfilled' ? mainResult.value : { error: mainResult.reason?.message }
      };
    }

    // Service layer tests
    let serviceTests: DebugResult = {};
    if (dbHealth.success) {
      const client = await pool.connect();
      try {
        console.log('🔍 Testing TakeoverService...');
        
        // Test basic service functionality
        const serviceTakeovers = await TakeoverService.getTakeovers(client, { limit: 1 });
        serviceTests.getTakeovers = {
          success: true,
          count: serviceTakeovers.length,
          sample: serviceTakeovers[0] || null
        };

        // Test processing calculations
        if (serviceTakeovers.length > 0) {
          const processed = processTakeoverCalculations(serviceTakeovers[0]);
          serviceTests.processTakeoverCalculations = {
            success: true,
            hasCalculatedFields: !!(processed.progressPercentage !== undefined)
          };
        }

      } catch (serviceError: any) {
        serviceTests.error = serviceError.message;
      } finally {
        client.release();
      }
    }

    const responseTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      data: {
        system: systemInfo,
        database: {
          health: dbHealth,
          table: tableInfo,
          takeovers: {
            count: takeoverCount,
            samples: sampleTakeovers
          },
          indexes: indexInfo,
          schema: schemaInfo
        },
        services: serviceTests,
        takeover: address ? {
          address,
          tests: takeoverTests,
          recommendation: takeoverTests.simple?.found 
            ? 'Takeover found via simple endpoint - use this as primary'
            : 'Takeover not found - check if it exists in database'
        } : null,
        performance: {
          responseTime: `${responseTime}ms`,
          timestamp: new Date().toISOString()
        }
      }
    });

  } catch (error: any) {
    console.error('💥 Debug endpoint error:', error);
    
    return NextResponse.json({
      success: false,
      error: {
        message: error.message,
        code: error.code || 'DEBUG_ERROR',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      performance: {
        responseTime: `${Date.now() - startTime}ms`,
        timestamp: new Date().toISOString()
      }
    }, { status: 500 });
  }
}