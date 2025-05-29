import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(request: NextRequest) {
  try {
    const client = await pool.connect();
    
    const result = await client.query(`
      SELECT 
        *,
        (total_contributed::DECIMAL / min_amount::DECIMAL * 100) as progress_percentage,
        CASE 
          WHEN is_finalized THEN 
            CASE WHEN is_successful THEN 'successful' ELSE 'failed' END
          WHEN total_contributed >= min_amount THEN 'goal_reached'
          WHEN EXTRACT(EPOCH FROM NOW()) > end_time THEN 'ended'
          ELSE 'active'
        END as status
      FROM takeovers 
      ORDER BY created_at DESC
    `);
    
    client.release();
    
    const takeovers = result.rows.map(row => ({
      ...row,
      // Convert string numbers back to proper format
      minAmount: row.min_amount.toString(),
      totalContributed: row.total_contributed.toString(),
      startTime: row.start_time.toString(),
      endTime: row.end_time.toString(),
      v2TotalSupply: row.v2_total_supply?.toString() || '0',
      contributorCount: row.contributor_count,
      isFinalized: row.is_finalized,
      isSuccessful: row.is_successful,
      hasV2Mint: row.has_v2_mint,
      customRewardRate: parseFloat(row.custom_reward_rate),
      progressPercentage: parseFloat(row.progress_percentage || 0),
      tokenName: row.token_name || 'Unknown Token', // Add token name
    }));
    
    return NextResponse.json({ takeovers });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch takeovers' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      address,
      authority,
      v1TokenMint,
      vault,
      minAmount,
      startTime,
      endTime,
      customRewardRate,
      tokenName // Add token name to the expected fields
    } = body;

    const client = await pool.connect();
    
    const result = await client.query(`
      INSERT INTO takeovers (
        address, authority, v1_token_mint, vault, min_amount, 
        start_time, end_time, custom_reward_rate, token_name
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      address,
      authority,
      v1TokenMint,
      vault,
      minAmount,
      startTime,
      endTime,
      customRewardRate,
      tokenName
    ]);
    
    client.release();
    
    return NextResponse.json({ takeover: result.rows[0] });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to create takeover' },
      { status: 500 }
    );
  }
}