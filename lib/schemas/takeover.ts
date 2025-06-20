import { z } from 'zod';

/**
 * Base validation schemas for Solana addresses and common fields
 */
const SolanaAddressSchema = z.string()
  .min(32, 'Solana address must be at least 32 characters')
  .max(44, 'Solana address must be at most 44 characters')
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, 'Invalid Solana address format');

const PositiveNumberStringSchema = z.string()
  .regex(/^\d+$/, 'Must be a positive number string')
  .refine(val => BigInt(val) > 0, 'Must be greater than 0');

const TimestampSchema = z.union([
  z.string().regex(/^\d+$/, 'Must be a valid timestamp string'),
  z.number().int().positive('Must be a positive timestamp'),
]).optional();

const AmountSchema = z.union([
  z.string().regex(/^\d+$/, 'Must be a valid amount string'),
  z.number().int().min(0, 'Amount must be non-negative'),
]).optional();

/**
 * Token Amount Target Schema - replaces basis points with direct token amounts
 */
const TokenAmountTargetSchema = z.union([
  z.string().regex(/^\d+$/, 'Token amount target must be a valid number string'),
  z.number().int().min(1000000, 'Token amount target must be at least 1M tokens (1,000,000)'),
]).transform(val => {
  if (typeof val === 'string') {
    const num = BigInt(val);
    if (num < 1000000n) {
      throw new Error('Token amount target must be at least 1M tokens');
    }
    return val;
  }
  return val.toString();
});

/**
 * Schema for querying takeovers (GET /api/takeovers)
 */
export const GetTakeoversQuerySchema = z.object({
  authority: SolanaAddressSchema.optional(),
  address: SolanaAddressSchema.optional(),
  status: z.enum(['active', 'finalized', 'successful', 'failed', 'expired']).optional(),
  limit: z.string()
    .regex(/^\d+$/, 'Limit must be a number')
    .transform(val => parseInt(val))
    .refine(val => val > 0 && val <= 100, 'Limit must be between 1 and 100')
    .optional(),
  offset: z.string()
    .regex(/^\d+$/, 'Offset must be a number')
    .transform(val => parseInt(val))
    .refine(val => val >= 0, 'Offset must be non-negative')
    .optional(),
}).optional();

/**
 * Schema for creating a new takeover (POST /api/takeovers)
 */
export const CreateTakeoverSchema = z.object({
  // Required fields
  address: SolanaAddressSchema,
  authority: SolanaAddressSchema,
  v1_token_mint: SolanaAddressSchema,
  vault: SolanaAddressSchema,
  
  // Token amount target (UPDATED: replaces target_participation_bp)
  token_amount_target: TokenAmountTargetSchema.optional(),
  
  // Optional basic fields with bigint compatibility
  min_amount: AmountSchema,
  start_time: TimestampSchema,
  end_time: TimestampSchema,
  custom_reward_rate: z.number()
    .min(0.1, 'Reward rate must be at least 0.1')
    .max(10, 'Reward rate must be at most 10')
    .optional(),
  token_name: z.string()
    .min(1, 'Token name cannot be empty')
    .max(100, 'Token name must be at most 100 characters')
    .optional(),
  image_url: z.string()
    .url('Must be a valid URL')
    .optional(),
  
  // V2 migration fields
  has_v2_mint: z.boolean().optional(),
  v2_token_mint: SolanaAddressSchema.optional(),
  v1_total_supply: AmountSchema,
  v2_total_supply: AmountSchema,
  
  // Reward system fields
  reward_rate_bp: z.number()
    .int('Reward rate BP must be an integer')
    .min(1, 'Reward rate BP must be at least 1')
    .max(10000, 'Reward rate BP must be at most 10000')
    .optional(),
  calculated_min_amount: AmountSchema,
  max_safe_total_contribution: AmountSchema,
  v1_market_price_lamports: AmountSchema,
  
  // Liquidity fields
  sol_for_liquidity: AmountSchema,
  reward_pool_tokens: AmountSchema,
  liquidity_pool_tokens: AmountSchema,
})
.refine(data => {
  // Auto-calculate token_amount_target if not provided but v1_total_supply is available
  if (!data.token_amount_target && data.v1_total_supply) {
    const v1Supply = typeof data.v1_total_supply === 'string' 
      ? BigInt(data.v1_total_supply) 
      : BigInt(data.v1_total_supply);
    
    // Default to 10% of total supply as target, minimum 1M tokens
    const defaultTarget = v1Supply / 10n;
    const minTarget = 1000000n;
    const finalTarget = defaultTarget > minTarget ? defaultTarget : minTarget;
    
    data.token_amount_target = finalTarget.toString();
  }
  
  return true;
}, {
  message: 'Token amount target will be auto-calculated if not provided',
});

/**
 * Schema for updating an existing takeover (PUT /api/takeovers)
 */
