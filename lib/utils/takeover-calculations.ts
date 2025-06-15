// lib/utils/takeover-calculations.ts - Complete calculations for your bigint schema
export interface RawTakeoverData {
  id: number;
  address: string;
  authority: string;
  v1_token_mint: string;
  vault: string;
  min_amount?: string | number;
  start_time?: string | number;
  end_time?: string | number;
  total_contributed?: string | number;
  contributor_count?: number;
  is_finalized?: boolean;
  is_successful?: boolean;
  has_v2_mint?: boolean;
  v2_token_mint?: string;
  v2_total_supply?: string | number;
  custom_reward_rate?: number;
  token_name?: string;
  image_url?: string;
  v1_total_supply?: string | number;
  reward_pool_tokens?: string | number;
  liquidity_pool_tokens?: string | number;
  reward_rate_bp?: number;
  target_participation_bp?: number;
  calculated_min_amount?: string | number;
  max_safe_total_contribution?: string | number;
  v1_market_price_lamports?: string | number;
  sol_for_liquidity?: string | number;
  jupiter_swap_completed?: boolean;
  lp_created?: boolean;
  participation_rate_bp?: number;
  final_safety_utilization?: number;
  final_reward_rate?: number;
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
}

export interface ProcessedTakeoverData {
  id: number;
  address: string;
  authority: string;
  v1_token_mint: string;
  vault: string;
  minAmount: string;
  startTime: string;
  endTime: string;
  totalContributed: string;
  contributorCount: number;
  isFinalized: boolean;
  isSuccessful: boolean;
  hasV2Mint: boolean;
  v2TokenMint?: string;
  v2TotalSupply?: string;
  customRewardRate: number;
  tokenName: string;
  imageUrl?: string;
  v1TotalSupply?: string;
  rewardPoolTokens?: string;
  liquidityPoolTokens?: string;
  solForLiquidity?: string;
  jupiterSwapCompleted?: boolean;
  lpCreated?: boolean;
  created_at?: string;
  updated_at?: string;
  status: string;
  // Billion-scale fields
  rewardRateBp?: number;
  calculatedMinAmount?: string;
  maxSafeTotalContribution?: string;
  targetParticipationBp?: number;
  v1MarketPriceLamports?: string;
  participationRateBp?: number;
  finalSafetyUtilization?: number;
  finalRewardRate?: number;
  isBillionScale: boolean;
  // Calculated fields
  progressPercentage: number;
  timeRemaining?: number;
  isExpired: boolean;
  isGoalMet: boolean;
  canFinalize: boolean;
  effectiveMinAmount: string;
}

/**
 * Safe number parsing with fallback - handles string, number, and bigint
 */
export function safeParseFloat(value: any, fallback: number = 0): number {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  
  // Handle bigint
  if (typeof value === 'bigint') {
    return Number(value);
  }
  
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  
  if (isNaN(num)) {
    return fallback;
  }
  
  return num;
}

/**
 * Safe integer parsing with fallback - handles string, number, and bigint
 */
export function safeParseInt(value: any, fallback: number = 0): number {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  
  // Handle bigint
  if (typeof value === 'bigint') {
    return Number(value);
  }
  
  const num = typeof value === 'string' ? parseInt(value) : Number(value);
  
  if (isNaN(num)) {
    return fallback;
  }
  
  return num;
}

/**
 * Safe BigInt parsing with fallback
 */
export function safeParseBigInt(value: any, fallback: bigint = BigInt(0)): bigint {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  
  try {
    if (typeof value === 'bigint') {
      return value;
    }
    return BigInt(value);
  } catch {
    return fallback;
  }
}

/**
 * Convert various timestamp formats to string
 */
export function normalizeTimestamp(value: any): string {
  if (value === null || value === undefined) {
    return '0';
  }
  
  // If it's already a string, return it
  if (typeof value === 'string') {
    return value;
  }
  
  // If it's a number, bigint, convert to string
  if (typeof value === 'number' || typeof value === 'bigint') {
    return value.toString();
  }
  
  // If it's a Date object, convert to Unix timestamp
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000).toString();
  }
  
  // Fallback
  return '0';
}

