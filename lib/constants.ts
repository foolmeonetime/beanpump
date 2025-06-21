export const PROGRAM_ID = "CJxUrvjAXL2PR2bK8vANxLJiWWRXbyaFvzzF9cMgYmfJ"
export const TREASURY_ADDRESS = process.env.NEXT_PUBLIC_TREASURY_ADDRESS || "JhSgWvuJ2tKZPkXSoseFAUEsxav356Tr5pS2oWXV4BT";
export const RPC_ENDPOINT = process.env.NEXT_PUBLIC_RPC_URL || process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
export const SECONDS_PER_DAY = 86400
export const MAX_DURATION_DAYS = 30
export const V2_TOTAL_SUPPLY = 10000000
export const TOKEN_DECIMALS = 6;

// Enhanced constants for billion-scale operations
export const BILLION = 1_000_000_000_000_000; // 1B with 6 decimals
export const REWARD_POOL_PERCENTAGE = 80; // 80% for rewards
export const LIQUIDITY_POOL_PERCENTAGE = 20; // 20% for LP
export const MAX_REWARD_RATE_BP = 200; // Max 2.0x (conservative)
export const MIN_REWARD_RATE_BP = 100; // Min 1.0x
export const OVERFLOW_CUSHION_BP = 200; // 2% safety cushion

// Default values for initialization
export const DEFAULT_REWARD_RATE_BP = 150; // 1.5x default
export const DEFAULT_TARGET_PARTICIPATION_BP = 500; // 5% default
export const DEFAULT_DURATION_DAYS = 7; // 7 days default

// Enhanced validation result interface
export interface ValidationResult {
  valid: boolean;
  message?: string;
}

// Enhanced validation functions
export function validateRewardRate(rateBp: number): ValidationResult {
  if (rateBp >= MIN_REWARD_RATE_BP && rateBp <= MAX_REWARD_RATE_BP) {
    return { valid: true };
  }
  return {
    valid: false,
    message: `Reward rate must be between ${MIN_REWARD_RATE_BP}bp and ${MAX_REWARD_RATE_BP}bp (1.0x to 2.0x)`
  };
}

export function validateParticipationRate(rateBp: number): ValidationResult {
  if (rateBp > 0 && rateBp <= 10000) {
    return { valid: true };
  }
  return {
    valid: false,
    message: 'Participation rate must be between 0.01% and 100%'
  };
}

export function validateDuration(days: number): ValidationResult {
  if (days >= 1 && days <= MAX_DURATION_DAYS) {
    return { valid: true };
  }
  return {
    valid: false,
    message: `Duration must be between 1 and ${MAX_DURATION_DAYS} days`
  };
}

export function validateTokenSupply(supply: number | string): ValidationResult {
  const supplyNum = typeof supply === 'string' ? parseFloat(supply) : supply;
  
  if (isNaN(supplyNum) || supplyNum <= 0) {
    return {
      valid: false,
      message: 'Token supply must be greater than 0'
    };
  }
  
  if (supplyNum < 1_000_000) { // At least 1M tokens
    return {
      valid: false,
      message: 'Token supply must be at least 1M tokens for billion-scale operations'
    };
  }
  
  if (supplyNum > 1_000_000_000_000) { // Max 1T tokens
    return {
      valid: false,
      message: 'Token supply seems too large - please verify (max 1T tokens)'
    };
  }
  
  return { valid: true };
}

export function validateTokenMint(mintAddress: string): ValidationResult {
  try {
    // Basic validation - check if it's a valid base58 string of correct length
    if (!mintAddress || mintAddress.length < 32 || mintAddress.length > 44) {
      return {
        valid: false,
        message: 'Token mint address must be 32-44 characters long'
      };
    }
    
    // Check for valid base58 characters (basic check)
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    if (!base58Regex.test(mintAddress)) {
      return {
        valid: false,
        message: 'Token mint address contains invalid characters'
      };
    }
    
    return { valid: true };
  } catch {
    return {
      valid: false,
      message: 'Invalid token mint address format'
    };
  }
}

export function validateSolPrice(priceStr: string): ValidationResult {
  const price = parseFloat(priceStr);
  
  if (isNaN(price) || price <= 0) {
    return {
      valid: false,
      message: 'Price must be greater than 0'
    };
  }
  
  if (price < 0.000000001) {
    return {
      valid: false,
      message: 'Price too small (minimum 0.000000001 SOL)'
    };
  }
  
  if (price > 1000) {
    return {
      valid: false,
      message: 'Price too large (maximum 1000 SOL)'
    };
  }
  
  return { valid: true };
}

