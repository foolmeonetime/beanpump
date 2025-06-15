// lib/schemas/takeover.ts - Updated schemas for your bigint database schema
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
  
  // Billion-scale takeover fields
  reward_rate_bp: z.number()
    .int('Reward rate BP must be an integer')
    .min(1, 'Reward rate BP must be at least 1')
    .max(10000, 'Reward rate BP must be at most 10000')
    .optional(),
  calculated_min_amount: AmountSchema,
  max_safe_total_contribution: AmountSchema,
  target_participation_bp: z.number()
    .int('Target participation BP must be an integer')
    .min(1, 'Target participation BP must be at least 1')
    .max(10000, 'Target participation BP must be at most 10000')
    .optional(),
  v1_market_price_lamports: AmountSchema,
  
  // Liquidity fields
  sol_for_liquidity: AmountSchema,
  reward_pool_tokens: AmountSchema,
  liquidity_pool_tokens: AmountSchema,
})
.refine(data => {
  // If billion-scale fields are provided, ensure consistency
  const billionScaleFields = [
    data.reward_rate_bp,
    data.calculated_min_amount,
    data.max_safe_total_contribution,
    data.target_participation_bp
  ];
  
  const hasBillionScaleFields = billionScaleFields.some(field => field !== undefined);
  
  if (hasBillionScaleFields) {
    // If any billion-scale field is provided, require the essential ones
    return data.reward_rate_bp !== undefined && data.calculated_min_amount !== undefined;
  }
  
  return true;
}, {
  message: 'For billion-scale takeovers, reward_rate_bp and calculated_min_amount are required',
  path: ['reward_rate_bp'],
})
.refine(data => {
  // Validate time logic
  if (data.start_time && data.end_time) {
    const start = typeof data.start_time === 'string' ? parseInt(data.start_time) : data.start_time;
    const end = typeof data.end_time === 'string' ? parseInt(data.end_time) : data.end_time;
    return start < end;
  }
  return true;
}, {
  message: 'End time must be after start time',
  path: ['end_time'],
})
.refine(data => {
  // If V2 mint is enabled, require V2 token mint
  if (data.has_v2_mint === true) {
    return data.v2_token_mint !== undefined;
  }
  return true;
}, {
  message: 'V2 token mint is required when V2 mint is enabled',
  path: ['v2_token_mint'],
});

/**
 * Schema for updating a takeover (PUT /api/takeovers)
 */
export const UpdateTakeoverSchema = z.object({
  address: SolanaAddressSchema,
  
  // Fields that can be updated (all optional)
  total_contributed: AmountSchema,
  contributor_count: z.number()
    .int('Contributor count must be an integer')
    .min(0, 'Contributor count cannot be negative')
    .optional(),
  is_finalized: z.boolean().optional(),
  is_successful: z.boolean().optional(),
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
  
  // V2 and migration fields
  has_v2_mint: z.boolean().optional(),
  v2_token_mint: SolanaAddressSchema.optional(),
  v2_total_supply: AmountSchema,
  reward_pool_tokens: AmountSchema,
  liquidity_pool_tokens: AmountSchema,
  
  // Process completion flags
  jupiter_swap_completed: z.boolean().optional(),
  lp_created: z.boolean().optional(),
  
  // Final metrics
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
})
.refine(data => {
  // If takeover is marked as finalized, is_successful must be provided
  if (data.is_finalized === true) {
    return data.is_successful !== undefined;
  }
  return true;
}, {
  message: 'When finalizing a takeover, success status must be specified',
  path: ['is_successful'],
})
.refine(data => {
  // If V2 mint is enabled, require V2 token mint
  if (data.has_v2_mint === true) {
    return data.v2_token_mint !== undefined;
  }
  return true;
}, {
  message: 'V2 token mint is required when V2 mint is enabled',
  path: ['v2_token_mint'],
});

/**
 * Schema for contribution data
 */
export const ContributionSchema = z.object({
  takeover_address: SolanaAddressSchema,
  contributor_address: SolanaAddressSchema,
  amount: PositiveNumberStringSchema,
  signature: z.string()
    .min(64, 'Signature must be at least 64 characters')
    .max(128, 'Signature must be at most 128 characters'),
  block_height: z.number()
    .int('Block height must be an integer')
    .positive('Block height must be positive')
    .optional(),
  timestamp: TimestampSchema,
});

/**
 * Schema for takeover statistics query
 */
export const TakeoverStatsQuerySchema = z.object({
  timeframe: z.enum(['24h', '7d', '30d', 'all']).optional(),
  status: z.enum(['active', 'finalized', 'successful', 'failed']).optional(),
}).optional();

/**
 * Schema for finalization request
 */
