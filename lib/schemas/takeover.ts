import { z } from 'zod';

const SolanaAddressSchema = z.string()
  .min(32, 'Solana address must be at least 32 characters')
  .max(44, 'Solana address must be at most 44 characters')
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, 'Invalid Solana address format')
  .refine(
    (val) => {
      try {
        // Additional validation - could integrate with @solana/web3.js PublicKey validation
        return val.length >= 32 && val.length <= 44;
      } catch {
        return false;
      }
    },
    { message: 'Invalid Solana public key format' }
  );

/**
 * ✅ IMPROVED: Enhanced positive number validation with BigInt support
 */
const PositiveNumberStringSchema = z.string()
  .regex(/^\d+$/, 'Must be a positive number string')
  .refine(val => {
    try {
      const bigIntVal = BigInt(val);
      return bigIntVal > 0;
    } catch {
      return false;
    }
  }, 'Must be a valid positive number')
  .refine(val => {
    try {
      const bigIntVal = BigInt(val);
      // Reasonable upper limit to prevent overflow
      return bigIntVal <= BigInt('18446744073709551615'); // uint64 max
    } catch {
      return false;
    }
  }, 'Number too large');

/**
 * ✅ FIXED: Schema for querying claims (GET /api/claims)
 * - Fixed takeoverId transformation
 * - Added proper optional handling
 * - Enhanced validation
 */
export const ClaimQuerySchema = z.object({
  contributor: SolanaAddressSchema,
  // ✅ FIXED: Handle both string and number inputs properly
  takeoverId: z.union([
    z.string().regex(/^\d+$/, 'Must be a valid number').transform(Number),
    z.number().int().positive()
  ]).optional(),
  // ✅ FIXED: Renamed from 'takeover' to match service expectation
  takeoverAddress: SolanaAddressSchema.optional(),
  status: z.enum(['claimed', 'unclaimed', 'all']).default('all').optional(),
  // ✅ ADDED: Support for pagination
  limit: z.union([
    z.string().regex(/^\d+$/).transform(Number),
    z.number().int()
  ]).refine(val => val > 0 && val <= 100, 'Limit must be between 1 and 100').optional(),
  offset: z.union([
    z.string().regex(/^\d+$/).transform(Number),
    z.number().int()
  ]).refine(val => val >= 0, 'Offset must be non-negative').optional(),
}).strict(); // Prevent additional unknown fields

/**
 * ✅ FIXED: Schema for processing claims (POST /api/claims)
 * - Fixed claimType enum to match service expectations
 * - Added proper transaction signature validation
 * - Enhanced amount validation
 */
export const ProcessClaimSchema = z.object({
  contributionId: z.number().int().positive('Contribution ID must be a positive integer'),
  contributor: SolanaAddressSchema,
  takeoverAddress: SolanaAddressSchema,
  // ✅ IMPROVED: Proper Solana transaction signature validation
  transactionSignature: z.string()
    .min(64, 'Transaction signature must be at least 64 characters')
    .max(128, 'Transaction signature must be at most 128 characters')
    .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, 'Invalid transaction signature format'),
  // ✅ IMPROVED: Enhanced amount validation with BigInt support
  claimAmount: PositiveNumberStringSchema.optional(),
  // ✅ FIXED: Match service expectations - 'reward' | 'refund' instead of 'standard' | 'liquidity_enhanced'
  claimType: z.enum(['reward', 'refund']).optional(),
}).strict();

/**
 * ✅ ADDED: Schema for enhanced claims endpoint
 */
export const EnhancedClaimQuerySchema = ClaimQuerySchema.extend({
  refresh: z.union([
    z.string().transform(val => val === 'true'),
    z.boolean()
  ]).default(false).optional(),
  includeMetadata: z.union([
    z.string().transform(val => val === 'true'),
    z.boolean()
  ]).default(false).optional(),
}).strict();

/**
 * ✅ IMPROVED: Token Amount Target Schema with better validation
 */
const TokenAmountTargetSchema = z.union([
  z.string().regex(/^\d+$/, 'Token amount target must be a valid number string'),
  z.number().int().min(1000000, 'Token amount target must be at least 1M tokens (1,000,000)'),
]).transform(val => {
  const strVal = typeof val === 'string' ? val : val.toString();
  const num = BigInt(strVal);
  if (num < 1000000n) {
    throw new Error('Token amount target must be at least 1M tokens');
  }
  return strVal;
});

/**
 * ✅ ADDED: Transaction signature validation helper
 */
export const TransactionSignatureSchema = z.string()
  .min(64, 'Transaction signature too short')
  .max(128, 'Transaction signature too long')
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, 'Invalid transaction signature format')
  .refine(
    (val) => {
      // Basic length validation for Solana transaction signatures
      return val.length === 88 || val.length === 87; // Base58 encoded signatures are typically 87-88 chars
    },
    { message: 'Invalid Solana transaction signature length' }
  );

