import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { EnhancedFinalizationService } from '@/lib/services/enhanced-finalization-service';

// Database connection using your existing setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// GET /api/finalize - Get takeovers that are ready for finalization
export async function GET(request: NextRequest) {
  console.log('🔍 GET /api/finalize - Checking takeovers ready for finalization');
  
  const client = await pool.connect();
  
  try {
    const now = Math.floor(Date.now() / 1000);
    
    // Find takeovers ready for finalization
    const query = `
      SELECT 
        id, address, authority, token_name, end_time, 
        total_contributed, min_amount, calculated_min_amount, 
        token_amount_target, is_finalized, is_successful
      FROM takeovers 
      WHERE is_finalized = false 
        AND (
          end_time < $1 
          OR total_contributed >= COALESCE(token_amount_target, calculated_min_amount, min_amount)
        )
      ORDER BY end_time ASC
    `;
    
    const result = await client.query(query, [now]);
    
    // FIXED: Add explicit type annotation for parameter 't'
    const readyTakeovers = result.rows.map((t: any) => {
      const totalContributed = BigInt(t.total_contributed || '0');
      const minAmount = BigInt(t.min_amount || '0');
      const tokenTarget = BigInt(t.token_amount_target || '0');
      const goalAmount = tokenTarget > 0n ? tokenTarget : minAmount;
      const isSuccessful = totalContributed >= goalAmount;
      
      return {
        id: t.id,
        address: t.address,
        authority: t.authority,
        tokenName: t.token_name,
        endTime: t.end_time,
        totalContributed: t.total_contributed,
        isSuccessful,
        readyReason: t.end_time < now ? 'expired' : 'goal_reached'
      };
    });
    
    return NextResponse.json({
      success: true,
      data: {
        readyForFinalization: readyTakeovers,
        count: readyTakeovers.length,
        currentTime: now
      }
    });
    
  } catch (error: any) {
    console.error('💥 GET /api/finalize failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
    
  } finally {
    client.release();
  }
}

// POST /api/finalize - Finalize a takeover
export async function POST(request: NextRequest) {
  console.log('🏁 POST /api/finalize - Manual finalization requested');
  
  const client = await pool.connect();
  
  try {
    const body = await request.json();
    const { 
      takeoverAddress, 
      authority, 
      transactionSignature, 
      isSuccessful, 
      v2TokenMint 
    } = body;

    if (!takeoverAddress || !authority || !transactionSignature) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: takeoverAddress, authority, transactionSignature'
      }, { status: 400 });
    }

    // Use the enhanced finalization service
    const result = await EnhancedFinalizationService.finalizeWithSync(client, {
      takeoverAddress,
      authority,
      isSuccessful: isSuccessful || false,
      transactionSignature,
      v2TokenMint
    });

    return NextResponse.json({
      success: true,
      data: {
        takeover: {
          id: result.takeover.id,
          address: result.takeover.address,
          tokenName: result.takeover.token_name,
          isSuccessful: result.takeover.is_successful,
          v2TokenMint: result.takeover.v2_token_mint,
          transactionSignature: transactionSignature,
          finalizedAt: result.takeover.finalized_at
        },
        claimsInitialized: result.claimsInitialized,
        liquidityPoolReady: result.liquidityPoolReady
      }
    });
    
  } catch (error: any) {
    console.error('💥 POST /api/finalize failed:', error);
    
    // Handle specific error types
    let statusCode = 500;
    if (error.name === 'NotFoundError') {
      statusCode = 404;
    } else if (error.name === 'ApiError') {
      statusCode = error.status || 400;
    }
    
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code || 'FINALIZATION_ERROR'
    }, { status: statusCode });
    
  } finally {
    client.release();
  }
}