/**
 * Convert various amount formats to string
 */
export function normalizeAmount(value: any): string {
  if (value === null || value === undefined) {
    return '0';
  }
  
  // If it's already a string, return it
  if (typeof value === 'string') {
    return value;
  }
  
  // If it's a number or bigint, convert to string
  if (typeof value === 'number' || typeof value === 'bigint') {
    return value.toString();
  }
  
  // Fallback
  return '0';
}

/**
 * Calculate takeover status based on current state
 */
export function calculateTakeoverStatus(takeover: RawTakeoverData): string {
  const now = Math.floor(Date.now() / 1000);
  const endTime = safeParseInt(takeover.end_time);
  
  // Determine effective minimum amount (billion-scale vs regular)
  const effectiveMinAmount = takeover.calculated_min_amount || takeover.min_amount || "0";
  const totalContributed = normalizeAmount(takeover.total_contributed || "0");
  
  // Use BigInt for precise comparison of large numbers
  const isGoalMet = safeParseBigInt(totalContributed) >= safeParseBigInt(effectiveMinAmount);
  
  if (takeover.is_finalized) {
    return takeover.is_successful ? 'successful' : 'failed';
  }
  
  if (now >= endTime) {
    return 'expired';
  }
  
  return 'active';
}

/**
 * Calculate progress percentage
 */
export function calculateProgressPercentage(contributed: string | number, target: string | number): number {
  const contributedNum = safeParseFloat(contributed);
  const targetNum = safeParseFloat(target);
  
  if (targetNum === 0) return 0;
  return Math.min((contributedNum / targetNum) * 100, 100);
}

/**
 * Calculate time remaining in seconds
 */
export function calculateTimeRemaining(endTime: string | number): number {
  const now = Math.floor(Date.now() / 1000);
  const end = safeParseInt(endTime);
  return Math.max(0, end - now);
}

/**
 * Format amount for display (converts lamports to human-readable tokens)
 */
export function formatAmount(amount: string | number, decimals: number = 6): string {
  const num = safeParseFloat(amount);
  
  if (num === 0) return '0';
  
  // Convert from lamports to tokens (default 6 decimals)
  const tokens = num / Math.pow(10, decimals);
  
  if (tokens >= 1_000_000_000) {
    return `${(tokens / 1_000_000_000).toFixed(1)}B`;
  } else if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  } else if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  } else if (tokens >= 1) {
    return tokens.toFixed(2);
  } else {
    return tokens.toFixed(6);
  }
}