/**
 * ✅ ENHANCED: Updated takeover schemas with better validation
 */
export const GetTakeoversQuerySchema = z.object({
  authority: SolanaAddressSchema.optional(),
  address: SolanaAddressSchema.optional(),
  status: z.enum(['active', 'finalized', 'successful', 'failed', 'expired']).optional(),
  limit: z.union([
    z.string().regex(/^\d+$/, 'Limit must be a number').transform(val => parseInt(val)),
    z.number().int()
  ]).refine(val => val > 0 && val <= 100, 'Limit must be between 1 and 100').default(50).optional(),
  offset: z.union([
    z.string().regex(/^\d+$/, 'Offset must be a number').transform(val => parseInt(val)),
    z.number().int()
  ]).refine(val => val >= 0, 'Offset must be non-negative').default(0).optional(),
}).strict();

/**
 * ✅ ENHANCED: Create takeover schema with comprehensive validation
 */
export const CreateTakeoverSchema = z.object({
  // Required fields
  address: SolanaAddressSchema,
  authority: SolanaAddressSchema,
  v1_token_mint: SolanaAddressSchema,
  vault: SolanaAddressSchema,
  
  // Token amount target (replaces target_participation_bp)
  token_amount_target: TokenAmountTargetSchema.optional(),
  
  // Optional fields with proper validation
  min_amount: PositiveNumberStringSchema.optional(),
  start_time: z.union([
    z.string().regex(/^\d+$/, 'Must be a valid timestamp'),
    z.number().int().positive('Must be a positive timestamp')
  ]).optional(),
  end_time: z.union([
    z.string().regex(/^\d+$/, 'Must be a valid timestamp'),
    z.number().int().positive('Must be a positive timestamp')
  ]).optional(),
  
  // Reward rate validation (100bp = 1.0x, 200bp = 2.0x)
  custom_reward_rate: z.number()
    .min(1.0, 'Reward rate must be at least 1.0x')
    .max(2.0, 'Reward rate must be at most 2.0x for safety')
    .default(1.5),
  
  reward_rate_bp: z.number().int()
    .min(100, 'Reward rate must be at least 100bp (1.0x)')
    .max(200, 'Reward rate must be at most 200bp (2.0x) for safety')
    .default(150),
  
  // Market price validation
  v1_market_price_lamports: PositiveNumberStringSchema.optional(),
  
  // Safety limits
  calculated_min_amount: PositiveNumberStringSchema.optional(),
  max_safe_total_contribution: PositiveNumberStringSchema.optional(),
  
  // Metadata
  token_name: z.string().min(1, 'Token name is required').max(100, 'Token name too long').optional(),
  image_url: z.string().url('Must be a valid URL').optional(),
  
  // Transaction signature
  signature: TransactionSignatureSchema.optional(),
}).strict()
  .refine(
    (data) => {
      // Ensure end_time is after start_time if both provided
      if (data.start_time && data.end_time) {
        const start = typeof data.start_time === 'string' ? parseInt(data.start_time) : data.start_time;
        const end = typeof data.end_time === 'string' ? parseInt(data.end_time) : data.end_time;
        return end > start;
      }
      return true;
    },
    { message: 'End time must be after start time', path: ['end_time'] }
  );

/**
 * ✅ ENHANCED: Finalize schemas with proper validation
 */
export const FinalizeQuerySchema = z.object({
  authority: SolanaAddressSchema.optional(),
}).strict();

export const FinalizeTakeoverSchema = z.object({
  takeoverAddress: SolanaAddressSchema,
  authority: SolanaAddressSchema,
  isSuccessful: z.boolean(),
  transactionSignature: TransactionSignatureSchema,
  // ✅ ADDED: Additional finalization data
  finalTotalContributed: PositiveNumberStringSchema.optional(),
  finalContributorCount: z.number().int().min(0).optional(),
  v2TokenMint: SolanaAddressSchema.optional(), // For successful takeovers
}).strict();

/**
 * ✅ ADDED: Helper functions for validation
 */
export function validateClaimAmount(amount: string): boolean {
  try {
    const bigIntAmount = BigInt(amount);
    return bigIntAmount > 0 && bigIntAmount <= BigInt('18446744073709551615');
  } catch {
    return false;
  }
}

export function validateSolanaAddress(address: string): boolean {
  return SolanaAddressSchema.safeParse(address).success;
}

export function validateTransactionSignature(signature: string): boolean {
  return TransactionSignatureSchema.safeParse(signature).success;
}

/**
 * ✅ ENHANCED: Expected database columns for schema validation
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
  'token_amount_target',
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
  'is_successful',
  'v2_token_mint', // For successful takeovers
] as const;

export const EXPECTED_CONTRIBUTION_COLUMNS = [
  'id',
  'takeover_id',
  'contributor',
  'amount',
  'transaction_signature',
  'created_at',
  'is_claimed',
  'claim_signature',
  'claim_amount',
  'claim_type',
  'claimed_at',
] as const;