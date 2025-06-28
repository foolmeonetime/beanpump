import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';

// Database connection using your existing setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function GET(request: NextRequest) {
  console.log('📊 Pool data requested for client sync');
  
  const client = await pool.connect();
  
  try {
    // Query for successful, finalized takeovers with v2 tokens
    const query = `
      SELECT 
        t.id as takeover_id,
        t.address as takeover_address,
        t.token_name,
        t.v2_token_mint,
        t.v2_total_supply,
        t.liquidity_pool_tokens,
        t.sol_for_liquidity,
        t.total_contributed,
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
      WHERE t.is_finalized = true 
        AND t.is_successful = true 
        AND t.v2_token_mint IS NOT NULL
        AND COALESCE(t.has_v2_mint, false) = true
      ORDER BY t.created_at DESC
    `;

    const result = await client.query(query);
    
    console.log(`📊 Found ${result.rows.length} finalized successful takeovers`);

    return NextResponse.json({
      success: true,
      pools: result.rows,
      poolCount: result.rows.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('💥 Pool data fetch failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
    
  } finally {
    client.release();
  }
}

export async function POST(request: NextRequest) {
  console.log('🔄 Manual pool sync requested');
  
  const client = await pool.connect();
  
  try {
    // Get updated pool counts and stats
    const allPoolsQuery = `
      SELECT 
        t.id as takeover_id,
        t.address as takeover_address,
        t.token_name,
        t.v2_token_mint,
        t.v2_total_supply,
        t.liquidity_pool_tokens,
        t.sol_for_liquidity,
        t.total_contributed,
        t.is_finalized,
        t.is_successful,
        t.has_v2_mint,
        t.created_at
      FROM takeovers t
      WHERE t.is_finalized = true 
        AND t.is_successful = true 
        AND t.v2_token_mint IS NOT NULL
        AND COALESCE(t.has_v2_mint, false) = true
      ORDER BY t.created_at DESC
    `;
    
    const poolsResult = await client.query(allPoolsQuery);
    
    // Also check for newly finalized takeovers that might need pools
    const statsQuery = `
      SELECT 
        COUNT(*) as total_finalized,
        COUNT(CASE WHEN is_successful = true THEN 1 END) as successful_count,
        COUNT(CASE WHEN is_successful = true AND v2_token_mint IS NOT NULL THEN 1 END) as with_v2_mint
      FROM takeovers 
      WHERE is_finalized = true
    `;
    
    const statsResult = await client.query(statsQuery);
    const stats = statsResult.rows[0];
    
    console.log('📊 Pool sync completed:', {
      databasePools: poolsResult.rows.length,
      totalFinalized: stats.total_finalized,
      successfulTakeovers: stats.successful_count,
      withV2Mint: stats.with_v2_mint
    });
    
    return NextResponse.json({
      success: true,
      pools: poolsResult.rows,
      poolsFound: poolsResult.rows.length,
      totalPools: poolsResult.rows.length,
      stats: {
        databasePools: poolsResult.rows.length,
        totalFinalized: parseInt(stats.total_finalized) || 0,
        successfulTakeovers: parseInt(stats.successful_count) || 0,
        withV2Mint: parseInt(stats.with_v2_mint) || 0
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error: any) {
    console.error('💥 Pool sync failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
    
  } finally {
    client.release();
  }
}