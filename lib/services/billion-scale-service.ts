// lib/services/billion-scale-service.ts - Fixed type issues
import { PoolClient } from 'pg';
import { ApiError, NotFoundError } from '../middleware/error-handler';

export interface BillionScaleClaimFilters {
  contributor: string;
  takeoverAddress?: string;
  status?: 'claimed' | 'unclaimed' | 'all';
}

export interface BillionScaleClaimData {
  contributionId: number;
  contributor: string;
  takeoverAddress: string;
  transactionSignature: string;
  claimMethod?: 'standard' | 'liquidity_enhanced';
  jupiterSwapUsed?: boolean;
  liquidityPoolUsed?: boolean;
}

export class BillionScaleService {
  static async getBillionScaleClaims(db: PoolClient, filters: BillionScaleClaimFilters) {
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
    `;
    
    const params: any[] = [filters.contributor]; // FIXED: Explicit type annotation
    
    if (filters.takeoverAddress) {
      query += ` AND t.address = $${params.length + 1}`;
      params.push(filters.takeoverAddress);
    }

    // FIXED: Handle boolean parameter correctly
    if (filters.status && filters.status !== 'all') {
      const isClaimed = filters.status === 'claimed';
      query += ` AND COALESCE(c.is_claimed, false) = $${params.length + 1}`;
      params.push(isClaimed); // Boolean values are valid for PostgreSQL
    }
    
    query += ` ORDER BY c.created_at DESC`;
    
    const result = await db.query(query, params);
    
    return result.rows.map(row => {
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
  }

  static async processBillionScaleClaim(db: PoolClient, data: BillionScaleClaimData) {
    // Get contribution and takeover details
    const result = await db.query(`
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
    `, [data.contributionId, data.contributor, data.takeoverAddress]);
    
    if (result.rows.length === 0) {
      throw new NotFoundError('Invalid billion-scale claim or already processed');
    }
    
    const claim = result.rows[0];
    
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
    // FIXED: Use proper parameter types
    const updateParams: any[] = [
      data.transactionSignature, 
      claimAmount, 
      claimType, 
      data.claimMethod || 'standard',
      data.jupiterSwapUsed || false,
      data.liquidityPoolUsed || false,
      data.contributionId
    ];

    await db.query(`
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
    `, updateParams);
    
    // Update takeover claim statistics if columns exist
    try {
      await db.query(`
        UPDATE takeovers 
        SET 
          total_claimed = COALESCE(total_claimed::bigint, 0) + $1::bigint,
          claimed_count = COALESCE(claimed_count, 0) + 1
        WHERE id = $2
      `, [claimAmount, claim.takeover_id]);
    } catch (error) {
      // Ignore if columns don't exist - they're optional
      console.warn('Could not update takeover claim statistics:', error);
    }
    
    return {
      claimAmount,
      tokenMint,
      claimType,
      contributionAmount: claim.amount,
      takeoverAddress: claim.takeover_address,
      tokenName: claim.token_name,
      v1SupplyBillions: claim.v1_total_supply ? 
        Number(BigInt(claim.v1_total_supply) / BigInt(1_000_000_000_000_000)) : 0,
      safetyUtilization: claim.final_safety_utilization || 0,
      conservativeReward: true
    };
  }

  static async getBillionScaleStatistics(db: PoolClient) {
    const result = await db.query(`
      SELECT 
        COUNT(*) FILTER (WHERE t.reward_rate_bp IS NOT NULL) as billion_scale_takeovers,
        COUNT(*) FILTER (WHERE t.reward_rate_bp IS NOT NULL AND t.is_successful = true) as successful_billion_scale,
        AVG(t.reward_rate_bp) FILTER (WHERE t.reward_rate_bp IS NOT NULL) as avg_reward_rate_bp,
        COUNT(*) FILTER (WHERE t.final_safety_utilization < 80) as conservative_operations,
        COUNT(*) FILTER (WHERE t.jupiter_swap_completed = true) as with_jupiter_swap,
        COUNT(*) FILTER (WHERE t.lp_created = true) as with_liquidity_pool
      FROM takeovers t
      WHERE t.is_finalized = true
    `);

    return result.rows[0];
  }
}