/**
 * Format time duration for display
 */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return 'Expired';
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) {
    return `${days}d ${hours}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

/**
 * Check if takeover is billion-scale based on available fields
 */
export function isBillionScaleTakeover(takeover: RawTakeoverData): boolean {
  return takeover.reward_rate_bp !== null && 
         takeover.reward_rate_bp !== undefined &&
         takeover.calculated_min_amount !== null &&
         takeover.calculated_min_amount !== undefined;
}

/**
 * Get the effective minimum amount (billion-scale takes precedence)
 */
export function getEffectiveMinAmount(takeover: RawTakeoverData): string {
  return normalizeAmount(takeover.calculated_min_amount || takeover.min_amount || '1000000');
}

/**
 * Calculate participation rate if possible
 */
export function calculateParticipationRate(takeover: RawTakeoverData): number {
  if (!takeover.v1_total_supply || !takeover.total_contributed) {
    return 0;
  }
  
  const totalSupply = safeParseFloat(takeover.v1_total_supply);
  const contributed = safeParseFloat(takeover.total_contributed);
  
  if (totalSupply === 0) return 0;
  
  return (contributed / totalSupply) * 100;
}

/**
 * Check if takeover has V2 migration capabilities
 */
export function hasV2Capabilities(takeover: RawTakeoverData): boolean {
  return takeover.has_v2_mint === true && 
         takeover.v2_token_mint !== null && 
         takeover.v2_token_mint !== undefined;
}

/**
 * Main function to process raw takeover data into a consistent format
 */
export function processTakeoverCalculations(rawTakeover: RawTakeoverData): ProcessedTakeoverData {
  try {
    // Normalize all field names and handle data conversion
    const effectiveMinAmount = getEffectiveMinAmount(rawTakeover);
    const minAmount = normalizeAmount(rawTakeover.min_amount || '1000000');
    const startTime = normalizeTimestamp(rawTakeover.start_time || '0');
    const endTime = normalizeTimestamp(rawTakeover.end_time || '0');
    const totalContributed = normalizeAmount(rawTakeover.total_contributed || '0');
    const contributorCount = rawTakeover.contributor_count || 0;
    const isFinalized = rawTakeover.is_finalized || false;
    const isSuccessful = rawTakeover.is_successful || false;
    const hasV2Mint = rawTakeover.has_v2_mint || false;
    const customRewardRate = rawTakeover.custom_reward_rate || 1.5;
    const tokenName = rawTakeover.token_name || 'Unknown Token';
    const imageUrl = rawTakeover.image_url;
    
    // Calculate derived fields
    const status = calculateTakeoverStatus(rawTakeover);
    const progressPercentage = calculateProgressPercentage(totalContributed, effectiveMinAmount);
    const timeRemaining = calculateTimeRemaining(endTime);
    const isExpired = timeRemaining <= 0;
    const isGoalMet = safeParseBigInt(totalContributed) >= safeParseBigInt(effectiveMinAmount);
    const canFinalize = !isFinalized && (isGoalMet || isExpired);
    const isBillionScale = isBillionScaleTakeover(rawTakeover);
    
    const processedTakeover: ProcessedTakeoverData = {
      // Basic fields
      id: rawTakeover.id,
      address: rawTakeover.address,
      authority: rawTakeover.authority,
      v1_token_mint: rawTakeover.v1_token_mint,
      vault: rawTakeover.vault,
      
      // Normalized amount and time fields (all as strings for consistency)
      minAmount,
      startTime,
      endTime,
      totalContributed,
      contributorCount,
      isFinalized,
      isSuccessful,
      hasV2Mint,
      customRewardRate,
      tokenName,
      imageUrl,
      created_at: rawTakeover.created_at,
      updated_at: rawTakeover.updated_at,
      
      // V2 and additional fields
      v2TokenMint: rawTakeover.v2_token_mint,
      v2TotalSupply: normalizeAmount(rawTakeover.v2_total_supply),
      v1TotalSupply: normalizeAmount(rawTakeover.v1_total_supply),
      rewardPoolTokens: normalizeAmount(rawTakeover.reward_pool_tokens),
      liquidityPoolTokens: normalizeAmount(rawTakeover.liquidity_pool_tokens),
      solForLiquidity: normalizeAmount(rawTakeover.sol_for_liquidity),
      jupiterSwapCompleted: rawTakeover.jupiter_swap_completed || false,
      lpCreated: rawTakeover.lp_created || false,
      
      // Billion-scale fields
      rewardRateBp: rawTakeover.reward_rate_bp,
      calculatedMinAmount: normalizeAmount(rawTakeover.calculated_min_amount),
      maxSafeTotalContribution: normalizeAmount(rawTakeover.max_safe_total_contribution),
      targetParticipationBp: rawTakeover.target_participation_bp,
      v1MarketPriceLamports: normalizeAmount(rawTakeover.v1_market_price_lamports),
      participationRateBp: rawTakeover.participation_rate_bp,
      finalSafetyUtilization: rawTakeover.final_safety_utilization,
      finalRewardRate: rawTakeover.final_reward_rate,
      isBillionScale,
      
      // Calculated fields
      status,
      progressPercentage,
      timeRemaining: isExpired ? undefined : timeRemaining,
      isExpired,
      isGoalMet,
      canFinalize,
      effectiveMinAmount,
    };
    
    return processedTakeover;
    
  } catch (error) {
    console.error('Error processing takeover calculations:', error);
    console.error('Raw takeover data:', rawTakeover);
    
    // Return a safe fallback object
    return {
      id: rawTakeover.id || 0,
      address: rawTakeover.address || '',
      authority: rawTakeover.authority || '',
      v1_token_mint: rawTakeover.v1_token_mint || '',
      vault: rawTakeover.vault || '',
      minAmount: '1000000',
      startTime: '0',
      endTime: '0',
      totalContributed: '0',
      contributorCount: 0,
      isFinalized: false,
      isSuccessful: false,
      hasV2Mint: false,
      customRewardRate: 1.5,
      tokenName: 'Unknown Token',
      imageUrl: undefined,
      created_at: rawTakeover.created_at,
      updated_at: rawTakeover.updated_at,
      status: 'unknown',
      rewardRateBp: undefined,
      calculatedMinAmount: undefined,
      maxSafeTotalContribution: undefined,
      targetParticipationBp: undefined,
      v1MarketPriceLamports: undefined,
      v1TotalSupply: undefined,
      v2TotalSupply: undefined,
      v2TokenMint: undefined,
      rewardPoolTokens: undefined,
      liquidityPoolTokens: undefined,
      solForLiquidity: undefined,
      participationRateBp: undefined,
      finalSafetyUtilization: undefined,
      finalRewardRate: undefined,
      jupiterSwapCompleted: false,
      lpCreated: false,
      isBillionScale: false,
      progressPercentage: 0,
      timeRemaining: undefined,
      isExpired: true,
      isGoalMet: false,
      canFinalize: false,
      effectiveMinAmount: '1000000',
    };
  }
}

/**
 * Batch process multiple takeovers
 */
export function processTakeoversArray(rawTakeovers: RawTakeoverData[]): ProcessedTakeoverData[] {
  return rawTakeovers.map(processTakeoverCalculations);
}

/**
 * Get status badge configuration for UI components
 */
export function getStatusConfig(status: string) {
  const configs = {
    active: {
      variant: 'default' as const,
      icon: '🟢',
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      description: 'Currently accepting contributions',
    },
    successful: {
      variant: 'success' as const,
      icon: '✅',
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      description: 'Takeover completed successfully',
    },
    failed: {
      variant: 'destructive' as const,
      icon: '❌',
      color: 'text-red-600',
      bgColor: 'bg-red-100',
      description: 'Takeover failed to reach goal',
    },
    expired: {
      variant: 'outline' as const,
      icon: '⏰',
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
      description: 'Time limit reached',
    },
    finalized: {
      variant: 'secondary' as const,
      icon: '🏁',
      color: 'text-gray-600',
      bgColor: 'bg-gray-100',
      description: 'Takeover has been finalized',
    },
    unknown: {
      variant: 'outline' as const,
      icon: '❓',
      color: 'text-gray-600',
      bgColor: 'bg-gray-100',
      description: 'Status unknown',
    },
  };
  
  return configs[status as keyof typeof configs] || configs.unknown;
}

/**
 * Calculate estimated rewards for a contribution amount
 */
export function calculateEstimatedRewards(
  contributionAmount: string | number,
  takeover: ProcessedTakeoverData
): {
  v1Tokens: number;
  v2Tokens: number;
  rewardMultiplier: number;
} {
  const contribution = safeParseFloat(contributionAmount);
  
  if (takeover.isBillionScale && takeover.rewardRateBp) {
    // Billion-scale calculation
    const rewardMultiplier = takeover.rewardRateBp / 10000; // Convert BP to decimal
    const v1Tokens = contribution;
    const v2Tokens = contribution * rewardMultiplier;
    
    return {
      v1Tokens,
      v2Tokens,
      rewardMultiplier,
    };
  } else {
    // Regular takeover calculation
    const rewardMultiplier = takeover.customRewardRate;
    const v1Tokens = contribution;
    const v2Tokens = contribution * rewardMultiplier;
    
    return {
      v1Tokens,
      v2Tokens,
      rewardMultiplier,
    };
  }
}