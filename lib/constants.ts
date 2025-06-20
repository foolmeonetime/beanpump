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

// Validation result interface
export interface ValidationResult {
  valid: boolean;
  message?: string;
}

// Validation functions - FIXED to return proper types
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

// Additional validation functions
export function validateDuration(days: number): ValidationResult {
  if (days >= 1 && days <= MAX_DURATION_DAYS) {
    return { valid: true };
  }
  return {
    valid: false,
    message: `Duration must be between 1 and ${MAX_DURATION_DAYS} days`
  };
}

export function validateTokenSupply(supply: number): ValidationResult {
  if (supply >= 1_000_000) { // At least 1M tokens
    return { valid: true };
  }
  return {
    valid: false,
    message: 'Token supply must be at least 1M tokens'
  };
}

export function validateTokenMint(mintAddress: string): ValidationResult {
  try {
    // Basic validation - check if it's a valid base58 string of correct length
    if (!mintAddress || mintAddress.length < 32 || mintAddress.length > 44) {
      return {
        valid: false,
        message: 'Invalid token mint address format'
      };
    }
    return { valid: true };
  } catch {
    return {
      valid: false,
      message: 'Invalid token mint address'
    };
  }
}

// Error messages
export const ERROR_MESSAGES = {
  INVALID_REWARD_RATE: `Reward rate must be between ${MIN_REWARD_RATE_BP}bp and ${MAX_REWARD_RATE_BP}bp (1.0x to 2.0x)`,
  INVALID_PARTICIPATION_RATE: 'Participation rate must be between 0.01% and 100%',
  INVALID_DURATION: `Duration must be between 1 and ${MAX_DURATION_DAYS} days`,
  INSUFFICIENT_SUPPLY: 'Token supply must be at least 1M tokens',
  SUPPLY_TOO_SMALL: 'Token supply is too small for billion-scale operations (minimum 1M tokens required)',
  SUPPLY_TOO_LARGE: 'Token supply is too large for safe operations (maximum 10B tokens allowed)',
  WALLET_NOT_CONNECTED: 'Please connect your wallet',
  INVALID_TOKEN_MINT: 'Invalid token mint address'
};

// Helper functions
export function formatLargeNumber(value: number): string {
  if (value >= 1_000_000_000) {
    return (value / 1_000_000_000).toFixed(1) + 'B';
  } else if (value >= 1_000_000) {
    return (value / 1_000_000).toFixed(1) + 'M';
  } else if (value >= 1_000) {
    return (value / 1_000).toFixed(1) + 'K';
  }
  return value.toFixed(2);
}

export function getSafetyLevel(utilization: number): 'safe' | 'warning' | 'danger' {
  if (utilization < 70) return 'safe';
  if (utilization < 90) return 'warning';
  return 'danger';
}

// SOL price validation
export function validateSolPrice(priceStr: string): string | null {
  const price = parseFloat(priceStr);
  
  if (isNaN(price) || price <= 0) {
    return 'Price must be a positive number';
  }
  
  if (price < 0.000000001) {
    return 'Price too small (minimum 0.000000001 SOL)';
  }
  
  if (price > 1000) {
    return 'Price too large (maximum 1000 SOL)';
  }
  
  return null; // Valid
}

// Utility functions for billion-scale operations
export function calculateRewardPoolTokens(totalSupply: number): number {
  return Math.floor(totalSupply * REWARD_POOL_PERCENTAGE / 100);
}

export function calculateLiquidityPoolTokens(totalSupply: number): number {
  return Math.floor(totalSupply * LIQUIDITY_POOL_PERCENTAGE / 100);
}

export function calculateMinAmount(
  totalSupply: number, 
  targetParticipationBp: number
): number {
  return Math.floor(totalSupply * targetParticipationBp / 10000);
}

export function calculateMaxSafeContribution(
  rewardPoolTokens: number,
  rewardRateBp: number
): number {
  const rewardRate = rewardRateBp / 100;
  const safetyMultiplier = 0.98; // 98% of capacity for safety
  return Math.floor((rewardPoolTokens * safetyMultiplier) / rewardRate);
}

// Convert SOL price to lamports
export function solToLamports(solPrice: number): number {
  return Math.floor(solPrice * 1_000_000_000); // 1 SOL = 1B lamports
}

// Convert lamports to SOL
export function lamportsToSol(lamports: number): number {
  return lamports / 1_000_000_000;
}