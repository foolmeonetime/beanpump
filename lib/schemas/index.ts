// lib/schemas/index.ts - Additional validation schemas for remaining routes
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

// CONTRIBUTIONS SCHEMAS
export const GetContributionsQuerySchema = z.object({
  takeover_id: z.string().transform(Number).optional(),
  contributor: publicKeySchema.optional(),
  limit: z.string().transform(Number).pipe(z.number().min(1).max(100)).optional(),
  offset: z.string().transform(Number).pipe(z.number().min(0)).optional(),
});

export const CreateContributionSchema = z.object({
  takeoverId: z.number().min(1),
  amount: numericStringSchema,
  contributor: publicKeySchema,
  transactionSignature: z.string().min(1, 'Transaction signature is required'),
});

// SYNC SCHEMAS
export const SyncTakeoverQuerySchema = z.object({
  address: publicKeySchema,
});

export const SyncTakeoverSchema = z.object({
  takeoverAddress: publicKeySchema,
  onChainEndTime: z.number().optional(),
  onChainTotalContributed: numericStringSchema.optional(),
  onChainContributorCount: z.number().min(0).optional(),
  onChainIsFinalized: z.boolean().optional(),
  onChainIsSuccessful: z.boolean().optional(),
});

// IMAGE UPLOAD SCHEMAS
export const ImageUploadSchema = z.object({
  file: z.any().refine(
    (file) => file instanceof File && file.type.startsWith('image/'),
    { message: 'Must be an image file' }
  ).refine(
    (file) => file.size <= 10 * 1024 * 1024, // 10MB
    { message: 'File size must be less than 10MB' }
  ),
});

// BILLION-SCALE SCHEMAS
export const BillionScaleClaimsQuerySchema = z.object({
  contributor: publicKeySchema,
  takeover: publicKeySchema.optional(),
  status: z.enum(['claimed', 'unclaimed', 'all']).optional(),
});

export const BillionScaleClaimSchema = z.object({
  contributionId: z.number().min(1),
  contributor: publicKeySchema,
  takeoverAddress: publicKeySchema,
  transactionSignature: z.string().min(1),
  claimMethod: z.enum(['standard', 'liquidity_enhanced']).optional(),
  jupiterSwapUsed: z.boolean().optional(),
  liquidityPoolUsed: z.boolean().optional(),
});

export const BillionScaleTakeoverSchema = z.object({
  address: publicKeySchema,
  authority: publicKeySchema,
  v1TokenMint: publicKeySchema,
  vault: publicKeySchema,
  calculatedMinAmount: numericStringSchema,
  maxSafeTotalContribution: numericStringSchema,
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  rewardRateBp: z.number().min(100).max(200), // 1.0x to 2.0x for safety
  targetParticipationBp: z.number().min(1).max(10000), // 0.01% to 100%
  v1MarketPriceLamports: numericStringSchema,
  tokenName: z.string().max(100).optional(),
  imageUrl: z.string().url().optional(),
  v1TotalSupply: numericStringSchema,
  v2TotalSupply: numericStringSchema,
  rewardPoolTokens: numericStringSchema,
  liquidityPoolTokens: numericStringSchema,
});

// Re-export takeover schemas from the main file
export * from './takeover';