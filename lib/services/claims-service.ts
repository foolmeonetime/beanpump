import { PoolClient } from 'pg';
import { ApiError, NotFoundError } from '../middleware/error-handler';

export interface ClaimFilters {
  contributor: string;
  takeoverId?: number;
  takeoverAddress?: string;
  status?: 'claimed' | 'unclaimed' | 'all';
}

export class ClaimsService {
  static async getUserClaims(db: PoolClient, filters: ClaimFilters) {
    let query = `
      SELECT 
        c.id,
        c.takeover_id,
        c.amount as contribution_amount,
        c.contributor,
        c.transaction_signature,
        c.created_at,
        c.is_claimed,
        c.claim_signature,
        c.claim_amount,
        c.claim_type,
        c.claimed_at,
        t.address as takeover_address,
        t.token_name,
        t.is_successful,
        t.custom_reward_rate,
        t.v1_token_mint,
        t.v2_token_mint,
        t.vault,
        t.is_finalized
      FROM contributions c
      JOIN takeovers t ON c.takeover_id = t.id
      WHERE c.contributor = $1
        AND t.is_finalized = true
    `;

    const params: any[] = [filters.contributor];

    if (filters.takeoverId) {
      query += ` AND c.takeover_id = $${params.length + 1}`;
      params.push(filters.takeoverId);
    }

    if (filters.takeoverAddress) {
      query += ` AND t.address = $${params.length + 1}`;
      params.push(filters.takeoverAddress);
    }

    if (filters.status && filters.status !== 'all') {
      const isClaimed = filters.status === 'claimed';
      query += ` AND COALESCE(c.is_claimed, false) = $${params.length + 1}`;
      params.push(isClaimed);
    }

    query += ` ORDER BY c.created_at DESC`;

    const result = await db.query(query, params);
    
    return result.rows.map(row => ({
      id: row.id,
      takeoverId: row.takeover_id,
      takeoverAddress: row.takeover_address,
      tokenName: row.token_name,
      contributionAmount: row.contribution_amount,
      isSuccessful: row.is_successful,
      customRewardRate: row.custom_reward_rate,
      // ✅ FIXED: Use correct static method syntax
      claimableAmount: ClaimsService.calculateClaimableAmount(row),
      tokenMint: row.is_successful ? row.v2_token_mint : row.v1_token_mint,
      claimType: row.is_successful ? 'reward' : 'refund',
      vault: row.vault,
      v1TokenMint: row.v1_token_mint,
      v2TokenMint: row.v2_token_mint,
      isClaimed: row.is_claimed || false,
      transactionSignature: row.transaction_signature,
      createdAt: row.created_at,
      claimSignature: row.claim_signature,
      claimedAt: row.claimed_at,
      // Calculate amounts - ✅ FIXED: Use correct static method syntax
      refundAmount: row.is_successful ? '0' : row.contribution_amount.toString(),
      rewardAmount: row.is_successful 
        ? ClaimsService.calculateRewardAmount(row.contribution_amount, row.custom_reward_rate)
        : '0'
    }));
  }

  static async processClaim(
    db: PoolClient,
    contributionId: number,
    contributor: string,
    takeoverAddress: string,
    transactionSignature: string,
    claimAmount?: string,
    claimType?: 'reward' | 'refund'
  ) {
    // First check if contribution exists and is valid
    const contributionResult = await db.query(`
      SELECT 
        c.*,
        t.address as takeover_address,
        t.is_finalized,
        t.is_successful,
        t.custom_reward_rate
      FROM contributions c
      JOIN takeovers t ON c.takeover_id = t.id
      WHERE c.id = $1 
        AND c.contributor = $2 
        AND t.address = $3
        AND t.is_finalized = true
        AND COALESCE(c.is_claimed, false) = false
    `, [contributionId, contributor, takeoverAddress]);

    if (contributionResult.rows.length === 0) {
      throw new NotFoundError('Contribution not found or already claimed');
    }

    const contribution = contributionResult.rows[0];
    
    // ✅ FIXED: Use correct static method syntax
    const finalClaimAmount = claimAmount || ClaimsService.calculateClaimableAmount(contribution);
    const finalClaimType = claimType || (contribution.is_successful ? 'reward' : 'refund');

    // Update contribution as claimed
    const updateQuery = `
      UPDATE contributions 
      SET 
        is_claimed = true,
        claim_signature = $1,
        claim_amount = $2,
        claim_type = $3,
        claimed_at = NOW()
      WHERE id = $4
      RETURNING *
    `;

    const result = await db.query(updateQuery, [
      transactionSignature,
      finalClaimAmount,
      finalClaimType,
      contributionId,
    ]);

    return result.rows[0];
  }

  // ✅ IMPROVED: Added input validation and better error handling
  private static calculateClaimableAmount(row: any): string {
    try {
      const contributionAmount = BigInt(row.contribution_amount || '0');
      const customRewardRate = Number(row.custom_reward_rate || 1);
      
      // Validate inputs
      if (contributionAmount < 0n) {
        throw new Error('Invalid contribution amount: cannot be negative');
      }
      
      if (customRewardRate < 0) {
        throw new Error('Invalid reward rate: cannot be negative');
      }
      
      if (row.is_successful) {
        // For successful takeovers, calculate reward amount
        // Use BigInt math to avoid precision issues
        const rewardAmount = contributionAmount * BigInt(Math.floor(customRewardRate * 10000)) / 10000n;
        return rewardAmount.toString();
      } else {
        // For failed takeovers, return original contribution (refund)
        return contributionAmount.toString();
      }
    } catch (error: any) {
      console.error('Error calculating claimable amount:', error);
      // Fallback to original contribution amount
      return (row.contribution_amount || '0').toString();
    }
  }

  // ✅ IMPROVED: Added input validation and BigInt precision
  private static calculateRewardAmount(contributionAmount: string, customRewardRate: number): string {
    try {
      const amount = BigInt(contributionAmount || '0');
      const rate = Number(customRewardRate || 1);
      
      // Validate inputs
      if (amount < 0n) {
        throw new Error('Invalid contribution amount: cannot be negative');
      }
      
      if (rate < 0) {
        throw new Error('Invalid reward rate: cannot be negative');
      }
      
      // Use BigInt math for precision
      const rewardAmount = amount * BigInt(Math.floor(rate * 10000)) / 10000n;
      return rewardAmount.toString();
    } catch (error: any) {
      console.error('Error calculating reward amount:', error);
      // Fallback to original amount
      return contributionAmount || '0';
    }
  }
}