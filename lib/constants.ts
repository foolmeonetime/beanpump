// Keep existing constants but enhance them
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

// Validation functions
export function validateRewardRate(rateBp: number): boolean {
  return rateBp >= MIN_REWARD_RATE_BP && rateBp <= MAX_REWARD_RATE_BP;
}

export function validateParticipationRate(rateBp: number): boolean {
  return rateBp > 0 && rateBp <= 10000; // 0-100%
}

// Error messages
export const ERROR_MESSAGES = {
  INVALID_REWARD_RATE: `Reward rate must be between ${MIN_REWARD_RATE_BP}bp and ${MAX_REWARD_RATE_BP}bp (1.0x to 2.0x)`,
  INVALID_PARTICIPATION_RATE: 'Participation rate must be between 0.01% and 100%',
  INVALID_DURATION: `Duration must be between 1 and ${MAX_DURATION_DAYS} days`,
  INSUFFICIENT_SUPPLY: 'Token supply must be at least 1M tokens',
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