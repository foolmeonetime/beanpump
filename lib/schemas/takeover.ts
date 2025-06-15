// lib/schemas/takeover.ts - Fixed CreateTakeoverSchema with better validation
import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';

// Helper function to validate Solana public keys
const publicKeySchema = z.string().refine(
  (val) => {
    try {
      new PublicKey(val);
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Invalid Solana public key' }
);

// Helper to validate numeric strings
const numericStringSchema = z.string().refine(
  (val) => !isNaN(Number(val)) && Number(val) >= 0,
  { message: 'Must be a valid non-negative number' }
);

// More flexible URL schema that allows empty strings
const flexibleUrlSchema = z.string().optional().or(
  z.string().url().optional()
).or(
  z.string().length(0).optional()
);

export const CreateTakeoverSchema = z.object({
  // Required fields
  address: publicKeySchema,
  authority: publicKeySchema,
  vault: publicKeySchema,
  
  // Optional token mint (both field names supported)
  v1TokenMint: publicKeySchema.optional(),
  v1_token_mint: publicKeySchema.optional(),
  
  // Time fields - support both duration and start/end time formats
  duration: z.number().min(1).max(365).optional(), // Duration in days
  startTime: numericStringSchema.optional(),
  start_time: numericStringSchema.optional(),
  endTime: numericStringSchema.optional(),
  end_time: numericStringSchema.optional(),
  
  // Amount fields
  minAmount: numericStringSchema.optional(),
  min_amount: numericStringSchema.optional(),
  calculatedMinAmount: numericStringSchema.optional(),
  calculated_min_amount: numericStringSchema.optional(),
  maxSafeTotalContribution: numericStringSchema.optional(),
  max_safe_total_contribution: numericStringSchema.optional(),
  
  // Reward and participation rates
  customRewardRate: z.number().min(1).max(3).optional(),
  custom_reward_rate: z.number().min(1).max(3).optional(),
  rewardRateBp: z.number().min(100).max(300).optional(), // 1.0x to 3.0x
  reward_rate_bp: z.number().min(100).max(300).optional(),
  targetParticipationBp: z.number().min(1).max(10000).optional(), // 0.01% to 100%
  target_participation_bp: z.number().min(1).max(10000).optional(),
  
  // Price fields
  v1MarketPriceLamports: numericStringSchema.optional(),
  v1_market_price_lamports: numericStringSchema.optional(),
  
  // Metadata fields - more flexible validation
  tokenName: z.string().max(100).optional().or(z.string().length(0).optional()),
  token_name: z.string().max(100).optional().or(z.string().length(0).optional()),
  imageUrl: flexibleUrlSchema,
  image_url: flexibleUrlSchema,
  
  // Transaction signature
  signature: z.string().optional(),
})
.refine(
  (data) => {
    // Ensure either duration OR (startTime and endTime) is provided
    const hasDuration = data.duration !== undefined;
    const hasStartEnd = (data.startTime || data.start_time) && (data.endTime || data.end_time);
    return hasDuration || hasStartEnd;
  },
  {
    message: "Either 'duration' or both 'startTime' and 'endTime' must be provided",
    path: ["duration"]
  }
)
.refine(
  (data) => {
    // Ensure either v1TokenMint or v1_token_mint is provided
    return data.v1TokenMint || data.v1_token_mint;
  },
  {
    message: "v1TokenMint is required",
    path: ["v1TokenMint"]
  }
);

export const GetTakeoversQuerySchema = z.object({
  authority: publicKeySchema.optional(),
  status: z.enum(['active', 'ended', 'successful', 'failed']).optional(),
  limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).optional(),
  offset: z.string().transform(Number).pipe(z.number().min(0)).optional(),
});

export const FinalizeQuerySchema = z.object({
  authority: publicKeySchema.optional(),
});

export const FinalizeTakeoverSchema = z.object({
  takeoverAddress: publicKeySchema,
  authority: publicKeySchema,
  isSuccessful: z.boolean(),
  transactionSignature: z.string().min(1, 'Transaction signature is required'),
  v2TokenMint: publicKeySchema.optional(),
});

export const ContributeSchema = z.object({
  takeoverAddress: publicKeySchema,
  contributor: publicKeySchema,
  amount: numericStringSchema,
  transactionSignature: z.string().min(1, 'Transaction signature is required'),
});

export const ClaimQuerySchema = z.object({
  contributor: publicKeySchema,
  takeoverId: z.string().transform(Number).optional(),
  status: z.enum(['claimed', 'unclaimed', 'all']).optional(),
  takeover: publicKeySchema.optional(),
});

export const ProcessClaimSchema = z.object({
  contributionId: z.number().min(1),
  contributor: publicKeySchema,
  takeoverAddress: publicKeySchema,
  transactionSignature: z.string().min(1, 'Transaction signature is required'),
  claimAmount: numericStringSchema.optional(),
  claimType: z.enum(['reward', 'refund']).optional(),
});