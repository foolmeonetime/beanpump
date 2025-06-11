import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(request: NextRequest) {
  try {
    const client = await pool.connect();
    
    const result = await client.query(`
      SELECT 
        *,
        -- Calculate progress using calculated_min_amount if available, otherwise min_amount
        (total_contributed::DECIMAL / COALESCE(calculated_min_amount, min_amount::BIGINT)::DECIMAL * 100) as progress_percentage,
        CASE 
          WHEN is_finalized THEN 
            CASE WHEN is_successful THEN 'successful' ELSE 'failed' END
          WHEN total_contributed >= COALESCE(calculated_min_amount, min_amount::BIGINT) THEN 'goal_reached'
          WHEN EXTRACT(EPOCH FROM NOW()) > end_time THEN 'ended'
          ELSE 'active'
        END as status
      FROM takeovers 
      ORDER BY created_at DESC
    `);
    
    client.release();
    
    const takeovers = result.rows.map(row => ({
      ...row,
      // Legacy fields for backward compatibility
      minAmount: (row.calculated_min_amount || row.min_amount || '0').toString(),
      totalContributed: row.total_contributed.toString(),
      startTime: row.start_time.toString(),
      endTime: row.end_time.toString(),
      customRewardRate: row.reward_rate_bp ? row.reward_rate_bp / 100 : parseFloat(row.custom_reward_rate || 1.5),
      
      // New billion-scale fields
      v1TotalSupply: row.v1_total_supply?.toString(),
      v2TotalSupply: row.v2_total_supply?.toString(),
      rewardPoolTokens: row.reward_pool_tokens?.toString(),
      liquidityPoolTokens: row.liquidity_pool_tokens?.toString(),
      rewardRateBp: row.reward_rate_bp,
      targetParticipationBp: row.target_participation_bp,
      calculatedMinAmount: row.calculated_min_amount?.toString(),
      maxSafeTotalContribution: row.max_safe_total_contribution?.toString(),
      v1MarketPriceLamports: row.v1_market_price_lamports?.toString(),
      solForLiquidity: row.sol_for_liquidity?.toString() || '0',
      jupiterSwapCompleted: row.jupiter_swap_completed || false,
      lpCreated: row.lp_created || false,
      participationRateBp: row.participation_rate_bp || 0,
      
      // Display fields
      contributorCount: row.contributor_count,
      isFinalized: row.is_finalized,
      isSuccessful: row.is_successful,
      hasV2Mint: row.has_v2_mint,
      progressPercentage: parseFloat(row.progress_percentage || 0),
      tokenName: row.token_name || 'Unknown Token',
      imageUrl: row.image_url || null,
      finalize_tx: row.finalize_tx,
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
      // Legacy fields
      minAmount,
      startTime,
      endTime,
      customRewardRate,
      tokenName,
      imageUrl,
      // New billion-scale fields
      rewardRateBp,
      targetParticipationBp,
      v1MarketPriceLamports,
      v1TotalSupply,
      v2TotalSupply,
      rewardPoolTokens,
      liquidityPoolTokens,
      calculatedMinAmount,
      maxSafeTotalContribution
    } = body;

    const client = await pool.connect();
    
    // Support both legacy and billion-scale creation
    const finalRewardRateBp = rewardRateBp || (customRewardRate ? Math.round(customRewardRate * 100) : 150);
    const finalTargetParticipationBp = targetParticipationBp || 1000; // Default 10%
    const finalCalculatedMinAmount = calculatedMinAmount || minAmount || '1000000000'; // 1000 tokens default
    
    const result = await client.query(`
      INSERT INTO takeovers (
        address, authority, v1_token_mint, vault, 
        min_amount, start_time, end_time, custom_reward_rate, token_name, image_url,
        reward_rate_bp, target_participation_bp, calculated_min_amount, 
        max_safe_total_contribution, v1_market_price_lamports,
        v1_total_supply, v2_total_supply, reward_pool_tokens, liquidity_pool_tokens
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `, [
      address,
      authority,
      v1TokenMint,
      vault,
      // Legacy fields
      minAmount || finalCalculatedMinAmount,
      startTime,
      endTime,
      customRewardRate || (finalRewardRateBp / 100),
      tokenName,
      imageUrl,
      // New billion-scale fields
      finalRewardRateBp,
      finalTargetParticipationBp,
      finalCalculatedMinAmount,
      maxSafeTotalContribution,
      v1MarketPriceLamports,
      v1TotalSupply,
      v2TotalSupply,
      rewardPoolTokens,
      liquidityPoolTokens
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