export const FinalizeTakeoverSchema = z.object({
  address: SolanaAddressSchema,
  signature: z.string()
    .min(64, 'Signature must be at least 64 characters')
    .max(128, 'Signature must be at most 128 characters'),
  is_successful: z.boolean(),
  final_total_contributed: AmountSchema,
  final_contributor_count: z.number()
    .int('Final contributor count must be an integer')
    .min(0, 'Final contributor count cannot be negative')
    .optional(),
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
 * Schema for V2 migration request
 */
export const V2MigrationSchema = z.object({
  address: SolanaAddressSchema,
  v2_token_mint: SolanaAddressSchema,
  v2_total_supply: PositiveNumberStringSchema,
  reward_pool_tokens: PositiveNumberStringSchema,
  liquidity_pool_tokens: PositiveNumberStringSchema,
  sol_for_liquidity: PositiveNumberStringSchema,
  signature: z.string()
    .min(64, 'Signature must be at least 64 characters')
    .max(128, 'Signature must be at most 128 characters'),
});

/**
 * Schema for Jupiter swap completion
 */
export const JupiterSwapSchema = z.object({
  address: SolanaAddressSchema,
  swap_signature: z.string()
    .min(64, 'Swap signature must be at least 64 characters')
    .max(128, 'Swap signature must be at most 128 characters'),
  tokens_swapped: PositiveNumberStringSchema,
  sol_received: PositiveNumberStringSchema,
});

/**
 * Schema for LP creation completion
 */
export const LPCreationSchema = z.object({
  address: SolanaAddressSchema,
  lp_signature: z.string()
    .min(64, 'LP signature must be at least 64 characters')
    .max(128, 'LP signature must be at most 128 characters'),
  lp_token_mint: SolanaAddressSchema,
  tokens_provided: PositiveNumberStringSchema,
  sol_provided: PositiveNumberStringSchema,
});

/**
 * Schema for search/filter queries
 */
export const SearchTakeoversSchema = z.object({
  query: z.string()
    .min(1, 'Search query cannot be empty')
    .max(100, 'Search query too long'),
  filters: z.object({
    status: z.array(z.enum(['active', 'finalized', 'successful', 'failed', 'expired'])).optional(),
    min_amount: AmountSchema,
    max_amount: AmountSchema,
    reward_rate_min: z.number().min(0).optional(),
    reward_rate_max: z.number().max(10).optional(),
    has_v2_mint: z.boolean().optional(),
    is_billion_scale: z.boolean().optional(),
    created_after: TimestampSchema,
    created_before: TimestampSchema,
  }).optional(),
  sort: z.object({
    field: z.enum(['created_at', 'total_contributed', 'contributor_count', 'end_time', 'participation_rate_bp']),
    order: z.enum(['asc', 'desc']),
  }).optional(),
  pagination: z.object({
    limit: z.number().int().min(1).max(100),
    offset: z.number().int().min(0),
  }).optional(),
});

/**
 * Schema for bulk operations
 */
export const BulkUpdateTakeoversSchema = z.object({
  addresses: z.array(SolanaAddressSchema)
    .min(1, 'At least one address is required')
    .max(50, 'Cannot update more than 50 takeovers at once'),
  updates: z.object({
    is_finalized: z.boolean().optional(),
    is_successful: z.boolean().optional(),
    custom_reward_rate: z.number().min(0.1).max(10).optional(),
    jupiter_swap_completed: z.boolean().optional(),
    lp_created: z.boolean().optional(),
  }),
  signature: z.string()
    .min(64, 'Signature must be at least 64 characters')
    .max(128, 'Signature must be at most 128 characters'),
});

/**
 * Utility function to validate Solana address format
 */
export function isValidSolanaAddress(address: string): boolean {
  try {
    SolanaAddressSchema.parse(address);
    return true;
  } catch {
    return false;
  }
}

/**
 * Utility function to validate timestamp
 */
export function isValidTimestamp(timestamp: string | number): boolean {
  try {
    const ts = typeof timestamp === 'string' ? parseInt(timestamp) : timestamp;
    return ts > 0 && ts < Date.now() / 1000 + 365 * 24 * 60 * 60; // Within next year
  } catch {
    return false;
  }
}

/**
 * Utility function to validate amount
 */
export function isValidAmount(amount: string | number): boolean {
  try {
    const amt = typeof amount === 'string' ? BigInt(amount) : BigInt(amount);
    return amt >= 0n;
  } catch {
    return false;
  }
}

/**
 * Type definitions derived from schemas
 */
export type GetTakeoversQuery = z.infer<typeof GetTakeoversQuerySchema>;
export type CreateTakeoverData = z.infer<typeof CreateTakeoverSchema>;
export type UpdateTakeoverData = z.infer<typeof UpdateTakeoverSchema>;
export type ContributionData = z.infer<typeof ContributionSchema>;
export type TakeoverStatsQuery = z.infer<typeof TakeoverStatsQuerySchema>;
export type FinalizeTakeoverData = z.infer<typeof FinalizeTakeoverSchema>;
export type V2MigrationData = z.infer<typeof V2MigrationSchema>;
export type JupiterSwapData = z.infer<typeof JupiterSwapSchema>;
export type LPCreationData = z.infer<typeof LPCreationSchema>;
export type SearchTakeoversData = z.infer<typeof SearchTakeoversSchema>;
export type BulkUpdateTakeoversData = z.infer<typeof BulkUpdateTakeoversSchema>;