export const UpdateTakeoverSchema = z.object({
  address: SolanaAddressSchema,
  
  // Status updates
  is_finalized: z.boolean().optional(),
  is_successful: z.boolean().optional(),
  
  // Amount updates
  total_contributed: AmountSchema,
  contributor_count: z.number()
    .int('Contributor count must be an integer')
    .min(0, 'Contributor count cannot be negative')
    .optional(),
  
  // Token target updates (UPDATED)
  token_amount_target: TokenAmountTargetSchema.optional(),
  
  // Other updates
  custom_reward_rate: z.number()
    .min(0.1, 'Reward rate must be at least 0.1')
    .max(10, 'Reward rate must be at most 10')
    .optional(),
  token_name: z.string()
    .min(1, 'Token name cannot be empty')
    .max(100, 'Token name must be at most 100 characters')
    .optional(),
  image_url: z.string()
    .url('Must be a valid URL')
    .optional(),
  
  // V2 migration updates
  has_v2_mint: z.boolean().optional(),
  v2_token_mint: SolanaAddressSchema.optional(),
  v2_total_supply: AmountSchema,
  reward_pool_tokens: AmountSchema,
  liquidity_pool_tokens: AmountSchema,
  participation_rate_bp: z.number()
    .int('Participation rate BP must be an integer')
    .min(0, 'Participation rate BP cannot be negative')
    .max(10000, 'Participation rate BP cannot exceed 10000')
    .optional(),
  final_safety_utilization: z.number()
    .min(0, 'Final safety utilization cannot be negative')
    .max(1, 'Final safety utilization cannot exceed 1')
    .optional(),
  final_reward_rate: z.number()
    .min(0, 'Final reward rate cannot be negative')
    .optional(),
});

/**
 * Schema for contribution creation
 */
export const CreateContributionSchema = z.object({
  takeoverId: z.number().int().positive('Takeover ID must be a positive integer'),
  amount: PositiveNumberStringSchema,
  contributor: SolanaAddressSchema,
  transactionSignature: z.string()
    .min(64, 'Transaction signature must be at least 64 characters')
    .max(128, 'Transaction signature must be at most 128 characters'),
});

/**
 * Helper function to calculate if token amount target is met
 */
export function isTokenTargetMet(totalContributed: string | number, tokenAmountTarget: string | number): boolean {
  const contributed = typeof totalContributed === 'string' ? BigInt(totalContributed) : BigInt(totalContributed);
  const target = typeof tokenAmountTarget === 'string' ? BigInt(tokenAmountTarget) : BigInt(tokenAmountTarget);
  
  return contributed >= target;
}

/**
 * Helper function to get progress percentage towards token target
 */
export function getTokenTargetProgress(totalContributed: string | number, tokenAmountTarget: string | number): number {
  const contributed = typeof totalContributed === 'string' ? BigInt(totalContributed) : BigInt(totalContributed);
  const target = typeof tokenAmountTarget === 'string' ? BigInt(tokenAmountTarget) : BigInt(tokenAmountTarget);
  
  if (target === 0n) return 0;
  
  const progress = Number(contributed * 100n / target);
  return Math.min(100, Math.max(0, progress));
}

/**
 * Helper function to format token amounts for display
 */
export function formatTokenAmount(amount: string | number, decimals: number = 6): string {
  const amountBigInt = typeof amount === 'string' ? BigInt(amount) : BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const wholeTokens = amountBigInt / divisor;
  
  if (wholeTokens >= 1000000000n) {
    return `${(Number(wholeTokens) / 1000000000).toFixed(1)}B`;
  } else if (wholeTokens >= 1000000n) {
    return `${(Number(wholeTokens) / 1000000).toFixed(1)}M`;
  } else if (wholeTokens >= 1000n) {
    return `${(Number(wholeTokens) / 1000).toFixed(1)}K`;
  } else {
    return wholeTokens.toString();
  }
}

/**
 * Updated expected database columns list
 */
export const EXPECTED_TAKEOVER_COLUMNS = [
  'id',
  'address',
  'authority',
  'v1_token_mint',
  'vault',
  'min_amount',
  'start_time',
  'end_time',
  'custom_reward_rate',
  'reward_rate_bp',
  'token_amount_target',  // UPDATED: replaces target_participation_bp
  'v1_market_price_lamports',
  'calculated_min_amount',
  'max_safe_total_contribution',
  'token_name',
  'image_url',
  'signature',
  'created_at',
  'total_contributed',
  'contributor_count',
  'is_finalized',
  'is_successful'
] as const;

export const ClaimQuerySchema = z.object({
  contributor: SolanaAddressSchema,
  takeoverId: z.string().transform(Number).optional(),
  takeover: SolanaAddressSchema.optional(),
  status: z.enum(['claimed', 'unclaimed', 'all']).optional(),
});

export const ProcessClaimSchema = z.object({
  contributionId: z.number().min(1),
  contributor: SolanaAddressSchema,
  takeoverAddress: SolanaAddressSchema,
  transactionSignature: z.string().min(1),
  claimAmount: z.string().regex(/^\d+$/, 'Must be a valid amount string'),
  claimType: z.enum(['standard', 'liquidity_enhanced']).optional(),
});

// Finalize-related schemas
export const FinalizeQuerySchema = z.object({
  authority: SolanaAddressSchema.optional(),
});

export const FinalizeTakeoverSchema = z.object({
  takeoverAddress: SolanaAddressSchema,
  authority: SolanaAddressSchema,
  isSuccessful: z.boolean(),
  transactionSignature: z.string().min(1),
});