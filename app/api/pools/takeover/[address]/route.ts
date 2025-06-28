import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

// Database connection using your existing setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function GET(
  request: NextRequest,
  { params }: { params: { address: string } }
) {
  console.log('📊 Individual pool data requested for:', params.address);
  
  const client = await pool.connect();
  
  try {
    const query = `
      SELECT 
        t.id as takeover_id,
        t.address as takeover_address,
        t.token_name,
        t.v2_token_mint,
        t.v2_total_supply,
        t.liquidity_pool_tokens,
        t.sol_for_liquidity,
        t.is_finalized,
        t.is_successful,
        t.has_v2_mint,
        t.created_at,
        lp.initial_token_reserve,
        lp.initial_sol_reserve,
        lp.is_active,
        lp.created_at as pool_created_at
      FROM takeovers t
      LEFT JOIN liquidity_pools lp ON t.id = lp.takeover_id
      WHERE t.address = $1
        AND t.is_finalized = true 
        AND t.is_successful = true 
        AND t.v2_token_mint IS NOT NULL
    `;

    const result = await client.query(query, [params.address]);
    
    if (result.rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Pool not found or not eligible'
      }, { status: 404 });
    }
    
    console.log(`📊 Found pool for takeover: ${params.address}`);

    return NextResponse.json({
      success: true,
      pool: result.rows[0],
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('💥 Individual pool fetch failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
    
  } finally {
    client.release();
  }
}