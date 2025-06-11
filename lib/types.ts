// lib/types.ts - Complete TypeScript interfaces for billion-scale takeovers

import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";

// Updated interface for the expanded Takeover account from new IDL
export interface TakeoverAccount {
  publicKey: PublicKey;
  account: {
    // Basic takeover info (existing fields)
    authority: PublicKey;
    v1TokenMint: PublicKey;
    vault: PublicKey;
    startTime: BN;
    endTime: BN;
    totalContributed: BN;
    contributorCount: BN;
    isFinalized: boolean;
    isSuccessful: boolean;
    hasV2Mint: boolean;
    v2TokenMint: PublicKey;
    bump: number;
    
    // NEW: Billion-scale fields from updated IDL
    v1TotalSupply: BN;           // Total supply of V1 token
    v2TotalSupply: BN;           // Total supply of V2 token (equals v1TotalSupply)
    rewardPoolTokens: BN;        // 80% of v2TotalSupply for rewards
    liquidityPoolTokens: BN;     // 20% of v2TotalSupply for liquidity
    rewardRateBp: number;        // Reward rate in basis points (100-200 = 1.0x-2.0x)
    
    // Proportionate goal calculation with safety
    targetParticipationBp: number;   // Target participation rate in basis points
    calculatedMinAmount: BN;         // Auto-calculated minimum amount
    maxSafeTotalContribution: BN;    // Pre-calculated overflow limit (98% capacity)
    
    // Price and liquidity fields
    v1MarketPriceLamports: BN;   // V1 token price in lamports
    solForLiquidity: BN;         // SOL allocated for liquidity pool
    jupiterSwapCompleted: boolean; // Whether Jupiter swap is done
    lpCreated: boolean;          // Whether liquidity pool is created
    participationRateBp: number; // Current participation rate in basis points
  };
}

// Updated interface for database/API responses
export interface Takeover {
  id: number;
  address: string;
  authority: string;
  v1_token_mint: string;
  vault: string;
  
  // Time and contribution fields
  startTime: string;
  endTime: string;
  totalContributed: string;
  contributorCount: number;
  
  // Status fields
  isFinalized: boolean;
  isSuccessful: boolean;
  hasV2Mint: boolean;
  v2TokenMint?: string;
  
  // Legacy fields (for backward compatibility)
  minAmount: string; // Will be mapped from calculatedMinAmount
  customRewardRate: number; // Will be calculated from rewardRateBp
  
  // NEW: Billion-scale fields for database
  v1TotalSupply?: string;
  v2TotalSupply?: string;
  rewardPoolTokens?: string;
  liquidityPoolTokens?: string;
  rewardRateBp?: number;
  targetParticipationBp?: number;
  calculatedMinAmount?: string;
  maxSafeTotalContribution?: string;
  v1MarketPriceLamports?: string;
  solForLiquidity?: string;
  jupiterSwapCompleted?: boolean;
  lpCreated?: boolean;
  participationRateBp?: number;
  
  // Claim tracking
  totalClaimed?: string;
  claimedCount?: number;
  
  // Display fields
  status: 'active' | 'ended' | 'successful' | 'failed' | 'goal_reached';
  progressPercentage: number;
  created_at: string;
  tokenName: string;
  imageUrl?: string;
  finalize_tx?: string;
  finalized_at?: string;
}

// Contributor data interface
export interface ContributorData {
  wallet: PublicKey;
  takeover: PublicKey;
  contribution: BN;
  airdropAmount: BN;
  claimed: boolean;
  bump: number;
}

// Contribution interface for database
export interface Contribution {
  id: number;
  takeover_id: number;
  amount: string;
  contributor: string;
  transaction_signature: string;
  created_at: string;
  is_claimed?: boolean;
  claim_signature?: string;
  claim_amount?: string;
  claim_type?: 'reward' | 'refund';
  claimed_at?: string;
}

// Claim details interface
export interface ClaimDetails {
  id: number;
  takeoverId: number;
  takeoverAddress: string;
  tokenName: string;
  contributionAmount: string;
  isSuccessful: boolean;
  customRewardRate: number;
  claimableAmount: string;
  tokenMint: string;
  claimType: 'refund' | 'reward';
  vault: string;
  v1TokenMint: string;
  v2TokenMint?: string;
  refundAmount: string;
  rewardAmount: string;
  takeoverAuthority?: string;
  isClaimed: boolean;
  transactionSignature: string;
  createdAt: string;
}

