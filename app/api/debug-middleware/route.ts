import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

export const dynamic = 'force-dynamic';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function GET(request: NextRequest) {
  const debug = {
    timestamp: new Date().toISOString(),
    middleware: {
      database: null as any,
      validation: null as any,
      errorHandler: null as any,
      takeovers: null as any,
      processTakeoverCalculations: null as any
    },
    error: null as any
  };

  try {
    console.log('🔍 Testing middleware components...');

    // 1. Test Database Connection
    console.log('1️⃣ Testing database connection...');
    const client = await pool.connect();
    debug.middleware.database = 'Connected successfully';
    
    try {
      // 2. Test Basic Query
      console.log('2️⃣ Testing basic takeovers query...');
      const basicResult = await client.query(`SELECT COUNT(*) as count FROM takeovers`);
      debug.middleware.takeovers = {
        basicQuery: 'Success',
        count: basicResult.rows[0].count
      };

      // 3. Test the exact query from TakeoverService
      console.log('3️⃣ Testing TakeoverService query...');
      const serviceQuery = `
        SELECT 
          id, address, authority, v1_token_mint, vault, min_amount, 
          start_time, end_time, total_contributed, contributor_count, 
          is_finalized, is_successful, custom_reward_rate, token_name, 
          image_url, created_at, reward_rate_bp, calculated_min_amount, 
          max_safe_total_contribution
        FROM takeovers 
        ORDER BY created_at DESC
      `;
      
      const serviceResult = await client.query(serviceQuery);
      debug.middleware.takeovers = {
        ...debug.middleware.takeovers,
        serviceQuery: 'Success',
        records: serviceResult.rows.length,
        sampleRecord: serviceResult.rows[0] ? {
          id: serviceResult.rows[0].id,
          tokenName: serviceResult.rows[0].token_name,
          totalContributed: serviceResult.rows[0].total_contributed,
          minAmount: serviceResult.rows[0].min_amount
        } : null
      };

      // 4. Test processTakeoverCalculations function
      console.log('4️⃣ Testing processTakeoverCalculations...');
      if (serviceResult.rows.length > 0) {
        const testTakeover = serviceResult.rows[0];
        
        try {
          // Simulate what processTakeoverCalculations does
          const now = Math.floor(Date.now() / 1000);
          const endTime = parseInt(testTakeover.end_time || '0');
          const startTime = parseInt(testTakeover.start_time || '0');
          const totalContributed = testTakeover.total_contributed || '0';
          const minAmount = testTakeover.calculated_min_amount || testTakeover.min_amount || '0';
          
          const status = testTakeover.is_finalized 
            ? (testTakeover.is_successful ? 'successful' : 'failed')
            : now < endTime ? 'active' : 'ended';
            
          const progressPercentage = Math.min(100, 
            (parseFloat(totalContributed) / parseFloat(minAmount)) * 100
          );

          debug.middleware.processTakeoverCalculations = {
            status: 'Success',
            testCalculation: {
              status,
              progressPercentage: isNaN(progressPercentage) ? 0 : progressPercentage,
              now,
              endTime,
              totalContributed,
              minAmount
            }
          };
        } catch (calcError: any) {
          debug.middleware.processTakeoverCalculations = {
            status: 'Failed',
            error: calcError.message,
            stack: calcError.stack
          };
        }
      }

      // 5. Test validation (mock)
      console.log('5️⃣ Testing validation...');
      const url = new URL(request.url);
      const mockFilters = {
        authority: url.searchParams.get('authority') || undefined,
        status: url.searchParams.get('status') || undefined,
        limit: url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : undefined,
        offset: url.searchParams.get('offset') ? Number(url.searchParams.get('offset')) : undefined,
      };
      
      debug.middleware.validation = {
        status: 'Success',
        mockFilters
      };

      // 6. Test error handler (mock)
      console.log('6️⃣ Testing error handler...');
      debug.middleware.errorHandler = 'Available';
      
    } finally {
      client.release();
    }

    console.log('✅ All middleware tests completed');

  } catch (error: any) {
    console.error('❌ Middleware test failed:', error);
    debug.error = {
      message: error.message,
      code: error.code,
      detail: error.detail,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    };
  }

  return NextResponse.json(debug);
}