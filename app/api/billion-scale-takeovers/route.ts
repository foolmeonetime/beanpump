import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function GET(request: NextRequest) {
  try {
    const client = await pool.connect();
    
    const result = await client.query(`
      SELECT 
        *,
        (total_contributed::DECIMAL / calculated_min_amount::DECIMAL * 100) as progress_percentage,
        (total_contributed::DECIMAL / max_safe_total_contribution::DECIMAL * 100) as safety_utilization,
        (v1_total_supply::DECIMAL / 1000000000000000) as v1_supply_billions,
        CASE 
          WHEN is_finalized THEN 
            CASE WHEN is_successful THEN 'successful' ELSE 'failed' END
          WHEN total_contributed >= calculated_min_amount THEN 'goal_reached'
          WHEN EXTRACT(EPOCH FROM NOW()) > end_time THEN 'ended'
          ELSE 'active'
        END as status
      FROM takeovers 
      ORDER BY created_at DESC
    `);
    
    client.release();
    
    const takeovers = result.rows.map(row => ({
      ...row,
      // Convert string numbers back to proper format for billion-scale
      calculatedMinAmount: row.calculated_min_amount.toString(),
      maxSafeTotalContribution: row.max_safe_total_contribution.toString(),
      totalContributed: row.total_contributed.toString(),
      startTime: row.start_time.toString(),
      endTime: row.end_time.toString(),
      contributorCount: row.contributor_count,
      isFinalized: row.is_finalized,
      isSuccessful: row.is_successful,
      hasV2Mint: row.has_v2_mint,
      rewardRateBp: row.reward_rate_bp,
      targetParticipationBp: row.target_participation_bp,
      participationRateBp: row.participation_rate_bp || 0,
      progressPercentage: parseFloat(row.progress_percentage || 0),
      safetyUtilization: parseFloat(row.safety_utilization || 0),
      v1SupplyBillions: parseFloat(row.v1_supply_billions || 0),
      tokenName: row.token_name || 'Unknown Token',
      imageUrl: row.image_url || null,
      
      // Billion-scale specific fields
      v1TotalSupply: row.v1_total_supply.toString(),
      v2TotalSupply: row.v2_total_supply?.toString() || '0', // FIXED: Removed duplicate declaration
      rewardPoolTokens: row.reward_pool_tokens?.toString() || '0',
      liquidityPoolTokens: row.liquidity_pool_tokens?.toString() || '0',
      v1MarketPriceLamports: row.v1_market_price_lamports?.toString() || '0',
      solForLiquidity: row.sol_for_liquidity?.toString() || '0',
      jupiterSwapCompleted: row.jupiter_swap_completed || false,
      lpCreated: row.lp_created || false,
    }));

    // Calculate aggregate billion-scale metrics
    const aggregateMetrics = {
      totalTakeovers: takeovers.length,
      totalSupplyBillions: takeovers.reduce((sum, t) => sum + t.v1SupplyBillions, 0),
      averageSafetyUtilization: takeovers.length > 0 
        ? takeovers.reduce((sum, t) => sum + t.safetyUtilization, 0) / takeovers.length 
        : 0,
      conservativeOperations: takeovers.filter(t => t.safetyUtilization < 80).length,
      highUtilizationOperations: takeovers.filter(t => t.safetyUtilization >= 95).length,
      activeTakeovers: takeovers.filter(t => t.status === 'active').length,
      successfulTakeovers: takeovers.filter(t => t.isFinalized && t.isSuccessful).length,
      failedTakeovers: takeovers.filter(t => t.isFinalized && !t.isSuccessful).length,
      readyToFinalize: takeovers.filter(t => {
        if (t.isFinalized) return false;
        const now = Math.floor(Date.now() / 1000);
        const endTime = parseInt(t.endTime);
        const totalContributed = BigInt(t.totalContributed);
        const calculatedMinAmount = BigInt(t.calculatedMinAmount);
        return totalContributed >= calculatedMinAmount || now >= endTime;
      }).length,
      
      // Liquidity features
      withJupiterSwap: takeovers.filter(t => t.jupiterSwapCompleted).length,
      withLiquidityPool: takeovers.filter(t => t.lpCreated).length,
      
      // Reward rate distribution
      rewardRateDistribution: {
        conservative: takeovers.filter(t => t.rewardRateBp <= 150).length, // 1.5x and below
        moderate: takeovers.filter(t => t.rewardRateBp > 150 && t.rewardRateBp <= 180).length, // 1.5x-1.8x
        high: takeovers.filter(t => t.rewardRateBp > 180).length, // Above 1.8x
      },
      
      // Safety distribution
      safetyDistribution: {
        safe: takeovers.filter(t => t.safetyUtilization < 80).length,
        warning: takeovers.filter(t => t.safetyUtilization >= 80 && t.safetyUtilization < 95).length,
        danger: takeovers.filter(t => t.safetyUtilization >= 95).length,
      }
    };
    
    return NextResponse.json({ 
      takeovers,
      aggregateMetrics,
      billionScaleFeatures: {
        conservativeSafety: true,
        overflowProtection: true,
        liquidityIntegration: true,
        proportionateGoals: true,
        maxRewardRate: 2.0,
        safetyCushion: 0.02, // 2%
      }
    });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch billion-scale takeovers' },
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
      calculatedMinAmount,
      maxSafeTotalContribution,
      startTime,
      endTime,
      rewardRateBp,
      targetParticipationBp,
      v1MarketPriceLamports,
      tokenName,
      imageUrl,
      // Billion-scale specific fields
      v1TotalSupply,
      v2TotalSupply,
      rewardPoolTokens,
      liquidityPoolTokens,
    } = body;

    // Validate billion-scale parameters
    if (rewardRateBp < 100 || rewardRateBp > 200) {
      return NextResponse.json(
        { error: 'Reward rate must be between 1.0x (100bp) and 2.0x (200bp) for billion-scale safety' },
        { status: 400 }
      );
    }

    if (targetParticipationBp <= 0 || targetParticipationBp > 10000) {
      return NextResponse.json(
        { error: 'Target participation must be between 0.01% and 100%' },
        { status: 400 }
      );
    }

    const client = await pool.connect();
    
    const result = await client.query(`
      INSERT INTO takeovers (
        address, authority, v1_token_mint, vault, 
        calculated_min_amount, max_safe_total_contribution,
        start_time, end_time, 
        reward_rate_bp, target_participation_bp, v1_market_price_lamports,
        token_name, image_url,
        v1_total_supply, v2_total_supply, 
        reward_pool_tokens, liquidity_pool_tokens
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *
    `, [
      address,
      authority,
      v1TokenMint,
      vault,
      calculatedMinAmount,
      maxSafeTotalContribution,
      startTime,
      endTime,
      rewardRateBp,
      targetParticipationBp,
      v1MarketPriceLamports,
      tokenName,
      imageUrl,
      v1TotalSupply,
      v2TotalSupply,
      rewardPoolTokens,
      liquidityPoolTokens
    ]);
    
    client.release();
    
    const takeover = result.rows[0];
    
    // Log billion-scale creation
    console.log('🚀 Billion-scale takeover created:');
    console.log(`   Token: ${tokenName}`);
    console.log(`   Supply: ${(BigInt(v1TotalSupply) / BigInt(1_000_000_000_000_000)).toString()}B tokens`);
    console.log(`   Reward Rate: ${rewardRateBp / 100}x (conservative)`);
    console.log(`   Target Participation: ${targetParticipationBp / 100}%`);
    console.log(`   Safety Features: ✅ 2% cushion, ✅ 2.0x max rate, ✅ overflow protection`);
    
    return NextResponse.json({ 
      takeover,
      billionScaleMetrics: {
        v1SupplyBillions: (BigInt(v1TotalSupply) / BigInt(1_000_000_000_000_000)).toString(),
        rewardRateMultiplier: rewardRateBp / 100,
        targetParticipationPercent: targetParticipationBp / 100,
        conservativeFeatures: [
          "2% overflow safety cushion",
          "2.0x maximum reward rate",
          "Proportionate goal calculation",
          "Billion-scale overflow protection",
          "Jupiter integration ready",
          "Liquidity pool features"
        ]
      }
    });
  } catch (error) {
    console.error('Database error:', error);
    return NextResponse.json(
      { error: 'Failed to create billion-scale takeover' },
      { status: 500 }
    );
  }
}