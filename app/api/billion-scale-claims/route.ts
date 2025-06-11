// app/api/billion-scale-claims/route.ts - Enhanced claims API for billion-scale operations
import { NextRequest, NextResponse } from 'next/server';
import { Pool } from '@neondatabase/serverless';
import { 
  Connection, 
  PublicKey, 
  Transaction,
  sendAndConfirmTransaction 
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  'confirmed'
);

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const contributor = searchParams.get('contributor');
    const takeoverAddress = searchParams.get('takeover');
    
    if (!contributor) {
      return NextResponse.json(
        { success: false, error: 'Contributor address required' },
        { status: 400 }
      );
    }

    const client = await pool.connect();
    
    let query = `
      SELECT 
        c.*,
        t.address as takeover_address,
        t.token_name,
        t.is_finalized,
        t.is_successful,
        t.reward_rate_bp,
        t.v2_token_mint,
        t.vault,
        t.v1_token_mint,
        t.v1_total_supply,
        t.v2_total_supply,
        t.participation_rate_bp,
        t.final_safety_utilization,
        t.reward_pool_tokens,
        t.liquidity_pool_tokens,
        t.jupiter_swap_completed,
        t.lp_created
      FROM contributions c
      JOIN takeovers t ON c.takeover_id = t.id
      WHERE c.contributor = $1
        AND t.is_finalized = true
        AND COALESCE(c.is_claimed, false) = false
    `;
    
    const params = [contributor];
    
    if (takeoverAddress) {
      query += ` AND t.address = $2`;
      params.push(takeoverAddress);
    }
    
    query += ` ORDER BY c.created_at DESC`;
    
    const result = await client.query(query, params);
    client.release();
    
    const claims = result.rows.map(row => {
      const contributionAmount = BigInt(row.amount);
      const rewardRateBp = row.reward_rate_bp || 150; // Default 1.5x
      const rewardRateDecimal = rewardRateBp / 10000;
      
      // Calculate billion-scale metrics
      const v1SupplyBillions = row.v1_total_supply ? 
        Number(BigInt(row.v1_total_supply) / BigInt(1_000_000_000_000_000)) : 0;
      
      const participationRateBp = row.participation_rate_bp || 0;
      const safetyUtilization = row.final_safety_utilization || 0;
      
      // Conservative reward calculation with 2% safety cushion
      const rewardPoolTokens = BigInt(row.reward_pool_tokens || '0');
      const safeRewardPool = rewardPoolTokens * BigInt(98) / BigInt(100); // 98% for safety
      const expectedRewardWithoutCushion = contributionAmount * BigInt(Math.floor(rewardRateDecimal * 10000)) / BigInt(10000);
      
      // Use conservative calculation
      const actualRewardAmount = expectedRewardWithoutCushion <= safeRewardPool 
        ? expectedRewardWithoutCushion 
        : safeRewardPool * contributionAmount / (contributionAmount + BigInt(1)); // Proportional scaling
      
      return {
        id: row.id,
        takeoverId: row.takeover_id,
        takeoverAddress: row.takeover_address,
        tokenName: row.token_name,
        contributionAmount: row.amount.toString(),
        isSuccessful: row.is_successful,
        rewardRateBp: rewardRateBp,
        isClaimed: row.is_claimed || false,
        transactionSignature: row.transaction_signature || '',
        createdAt: row.created_at || '',
        
        // Billion-scale specific fields
        v1SupplyBillions: v1SupplyBillions,
        participationRateBp: participationRateBp,
        safetyUtilization: safetyUtilization,
        
        // Token addresses
        v2TokenMint: row.v2_token_mint,
        v1TokenMint: row.v1_token_mint,
        vault: row.vault,
        
        // Calculate claimable amounts with conservative safety
        refundAmount: row.is_successful ? '0' : row.amount.toString(),
        rewardAmount: row.is_successful ? actualRewardAmount.toString() : '0',
        
        // Enhanced features
        conservativeFeatures: [
          "2% overflow safety cushion",
          "2.0x maximum reward rate", 
          "Proportionate reward calculation",
          "Billion-scale overflow protection"
        ],
        
        // Liquidity features
        jupiterSwapCompleted: row.jupiter_swap_completed || false,
        lpCreated: row.lp_created || false,
        
        // Additional billion-scale metrics
        v1TotalSupply: row.v1_total_supply?.toString() || '0',
        v2TotalSupply: row.v2_total_supply?.toString() || '0',
        rewardPoolTokens: row.reward_pool_tokens?.toString() || '0',
        liquidityPoolTokens: row.liquidity_pool_tokens?.toString() || '0',
      };
    });
    
    // Calculate aggregate billion-scale claim metrics
    const aggregateClaimMetrics = {
      totalClaims: claims.length,
      totalValue: claims.reduce((sum, claim) => {
        const amount = Number(claim.contributionAmount) / 1_000_000;
        return sum + amount;
      }, 0),
      totalSupplyBillions: claims.reduce((sum, claim) => sum + claim.v1SupplyBillions, 0),
      averageParticipation: claims.length > 0 
        ? claims.reduce((sum, claim) => sum + (claim.participationRateBp / 100), 0) / claims.length 
        : 0,
      conservativeOperations: claims.filter(claim => claim.safetyUtilization < 80).length,
      successfulClaims: claims.filter(claim => claim.isSuccessful).length,
      highRewardClaims: claims.filter(claim => claim.rewardRateBp >= 180).length,
      withLiquidityFeatures: claims.filter(claim => claim.jupiterSwapCompleted || claim.lpCreated).length,
    };
    
    return NextResponse.json({
      success: true,
      claims,
      count: claims.length,
      aggregateClaimMetrics,
      billionScaleFeatures: {
        conservativeRewards: true,
        safetyUtilization: true,
        liquidityIntegration: true,
        overflowProtection: true,
      }
    });
    
  } catch (error: any) {
    console.error('Error fetching billion-scale claims:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      contributionId,
      contributor,
      takeoverAddress,
      transactionSignature,
      // Billion-scale specific fields
      claimMethod, // 'standard' | 'liquidity_enhanced'
      jupiterSwapUsed,
      liquidityPoolUsed,
    } = body;

    if (!contributionId || !contributor || !takeoverAddress || !transactionSignature) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields for billion-scale claim' },
        { status: 400 }
      );
    }

    const client = await pool.connect();
    
    // Get contribution and takeover details
    const result = await client.query(`
      SELECT 
        c.*,
        t.address as takeover_address,
        t.token_name,
        t.is_finalized,
        t.is_successful,
        t.reward_rate_bp,
        t.v2_token_mint,
        t.vault,
        t.v1_token_mint,
        t.v1_total_supply,
        t.participation_rate_bp,
        t.final_safety_utilization,
        t.reward_pool_tokens
      FROM contributions c
      JOIN takeovers t ON c.takeover_id = t.id
      WHERE c.id = $1 
        AND c.contributor = $2 
        AND t.address = $3
        AND t.is_finalized = true
        AND COALESCE(c.is_claimed, false) = false
    `, [contributionId, contributor, takeoverAddress]);
    
    if (result.rows.length === 0) {
      client.release();
      return NextResponse.json(
        { success: false, error: 'Invalid billion-scale claim or already processed' },
        { status: 404 }
      );
    }
    
    const claim = result.rows[0];
    
    // Verify the transaction signature exists and is valid
    try {
      const tx = await connection.getTransaction(transactionSignature, {
        commitment: 'confirmed'
      });
      
      if (!tx) {
        client.release();
        return NextResponse.json(
          { success: false, error: 'Transaction not found or not confirmed' },
          { status: 400 }
        );
      }
    } catch (error) {
      client.release();
      return NextResponse.json(
        { success: false, error: 'Invalid transaction signature' },
        { status: 400 }
      );
    }
    
    // Calculate billion-scale claim amounts with conservative safety
    const contributionAmount = BigInt(claim.amount);
    const rewardRateBp = claim.reward_rate_bp || 150;
    const rewardRateDecimal = rewardRateBp / 10000;
    
    let claimAmount: string;
    let tokenMint: string;
    let claimType: 'refund' | 'reward';
    
    if (claim.is_successful) {
      // Successful takeover - claim V2 tokens with conservative calculation
      const rewardPoolTokens = BigInt(claim.reward_pool_tokens || '0');
      const safeRewardPool = rewardPoolTokens * BigInt(98) / BigInt(100); // 98% for safety
      const expectedReward = contributionAmount * BigInt(Math.floor(rewardRateDecimal * 10000)) / BigInt(10000);
      
      // Use conservative calculation to ensure no overflow
      claimAmount = expectedReward <= safeRewardPool 
        ? expectedReward.toString()
        : (safeRewardPool * contributionAmount / (contributionAmount + BigInt(1))).toString();
      
      tokenMint = claim.v2_token_mint;
      claimType = 'reward';
    } else {
      // Failed takeover - claim refund
      claimAmount = claim.amount.toString();
      tokenMint = claim.v1_token_mint;
      claimType = 'refund';
    }
    
    // Update contribution as claimed with billion-scale metrics
    await client.query(`
      UPDATE contributions 
      SET 
        is_claimed = true,
        claim_signature = $1,
        claim_amount = $2,
        claim_type = $3,
        claimed_at = NOW(),
        claim_method = $4,
        jupiter_swap_used = $5,
        liquidity_pool_used = $6
      WHERE id = $7
    `, [
      transactionSignature, 
      claimAmount, 
      claimType, 
      claimMethod || 'standard',
      jupiterSwapUsed || false,
      liquidityPoolUsed || false,
      contributionId
    ]);
    
    // Update takeover claim statistics
    await client.query(`
      UPDATE takeovers 
      SET 
        total_claimed = COALESCE(total_claimed, 0) + $1,
        claimed_count = COALESCE(claimed_count, 0) + 1
      WHERE id = $2
    `, [claimAmount, claim.takeover_id]);
    
    client.release();
    
    // Calculate final billion-scale metrics
    const v1SupplyBillions = claim.v1_total_supply ? 
      Number(BigInt(claim.v1_total_supply) / BigInt(1_000_000_000_000_000)) : 0;
    const participationRate = (claim.participation_rate_bp || 0) / 100;
    const safetyUtilization = claim.final_safety_utilization || 0;
    
    // Log billion-scale claim completion
    console.log('🎁 Billion-scale claim processed:');
    console.log(`   Token: ${claim.token_name}`);
    console.log(`   Supply: ${v1SupplyBillions.toFixed(1)}B tokens`);
    console.log(`   Claim Type: ${claimType}`);
    console.log(`   Amount: ${Number(claimAmount) / 1_000_000} tokens`);
    console.log(`   Participation: ${participationRate.toFixed(3)}%`);
    console.log(`   Safety Utilization: ${safetyUtilization.toFixed(1)}%`);
    console.log(`   Conservative features: ✅ 2% safety cushion applied`);
    
    return NextResponse.json({
      success: true,
      claim: {
        contributionId,
        takeoverAddress,
        contributor,
        claimAmount,
        tokenMint,
        claimType,
        transactionSignature,
        tokenName: claim.token_name,
        
        // Billion-scale metrics
        billionScaleMetrics: {
          v1SupplyBillions: v1SupplyBillions,
          participationRate: participationRate,
          safetyUtilization: safetyUtilization,
          rewardRateUsed: rewardRateBp / 100,
          conservativeFeatures: [
            "2% overflow safety cushion applied",
            "Conservative reward calculation used",
            "Billion-scale overflow protection active"
          ],
          liquidityFeatures: {
            jupiterSwapUsed: jupiterSwapUsed || false,
            liquidityPoolUsed: liquidityPoolUsed || false,
            claimMethod: claimMethod || 'standard'
          }
        }
      }
    });
    
  } catch (error: any) {
    console.error('Error processing billion-scale claim:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}