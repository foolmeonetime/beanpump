// lib/schemas/takeover.ts - Fixed validation functions
import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';

// Helper function to validate Solana public keys - FIXED: Made async
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

export const CreateTakeoverSchema = z.object({
  address: publicKeySchema,
  authority: publicKeySchema,
  v1TokenMint: publicKeySchema.optional(),
  v1_token_mint: publicKeySchema.optional(),
  vault: publicKeySchema,
  minAmount: numericStringSchema.optional(),
  min_amount: numericStringSchema.optional(),
  startTime: numericStringSchema.optional(),
  start_time: numericStringSchema.optional(),
  endTime: numericStringSchema.optional(),
  end_time: numericStringSchema.optional(),
  customRewardRate: z.number().min(1).max(3).optional(),
  custom_reward_rate: z.number().min(1).max(3).optional(),
  rewardRateBp: z.number().min(100).max(200).optional(),
  reward_rate_bp: z.number().min(100).max(200).optional(),
  targetParticipationBp: z.number().min(1).max(10000).optional(),
  target_participation_bp: z.number().min(1).max(10000).optional(),
  v1MarketPriceLamports: numericStringSchema.optional(),
  v1_market_price_lamports: numericStringSchema.optional(),
  calculatedMinAmount: numericStringSchema.optional(),
  calculated_min_amount: numericStringSchema.optional(),
  maxSafeTotalContribution: numericStringSchema.optional(),
  max_safe_total_contribution: numericStringSchema.optional(),
  tokenName: z.string().max(100).optional(),
  token_name: z.string().max(100).optional(),
  imageUrl: z.string().url().optional(),
  image_url: z.string().url().optional(),
  signature: z.string().optional(),
});

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

// FIXED: Proper async validation for claims
export const ClaimQuerySchema = z.object({
  contributor: publicKeySchema,
  takeoverId: z.string().transform(Number).optional(),
  status: z.enum(['claimed', 'unclaimed', 'all']).optional(),
  takeover: publicKeySchema.optional(), // Added for takeover-specific claims
});

export const ProcessClaimSchema = z.object({
  contributionId: z.number().min(1),
  contributor: publicKeySchema,
  takeoverAddress: publicKeySchema,
  transactionSignature: z.string().min(1, 'Transaction signature is required'),
  claimAmount: numericStringSchema.optional(),
  claimType: z.enum(['reward', 'refund']).optional(),
});