// Enhanced token supply formatting
export function formatTokenSupply(supply: number | string): string {
  const num = typeof supply === 'string' ? parseFloat(supply) : supply;
  if (isNaN(num) || num === 0) return "0";
  
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1)}B`;
  } else if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  } else if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

// Enhanced billion-scale parameter validation
export function validateBillionScaleParams(params: {
  rewardRateBp: number;
  targetParticipationBp: number;
  v1MarketPriceLamports: number;
  duration: number;
  totalSupply?: number;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  const rewardValidation = validateRewardRate(params.rewardRateBp);
  if (!rewardValidation.valid) {
    errors.push(rewardValidation.message!);
  }
  
  const participationValidation = validateParticipationRate(params.targetParticipationBp);
  if (!participationValidation.valid) {
    errors.push(participationValidation.message!);
  }
  
  const durationValidation = validateDuration(params.duration);
  if (!durationValidation.valid) {
    errors.push(durationValidation.message!);
  }
  
  if (params.v1MarketPriceLamports <= 0) {
    errors.push("V1 market price must be greater than 0 lamports");
  }
  
  if (params.totalSupply !== undefined) {
    const supplyValidation = validateTokenSupply(params.totalSupply);
    if (!supplyValidation.valid) {
      errors.push(supplyValidation.message!);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Helper function to convert SOL to lamports
export function solToLamports(solAmount: string | number): string {
  const sol = typeof solAmount === 'string' ? parseFloat(solAmount) : solAmount;
  if (isNaN(sol)) return "0";
  
  const lamports = sol * 1_000_000_000; // 1 SOL = 1B lamports
  return Math.floor(lamports).toString();
}

// Helper function to convert lamports to SOL
export function lamportsToSol(lamports: string | number): string {
  const lamportNum = typeof lamports === 'string' ? parseFloat(lamports) : lamports;
  if (isNaN(lamportNum)) return "0";
  
  const sol = lamportNum / 1_000_000_000;
  return sol.toString();
}

// Enhanced calculation for goal preview
export function calculateGoalTokens(
  totalSupply: number,
  targetParticipationBp: number
): number {
  return Math.floor(totalSupply * targetParticipationBp / 10000);
}

// Enhanced calculation for reward pool
export function calculateRewardPool(totalSupply: number): number {
  return Math.floor(totalSupply * REWARD_POOL_PERCENTAGE / 100);
}

// Enhanced calculation for liquidity pool
export function calculateLiquidityPool(totalSupply: number): number {
  return Math.floor(totalSupply * LIQUIDITY_POOL_PERCENTAGE / 100);
}

// Enhanced calculation for max safe contribution
export function calculateMaxSafeContribution(
  rewardPoolTokens: number,
  rewardRateBp: number
): number {
  const rewardRate = rewardRateBp / 10000;
  const safetyMultiplier = (10000 - OVERFLOW_CUSHION_BP) / 10000; // 98% safety
  return Math.floor((rewardPoolTokens * safetyMultiplier) / rewardRate);
}

// Additional utility functions for billion-scale operations
export function formatLargeNumber(num: number | string): string {
  const numValue = typeof num === 'string' ? parseFloat(num) : num;
  if (isNaN(numValue)) return "0";
  
  if (numValue >= 1_000_000_000) {
    return `${(numValue / 1_000_000_000).toFixed(1)}B`;
  } else if (numValue >= 1_000_000) {
    return `${(numValue / 1_000_000).toFixed(1)}M`;
  } else if (numValue >= 1_000) {
    return `${(numValue / 1_000).toFixed(1)}K`;
  }
  return numValue.toLocaleString();
}

export function getSafetyLevel(utilization: number): 'safe' | 'warning' | 'danger' {
  if (utilization < 0.8) return 'safe';
  if (utilization < 0.95) return 'warning';
  return 'danger';
}

// Additional safety utility functions for components
export function getUtilizationColor(level: 'safe' | 'warning' | 'danger'): string {
  switch (level) {
    case 'safe': return 'text-green-600 dark:text-green-400';
    case 'warning': return 'text-yellow-600 dark:text-yellow-400';
    case 'danger': return 'text-red-600 dark:text-red-400';
    default: return 'text-gray-600 dark:text-gray-400';
  }
}

export function getUtilizationBgColor(level: 'safe' | 'warning' | 'danger'): string {
  switch (level) {
    case 'safe': return 'bg-green-50 dark:bg-green-900 border-green-200 dark:border-green-700';
    case 'warning': return 'bg-yellow-50 dark:bg-yellow-900 border-yellow-200 dark:border-yellow-700';
    case 'danger': return 'bg-red-50 dark:bg-red-900 border-red-200 dark:border-red-700';
    default: return 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700';
  }
}

// Export default enhanced configuration
export const ENHANCED_CONFIG = {
  PROGRAM_ID,
  TREASURY_ADDRESS,
  RPC_ENDPOINT,
  VALIDATION: {
    MIN_SUPPLY: 1_000_000,
    MAX_SUPPLY: 1_000_000_000_000,
    MIN_REWARD_RATE_BP,
    MAX_REWARD_RATE_BP,
    MIN_PARTICIPATION_BP: 1,
    MAX_PARTICIPATION_BP: 10000,
    MIN_DURATION_DAYS: 1,
    MAX_DURATION_DAYS,
    MIN_SOL_PRICE: 0.000000001,
    MAX_SOL_PRICE: 1000
  },
  DEFAULTS: {
    REWARD_RATE_BP: DEFAULT_REWARD_RATE_BP,
    TARGET_PARTICIPATION_BP: DEFAULT_TARGET_PARTICIPATION_BP,
    DURATION_DAYS: DEFAULT_DURATION_DAYS,
    TOKEN_DECIMALS,
    V1_TOKEN_PRICE_SOL: "0.001"
  },
  CALCULATIONS: {
    REWARD_POOL_PERCENTAGE,
    LIQUIDITY_POOL_PERCENTAGE,
    OVERFLOW_CUSHION_BP
  }
} as const;