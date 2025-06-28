import { NextRequest, NextResponse } from 'next/server';
import { Pool } from 'pg';
import { globalLPSimulator } from '@/lib/enhanced-lp-simulator';

// Database connection using your existing setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export async function POST(request: NextRequest) {
  console.log('🔄 Manual pool sync requested');
  
  const client = await pool.connect();
  
  try {
    // Force sync with database
    await globalLPSimulator.syncWithDatabase();
    
    // Get updated pool counts
    const allPools = globalLPSimulator.getAllPools();
    const databasePools = allPools.filter(p => p.isFromDatabase);
    const simulatedPools = allPools.filter(p => !p.isFromDatabase);
    
    // Also check for newly finalized takeovers that might need pools
    const query = `
      SELECT 
        COUNT(*) as total_finalized,
        COUNT(CASE WHEN is_successful = true THEN 1 END) as successful_count,
        COUNT(CASE WHEN is_successful = true AND v2_token_mint IS NOT NULL THEN 1 END) as with_v2_mint
      FROM takeovers 
      WHERE is_finalized = true
    `;
    
    const result = await client.query(query);
    const stats = result.rows[0];
    
    console.log('📊 Pool sync completed:', {
      totalPools: allPools.length,
      databasePools: databasePools.length,
      simulatedPools: simulatedPools.length,
      totalFinalized: stats.total_finalized,
      successfulTakeovers: stats.successful_count,
      withV2Mint: stats.with_v2_mint
    });
    
    return NextResponse.json({
      success: true,
      poolsFound: databasePools.length,
      totalPools: allPools.length,
      stats: {
        databasePools: databasePools.length,
        simulatedPools: simulatedPools.length,
        totalFinalized: parseInt(stats.total_finalized) || 0,
        successfulTakeovers: parseInt(stats.successful_count) || 0,
        withV2Mint: parseInt(stats.with_v2_mint) || 0
      }
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

export async function GET(request: NextRequest) {
  console.log('📊 Pool sync status requested');
  
  try {
    // Get current pool state without syncing
    const allPools = globalLPSimulator.getAllPools();
    const databasePools = allPools.filter(p => p.isFromDatabase);
    const simulatedPools = allPools.filter(p => !p.isFromDatabase);
    
    return NextResponse.json({
      success: true,
      pools: allPools.map(pool => ({
        id: pool.id,
        tokenSymbol: pool.tokenSymbol,
        isFromDatabase: pool.isFromDatabase,
        takeoverAddress: pool.takeoverAddress,
        totalValueLocked: pool.totalValueLocked,
        transactionCount: pool.transactions.length,
        lastSync: pool.lastDatabaseSync,
        createdAt: pool.createdAt
      })),
      stats: {
        totalPools: allPools.length,
        databasePools: databasePools.length,
        simulatedPools: simulatedPools.length,
        lastSyncTime: Math.max(...databasePools.map(p => p.lastDatabaseSync), 0)
      }
    });
    
  } catch (error: any) {
    console.error('💥 Pool status query failed:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}