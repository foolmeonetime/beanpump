// lib/utils/takeover-calculations.ts
// Utility functions for safely processing takeover data and calculations

export interface RawTakeoverData {
  id: number;
  address: string;
  authority: string;
  v1_token_mint: string;
  vault: string;
  min_amount?: string;
  start_time?: string;
  end_time?: string;
  total_contributed?: string;
  contributor_count?: number;
  is_finalized?: boolean;
  is_successful?: boolean;
  custom_reward_rate?: number;
  token_name?: string;
  image_url?: string;
  created_at?: string;
  reward_rate_bp?: number;
  calculated_min_amount?: string;
  max_safe_total_contribution?: string;
  target_participation_bp?: number;
  v1_market_price_lamports?: string;
  signature?: string;
  [key: string]: any; // Allow for additional fields
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
  customRewardRate: number;
  tokenName: string;
  imageUrl?: string;
  created_at?: string;
  status: string;
  // Billion-scale fields
  rewardRateBp?: number;
  calculatedMinAmount?: string;
  maxSafeTotalContribution?: string;
  targetParticipationBp?: number;
  v1MarketPriceLamports?: string;
  signature?: string;
  isBillionScale: boolean;
  // Calculated fields
  progressPercentage: number;
  timeRemaining?: number;
  isExpired: boolean;
  isGoalMet: boolean;
  canFinalize: boolean;
}

/**
 * Safe number parsing with fallback
 */
export function safeParseFloat(value: any, fallback: number = 0): number {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  
  if (isNaN(num)) {
    return fallback;
  }
  
  return num;
}

/**
 * Safe integer parsing with fallback
 */
export function safeParseInt(value: any, fallback: number = 0): number {
  if (value === null || value === undefined || value === '') {
    return fallback;
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
    return BigInt(value);
  } catch {
    return fallback;
  }
}

/**
 * Calculate takeover status based on current state
 */
export function calculateTakeoverStatus(takeover: RawTakeoverData): string {
  const now = Math.floor(Date.now() / 1000);
  const endTime = safeParseInt(takeover.end_time);
  const minAmount = takeover.calculated_min_amount || takeover.min_amount || "0";
  const totalContributed = takeover.total_contributed || "0";
  
  // Use BigInt for precise comparison of large numbers
  const isGoalMet = safeParseBigInt(totalContributed) >= safeParseBigInt(minAmount);
  
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
export function calculateProgressPercentage(contributed: string, target: string): number {
  const contributedNum = safeParseFloat(contributed);
  const targetNum = safeParseFloat(target);
  
  if (targetNum === 0) return 0;
  return Math.min((contributedNum / targetNum) * 100, 100);
}

/**
 * Calculate time remaining in seconds
 */
export function calculateTimeRemaining(endTime: string): number {
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
 * Main function to process raw takeover data into a consistent format
 */
export function processTakeoverCalculations(rawTakeover: RawTakeoverData): ProcessedTakeoverData {
  try {
    // Normalize field names (handle both snake_case and camelCase)
    const minAmount = rawTakeover.calculated_min_amount || rawTakeover.min_amount || '1000000';
    const startTime = rawTakeover.start_time?.toString() || '0';
    const endTime = rawTakeover.end_time?.toString() || '0';
    const totalContributed = rawTakeover.total_contributed?.toString() || '0';
    const contributorCount = rawTakeover.contributor_count || 0;
    const isFinalized = rawTakeover.is_finalized || false;
    const isSuccessful = rawTakeover.is_successful || false;
    const customRewardRate = rawTakeover.custom_reward_rate || 1.5;
    const tokenName = rawTakeover.token_name || 'Unknown Token';
    const imageUrl = rawTakeover.image_url;
    
    // Calculate derived fields
    const status = calculateTakeoverStatus(rawTakeover);
    const progressPercentage = calculateProgressPercentage(totalContributed, minAmount);
    const timeRemaining = calculateTimeRemaining(endTime);
    const isExpired = timeRemaining <= 0;
    const isGoalMet = safeParseBigInt(totalContributed) >= safeParseBigInt(minAmount);
    const canFinalize = !isFinalized && (isGoalMet || isExpired);
    const isBillionScale = isBillionScaleTakeover(rawTakeover);
    
    const processedTakeover: ProcessedTakeoverData = {
      // Basic fields
      id: rawTakeover.id,
      address: rawTakeover.address,
      authority: rawTakeover.authority,
      v1_token_mint: rawTakeover.v1_token_mint,
      vault: rawTakeover.vault,
      
      // Normalized fields
      minAmount,
      startTime,
      endTime,
      totalContributed,
      contributorCount,
      isFinalized,
      isSuccessful,
      customRewardRate,
      tokenName,
      imageUrl,
      created_at: rawTakeover.created_at,
      
      // Billion-scale fields
      rewardRateBp: rawTakeover.reward_rate_bp,
      calculatedMinAmount: rawTakeover.calculated_min_amount,
      maxSafeTotalContribution: rawTakeover.max_safe_total_contribution,
      targetParticipationBp: rawTakeover.target_participation_bp,
      v1MarketPriceLamports: rawTakeover.v1_market_price_lamports,
      signature: rawTakeover.signature,
      isBillionScale,
      
      // Calculated fields
      status,
      progressPercentage,
      timeRemaining: isExpired ? undefined : timeRemaining,
      isExpired,
      isGoalMet,
      canFinalize,
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
      customRewardRate: 1.5,
      tokenName: 'Unknown Token',
      imageUrl: undefined,
      created_at: rawTakeover.created_at,
      status: 'unknown',
      rewardRateBp: undefined,
      calculatedMinAmount: undefined,
      maxSafeTotalContribution: undefined,
      targetParticipationBp: undefined,
      v1MarketPriceLamports: undefined,
      signature: undefined,
      isBillionScale: false,
      progressPercentage: 0,
      timeRemaining: undefined,
      isExpired: true,
      isGoalMet: false,
      canFinalize: false,
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
      description: 'Currently accepting contributions',
    },
    successful: {
      variant: 'success' as const,
      icon: '✅',
      color: 'text-green-600',
      description: 'Takeover completed successfully',
    },
    failed: {
      variant: 'destructive' as const,
      icon: '❌',
      color: 'text-red-600',
      description: 'Takeover failed to reach goal',
    },
    expired: {
      variant: 'outline' as const,
      icon: '⏰',
      color: 'text-orange-600',
      description: 'Time limit reached',
    },
    finalized: {
      variant: 'secondary' as const,
      icon: '🏁',
      color: 'text-gray-600',
      description: 'Takeover has been finalized',
    },
    unknown: {
      variant: 'outline' as const,
      icon: '❓',
      color: 'text-gray-600',
      description: 'Status unknown',
    },
  };
  
  return configs[status as keyof typeof configs] || configs.unknown;
}