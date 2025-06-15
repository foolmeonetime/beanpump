// lib/schemas/takeover.ts
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

const TimestampStringSchema = z.string()
  .regex(/^\d+$/, 'Must be a valid timestamp')
  .optional();

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
  v1TokenMint: SolanaAddressSchema,
  vault: SolanaAddressSchema,
  
  // Optional basic fields
  minAmount: PositiveNumberStringSchema.optional(),
  startTime: TimestampStringSchema,
  endTime: TimestampStringSchema,
  customRewardRate: z.number()
    .min(0.1, 'Reward rate must be at least 0.1')
    .max(10, 'Reward rate must be at most 10')
    .optional(),
  tokenName: z.string()
    .min(1, 'Token name cannot be empty')
    .max(100, 'Token name must be at most 100 characters')
    .optional(),
  imageUrl: z.string()
    .url('Must be a valid URL')
    .optional(),
  
  // Billion-scale takeover fields
  rewardRateBp: z.number()
    .int('Reward rate BP must be an integer')
    .min(1, 'Reward rate BP must be at least 1')
    .max(10000, 'Reward rate BP must be at most 10000')
    .optional(),
  calculatedMinAmount: PositiveNumberStringSchema.optional(),
  maxSafeTotalContribution: PositiveNumberStringSchema.optional(),
  targetParticipationBp: z.number()
    .int('Target participation BP must be an integer')
    .min(1, 'Target participation BP must be at least 1')
    .max(10000, 'Target participation BP must be at most 10000')
    .optional(),
  v1MarketPriceLamports: PositiveNumberStringSchema.optional(),
  signature: z.string()
    .min(64, 'Signature must be at least 64 characters')
    .max(128, 'Signature must be at most 128 characters')
    .optional(),
})
.refine(data => {
  // If billion-scale fields are provided, ensure consistency
  const billionScaleFields = [
    data.rewardRateBp,
    data.calculatedMinAmount,
    data.maxSafeTotalContribution,
    data.targetParticipationBp
  ];
  
  const hasBillionScaleFields = billionScaleFields.some(field => field !== undefined);
  
  if (hasBillionScaleFields) {
    // If any billion-scale field is provided, require the essential ones
    return data.rewardRateBp !== undefined && data.calculatedMinAmount !== undefined;
  }
  
  return true;
}, {
  message: 'For billion-scale takeovers, rewardRateBp and calculatedMinAmount are required',
  path: ['rewardRateBp'],
})
.refine(data => {
  // Validate time logic
  if (data.startTime && data.endTime) {
    const start = parseInt(data.startTime);
    const end = parseInt(data.endTime);
    return start < end;
  }
  return true;
}, {
  message: 'End time must be after start time',
  path: ['endTime'],
});

/**
 * Schema for updating a takeover (PUT /api/takeovers)
 */
export const UpdateTakeoverSchema = z.object({
  address: SolanaAddressSchema,
  
  // Fields that can be updated
  totalContributed: PositiveNumberStringSchema.optional(),
  contributorCount: z.number()
    .int('Contributor count must be an integer')
    .min(0, 'Contributor count cannot be negative')
    .optional(),
  isFinalized: z.boolean().optional(),
  isSuccessful: z.boolean().optional(),
  customRewardRate: z.number()
    .min(0.1, 'Reward rate must be at least 0.1')
    .max(10, 'Reward rate must be at most 10')
    .optional(),
  tokenName: z.string()
    .min(1, 'Token name cannot be empty')
    .max(100, 'Token name must be at most 100 characters')
    .optional(),
  imageUrl: z.string()
    .url('Must be a valid URL')
    .optional(),
})
.refine(data => {
  // If takeover is marked as finalized, isSuccessful must be provided
  if (data.isFinalized === true) {
    return data.isSuccessful !== undefined;
  }
  return true;
}, {
  message: 'When finalizing a takeover, success status must be specified',
  path: ['isSuccessful'],
});

/**
 * Schema for contribution data
 */
export const ContributionSchema = z.object({
  takeoverAddress: SolanaAddressSchema,
  contributorAddress: SolanaAddressSchema,
  amount: PositiveNumberStringSchema,
  signature: z.string()
    .min(64, 'Signature must be at least 64 characters')
    .max(128, 'Signature must be at most 128 characters'),
  timestamp: TimestampStringSchema.optional(),
});

/**
 * Schema for takeover statistics query
 */
export const TakeoverStatsQuerySchema = z.object({
  timeframe: z.enum(['24h', '7d', '30d', 'all']).optional(),
  status: z.enum(['active', 'finalized', 'successful', 'failed']).optional(),
}).optional();

/**
 * Schema for image upload
 */
export const ImageUploadSchema = z.object({
  takeoverAddress: SolanaAddressSchema,
  imageType: z.enum(['logo', 'banner', 'preview']).optional(),
});

/**
 * Schema for finalization request
 */
export const FinalizeTakeoverSchema = z.object({
  address: SolanaAddressSchema,
  signature: z.string()
    .min(64, 'Signature must be at least 64 characters')
    .max(128, 'Signature must be at most 128 characters'),
  isSuccessful: z.boolean(),
  finalTotalContributed: PositiveNumberStringSchema.optional(),
  finalContributorCount: z.number()
    .int('Final contributor count must be an integer')
    .min(0, 'Final contributor count cannot be negative')
    .optional(),
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
    minAmount: PositiveNumberStringSchema.optional(),
    maxAmount: PositiveNumberStringSchema.optional(),
    rewardRateMin: z.number().min(0).optional(),
    rewardRateMax: z.number().max(10).optional(),
    createdAfter: TimestampStringSchema.optional(),
    createdBefore: TimestampStringSchema.optional(),
  }).optional(),
  sort: z.object({
    field: z.enum(['created_at', 'total_contributed', 'contributor_count', 'end_time']),
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
    isFinalized: z.boolean().optional(),
    isSuccessful: z.boolean().optional(),
    customRewardRate: z.number().min(0.1).max(10).optional(),
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
export function isValidTimestamp(timestamp: string): boolean {
  try {
    const ts = parseInt(timestamp);
    return ts > 0 && ts < Date.now() / 1000 + 365 * 24 * 60 * 60; // Within next year
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
export type ImageUploadData = z.infer<typeof ImageUploadSchema>;
export type FinalizeTakeoverData = z.infer<typeof FinalizeTakeoverSchema>;
export type SearchTakeoversData = z.infer<typeof SearchTakeoversSchema>;
export type BulkUpdateTakeoversData = z.infer<typeof BulkUpdateTakeoversSchema>;