// Billion-scale status interface
export interface BillionScaleStatus {
  v1SupplyBillions: number;
  v2SupplyBillions: number;
  contributedMillions: number;
  minAmountMillions: number;
  participationPercentage: number;
  rewardRateMultiplier: number;
  progressPercentage: number;
  isConservative: boolean;
  hasSafetyMargin: boolean;
  safeCapacityUtilization?: number;
  overflowRiskLevel: 'Low' | 'Medium' | 'High' | 'Unknown';
  remainingSafeCapacity?: number;
}

// API response interfaces
export interface TakeoversResponse {
  takeovers: Takeover[];
}

export interface ContributionsResponse {
  contributions: Contribution[];
}

export interface ClaimsResponse {
  success: boolean;
  claims: ClaimDetails[];
  count: number;
  error?: string;
}

export interface FinalizeResponse {
  success: boolean;
  takeover?: {
    id: number;
    address: string;
    tokenName: string;
    isSuccessful: boolean;
    v2TokenMint?: string;
    transactionSignature: string;
    finalizedAt: string;
  };
  error?: string;
}

// Helper functions to work with billion-scale data
export const BillionScaleHelpers = {
  // Convert basis points to decimal
  bpToDecimal: (bp: number): number => bp / 10000,
  
  // Convert basis points to percentage
  bpToPercent: (bp: number): number => bp / 100,
  
  // Format large token amounts with appropriate suffixes
  formatTokenAmount: (amount: string | BN | number, decimals: number = 6): string => {
    let num: number;
    if (typeof amount === 'string') {
      num = Number(amount);
    } else if (typeof amount === 'number') {
      num = amount;
    } else {
      num = amount.toNumber();
    }
    
    const scaled = num / Math.pow(10, decimals);
    
    if (scaled >= 1_000_000_000) {
      return `${(scaled / 1_000_000_000).toFixed(1)}B`;
    } else if (scaled >= 1_000_000) {
      return `${(scaled / 1_000_000).toFixed(1)}M`;
    } else if (scaled >= 1_000) {
      return `${(scaled / 1_000).toFixed(1)}K`;
    } else {
      return scaled.toFixed(2);
    }
  },
  
  // Format SOL amounts
  formatSolAmount: (lamports: string | number): string => {
    const sol = Number(lamports) / 1_000_000_000;
    if (sol >= 1) {
      return `${sol.toFixed(3)} SOL`;
    } else {
      return `${(sol * 1000).toFixed(2)} mSOL`;
    }
  },
  
  // Calculate user's conservative V2 allocation
  calculateConservativeV2Allocation: (
    userContribution: BN | string | number,
    totalContributed: BN | string | number,
    rewardRateBp: number,
    rewardPoolTokens: BN | string | number,
    safetyMarginBp: number = 200 // 2% safety margin
  ): number => {
    const userContrib = typeof userContribution === 'number' ? userContribution : 
                       typeof userContribution === 'string' ? Number(userContribution) : 
                       userContribution.toNumber();
    const totalContrib = typeof totalContributed === 'number' ? totalContributed : 
                        typeof totalContributed === 'string' ? Number(totalContributed) : 
                        totalContributed.toNumber();
    const rewardPool = typeof rewardPoolTokens === 'number' ? rewardPoolTokens : 
                      typeof rewardPoolTokens === 'string' ? Number(rewardPoolTokens) : 
                      rewardPoolTokens.toNumber();
    
    if (userContrib === 0 || totalContrib === 0) {
      return 0;
    }
    
    const rewardRate = rewardRateBp / 10000;
    const safetyMultiplier = (10000 - safetyMarginBp) / 10000; // 98% of capacity
    const safeRewardPool = rewardPool * safetyMultiplier;
    
    // Calculate total V2 needed
    const totalV2Needed = totalContrib * rewardRate;
    
    if (totalV2Needed <= safeRewardPool) {
      // No overflow: normal calculation
      return userContrib * rewardRate;
    } else {
      // Conservative scaling (should rarely happen with proper setup)
      const scaleFactor = safeRewardPool / totalV2Needed;
      return userContrib * rewardRate * scaleFactor;
    }
  },
  
  // Get billion-scale status summary
  getBillionScaleStatus: (takeover: Takeover): BillionScaleStatus => {
    const rewardRate = takeover.rewardRateBp ? takeover.rewardRateBp / 100 : takeover.customRewardRate * 100;
    const participationRate = takeover.participationRateBp ? takeover.participationRateBp / 100 : 0;
    
    return {
      v1SupplyBillions: takeover.v1TotalSupply ? Number(takeover.v1TotalSupply) / 1e15 : 0, // Assuming 6 decimals
      v2SupplyBillions: takeover.v2TotalSupply ? Number(takeover.v2TotalSupply) / 1e15 : 0,
      contributedMillions: Number(takeover.totalContributed) / 1e12, // 6 decimals
      minAmountMillions: Number(takeover.calculatedMinAmount || takeover.minAmount) / 1e12,
      participationPercentage: participationRate,
      rewardRateMultiplier: rewardRate / 100,
      progressPercentage: takeover.progressPercentage,
      isConservative: (takeover.rewardRateBp || 0) <= 200, // Max 2.0x
      hasSafetyMargin: true, // Always true for billion-scale takeovers
      safeCapacityUtilization: takeover.maxSafeTotalContribution ? 
        (Number(takeover.totalContributed) / Number(takeover.maxSafeTotalContribution)) * 100 : undefined,
      overflowRiskLevel: takeover.maxSafeTotalContribution ? 
        (() => {
          const utilization = Number(takeover.totalContributed) / Number(takeover.maxSafeTotalContribution);
          if (utilization < 0.8) return 'Low';
          if (utilization < 0.95) return 'Medium';
          return 'High';
        })() : 'Unknown',
      remainingSafeCapacity: takeover.maxSafeTotalContribution ? 
        Number(takeover.maxSafeTotalContribution) - Number(takeover.totalContributed) : undefined
    };
  },
  
  // Validate billion-scale parameters
  validateBillionScaleParams: (params: {
    rewardRateBp: number;
    targetParticipationBp: number;
    v1MarketPriceLamports: number;
    duration: number;
  }): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    if (params.rewardRateBp < 100 || params.rewardRateBp > 200) {
      errors.push("Reward rate must be between 100 (1.0x) and 200 (2.0x) basis points for safety");
    }
    
    if (params.targetParticipationBp < 100 || params.targetParticipationBp > 10000) {
      errors.push("Target participation must be between 100 (1%) and 10000 (100%) basis points");
    }
    
    if (params.v1MarketPriceLamports <= 0) {
      errors.push("V1 market price must be greater than 0 lamports");
    }
    
    if (params.duration < 1 || params.duration > 30) {
      errors.push("Duration must be between 1 and 30 days");
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  },
  
  // Calculate expected outcomes
  calculateExpectedOutcomes: (takeover: Takeover, userContribution: number): {
    v2Tokens: number;
    refundTokens: number;
    probability: number;
  } => {
    const remainingNeeded = Number(takeover.calculatedMinAmount || takeover.minAmount) - Number(takeover.totalContributed);
    const timeRemaining = parseInt(takeover.endTime) - Math.floor(Date.now() / 1000);
    
    // Simple probability calculation based on current progress and time remaining
    const progressFactor = Math.min(1, Number(takeover.totalContributed) / Number(takeover.calculatedMinAmount || takeover.minAmount));
    const timeFactor = Math.max(0, Math.min(1, timeRemaining / (7 * 24 * 3600))); // Normalize to 7 days
    const probability = Math.min(0.95, progressFactor * 0.7 + timeFactor * 0.3);
    
    const rewardRate = takeover.rewardRateBp ? takeover.rewardRateBp / 100 : takeover.customRewardRate;
    
    return {
      v2Tokens: userContribution * rewardRate,
      refundTokens: userContribution,
      probability
    };
  }
};

// Export helper type guards
export const isValidTakeover = (obj: any): obj is Takeover => {
  return obj && 
         typeof obj.id === 'number' &&
         typeof obj.address === 'string' &&
         typeof obj.authority === 'string' &&
         typeof obj.totalContributed === 'string';
};

export const isBillionScaleTakeover = (takeover: Takeover): boolean => {
  return !!(takeover.rewardRateBp && takeover.v1TotalSupply && takeover.calculatedMinAmount);
};

// Constants for billion-scale operations
export const BILLION_SCALE_CONSTANTS = {
  MAX_REWARD_RATE_BP: 200, // 2.0x maximum
  MIN_REWARD_RATE_BP: 100, // 1.0x minimum
  SAFETY_MARGIN_BP: 200,   // 2% safety cushion
  REWARD_POOL_PERCENTAGE: 80, // 80% for rewards
  LIQUIDITY_POOL_PERCENTAGE: 20, // 20% for liquidity
  MAX_DURATION_DAYS: 30,
  TOKEN_DECIMALS: 6,
  MAX_CONTRIBUTION_PER_TX: 100_000_000, // 100M tokens max per contribution
} as const;