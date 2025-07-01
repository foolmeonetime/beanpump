import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';

// ✅ ENHANCED: Comprehensive Solana address validation
const SolanaAddressSchema = z.string()
  .min(32, 'Solana address must be at least 32 characters')
  .max(44, 'Solana address must be at most 44 characters')
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, 'Invalid Solana address format - contains invalid characters')
  .refine(
    (val) => {
      try {
        new PublicKey(val);
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Invalid Solana public key - failed cryptographic validation' }
  )
  .refine(
    (val) => val !== '11111111111111111111111111111111',
    { message: 'Cannot use System Program address' }
  )
  .refine(
    (val) => val !== 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    { message: 'Cannot use Token Program address' }
  );

// ✅ ENHANCED: Comprehensive numeric string validation with BigInt support
const NumericStringSchema = z.string()
  .regex(/^\d+$/, 'Must contain only digits')
  .refine(
    (val) => {
      try {
        const bigIntVal = BigInt(val);
        return bigIntVal >= 0n;
      } catch {
        return false;
      }
    },
    { message: 'Must be a valid non-negative number' }
  )
  .refine(
    (val) => {
      try {
        const bigIntVal = BigInt(val);
        return bigIntVal <= BigInt('18446744073709551615'); // uint64 max
      } catch {
        return false;
      }
    },
    { message: 'Number too large - exceeds maximum safe value' }
  )
  .refine(
    (val) => val.length <= 20,
    { message: 'Number string too long - maximum 20 digits' }
  )
  .refine(
    (val) => !val.startsWith('0') || val === '0',
    { message: 'Invalid number format - no leading zeros except for zero itself' }
  );

// ✅ ENHANCED: Transaction signature validation with security checks
const TransactionSignatureSchema = z.string()
  .min(64, 'Transaction signature too short')
  .max(128, 'Transaction signature too long')
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, 'Invalid transaction signature format')
  .refine(
    (val) => val.length === 88 || val.length === 87,
    { message: 'Invalid Solana transaction signature length' }
  )
  .refine(
    (val) => !val.includes('000000000000'),
    { message: 'Invalid transaction signature - appears to be placeholder' }
  );

// ✅ ENHANCED: Token amount validation with precision handling
const TokenAmountSchema = NumericStringSchema
  .refine(
    (val) => {
      const amount = BigInt(val);
      return amount >= BigInt('1000000'); // Minimum 1 token with 6 decimals
    },
    { message: 'Amount too small - minimum 1 token required' }
  )
  .refine(
    (val) => {
      const amount = BigInt(val);
      return amount <= BigInt('1000000000000000000'); // Maximum reasonable amount
    },
    { message: 'Amount too large - exceeds reasonable limits' }
  );

// ✅ ENHANCED: Basis points validation with economic constraints
const BasisPointsSchema = z.number()
  .int('Basis points must be an integer')
  .min(1, 'Basis points must be at least 1')
  .max(10000, 'Basis points cannot exceed 10000 (100%)')
  .refine(
    (val) => !Number.isNaN(val) && Number.isFinite(val),
    { message: 'Invalid basis points value' }
  );

// ✅ ENHANCED: URL validation with security checks
const SecureUrlSchema = z.string()
  .url('Must be a valid URL')
  .max(500, 'URL too long - maximum 500 characters')
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
      } catch {
        return false;
      }
    },
    { message: 'Only HTTP and HTTPS URLs are allowed' }
  )
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);
        return !['localhost', '127.0.0.1', '0.0.0.0'].some(banned => 
          parsed.hostname.includes(banned)
        );
      } catch {
        return false;
      }
    },
    { message: 'Local URLs are not allowed' }
  )
  .refine(
    (url) => {
      // Basic content type validation for image URLs
      return /\.(jpg|jpeg|png|gif|webp|svg)(\?.*)?$/i.test(url) || 
             url.includes('imgur.com') || 
             url.includes('cloudinary.com') ||
             url.includes('ipfs.io');
    },
    { message: 'URL must point to a valid image resource' }
  );

// ✅ ENHANCED: File validation with comprehensive security checks
const ImageFileSchema = z.any()
  .refine(
    (file) => file instanceof File,
    { message: 'Must be a valid file' }
  )
  .refine(
    (file) => file.type.startsWith('image/'),
    { message: 'Must be an image file' }
  )
  .refine(
    (file) => file.size <= 10 * 1024 * 1024, // 10MB
    { message: 'File size must be less than 10MB' }
  )
  .refine(
    (file) => file.size >= 1024, // 1KB minimum
    { message: 'File too small - minimum 1KB required' }
  )
  .refine(
    (file) => ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type),
    { message: 'Unsupported image format - use JPEG, PNG, WebP, or GIF' }
  )
  .refine(
    (file) => !file.name.includes('../') && !file.name.includes('..\\'),
    { message: 'Invalid filename - path traversal not allowed' }
  );

// CONTRIBUTIONS SCHEMAS
export const GetContributionsQuerySchema = z.object({
  takeover_id: z.string()
    .regex(/^\d+$/, 'Takeover ID must be numeric')
    .transform(Number)
    .pipe(z.number().int().positive('Takeover ID must be positive'))
    .optional(),
  contributor: SolanaAddressSchema.optional(),
  limit: z.string()
    .regex(/^\d+$/, 'Limit must be numeric')
    .transform(Number)
    .pipe(z.number().int().min(1).max(100, 'Limit must be between 1 and 100'))
    .default('50')
    .optional(),
  offset: z.string()
    .regex(/^\d+$/, 'Offset must be numeric')
    .transform(Number)
    .pipe(z.number().int().min(0, 'Offset must be non-negative').max(10000, 'Offset too large'))
    .default('0')
    .optional(),
  status: z.enum(['all', 'claimed', 'unclaimed', 'pending']).default('all').optional(),
  sort: z.enum(['created_at', 'amount', 'updated_at']).default('created_at').optional(),
  order: z.enum(['asc', 'desc']).default('desc').optional(),
}).strict();

export const CreateContributionSchema = z.object({
  takeoverId: z.union([
    z.number().int().positive('Takeover ID must be positive'),
    z.string().regex(/^\d+$/, 'Takeover ID must be numeric').transform(Number)
  ]),
  amount: TokenAmountSchema,
  contributor: SolanaAddressSchema,
  transactionSignature: TransactionSignatureSchema,
  isLiquidityMode: z.boolean().default(false).optional(),
  memo: z.string().max(280, 'Memo too long').optional(),
}).strict()
  .refine(
    (data: any) => {
      // Cross-field validation
      if (typeof data.amount === 'string') {
        try {
          const amount = BigInt(data.amount);
          return amount >= BigInt('1000000'); // Min 1 token
        } catch {
          return false;
        }
      }
      return false;
    },
    { message: 'Contribution amount too small', path: ['amount'] }
  );

// SYNC SCHEMAS
export const SyncTakeoverQuerySchema = z.object({
  address: SolanaAddressSchema,
  force: z.string()
    .optional()
    .default('false')
    .transform(val => val === 'true'),
}).strict();

export const SyncTakeoverSchema = z.object({
  takeoverAddress: SolanaAddressSchema,
  onChainEndTime: z.number()
    .int('End time must be an integer')
    .min(0, 'End time cannot be negative')
    .max(Math.floor(Date.now() / 1000) + (365 * 24 * 3600), 'End time too far in future')
    .optional(),
  onChainTotalContributed: TokenAmountSchema.optional(),
  onChainContributorCount: z.number()
    .int('Contributor count must be an integer')
    .min(0, 'Contributor count cannot be negative')
    .max(1000000, 'Contributor count too large')
    .optional(),
  onChainIsFinalized: z.boolean().optional(),
  onChainIsSuccessful: z.boolean().optional(),
  onChainV2TokenMint: SolanaAddressSchema.optional(),
  blockHeight: z.number().int().min(0).optional(),
  slot: z.number().int().min(0).optional(),
}).strict()
  .refine(
    (data: any) => {
      // Validate logical consistency
      if (typeof data.onChainIsSuccessful === 'boolean' && typeof data.onChainIsFinalized === 'boolean') {
        if (data.onChainIsSuccessful && !data.onChainIsFinalized) {
          return false;
        }
      }
      return true;
    },
    { message: 'Cannot be successful without being finalized' }
  );

// IMAGE UPLOAD SCHEMAS
export const ImageUploadSchema = z.object({
  file: ImageFileSchema,
  title: z.string().max(100, 'Title too long').optional(),
  description: z.string().max(500, 'Description too long').optional(),
}).strict();

// ✅ COMPLETE: Billion-scale schemas with comprehensive validation
export const BillionScaleClaimsQuerySchema = z.object({
  contributor: SolanaAddressSchema,
  takeover: SolanaAddressSchema.optional(),
  status: z.enum(['claimed', 'unclaimed', 'all']).default('all').optional(),
  limit: z.string()
    .regex(/^\d+$/, 'Limit must be numeric')
    .transform(Number)
    .pipe(z.number().int().min(1).max(100))
    .default('50')
    .optional(),
  offset: z.string()
    .regex(/^\d+$/, 'Offset must be numeric')
    .transform(Number)
    .pipe(z.number().int().min(0))
    .default('0')
    .optional(),
  includeMetadata: z.string()
    .optional()
    .default('false')
    .transform(val => val === 'true'),
  minSupplyBillions: z.string()
    .regex(/^\d+$/, 'Min supply must be numeric')
    .transform(Number)
    .refine(val => val >= 1, 'Min supply must be at least 1 billion')
    .optional(),
}).strict();

export const BillionScaleClaimSchema = z.object({
  contributionId: z.number()
    .int('Contribution ID must be an integer')
    .positive('Contribution ID must be positive')
    .max(2147483647, 'Contribution ID too large'), // PostgreSQL int max
  contributor: SolanaAddressSchema,
  takeoverAddress: SolanaAddressSchema,
  transactionSignature: TransactionSignatureSchema,
  claimMethod: z.enum(['standard', 'liquidity_enhanced', 'jupiter_swap']).default('standard').optional(),
  jupiterSwapUsed: z.boolean().default(false).optional(),
  liquidityPoolUsed: z.boolean().default(false).optional(),
  estimatedSlippage: z.number()
    .min(0, 'Slippage cannot be negative')
    .max(50, 'Slippage too high - maximum 50%')
    .optional(),
  priorityFee: TokenAmountSchema.optional(),
  computeUnits: z.number()
    .int('Compute units must be an integer')
    .min(200000, 'Compute units too low')
    .max(1400000, 'Compute units too high')
    .optional(),
}).strict()
  .refine(
    (data: any) => {
      // If Jupiter swap is used, certain fields are required
      if (typeof data.jupiterSwapUsed === 'boolean' && data.jupiterSwapUsed && typeof data.estimatedSlippage !== 'number') {
        return false;
      }
      return true;
    },
    { message: 'Estimated slippage required when using Jupiter swap', path: ['estimatedSlippage'] }
  )
  .refine(
    (data: any) => {
      // Validate contributor and takeover are different
      if (typeof data.contributor === 'string' && typeof data.takeoverAddress === 'string') {
        return data.contributor !== data.takeoverAddress;
      }
      return true;
    },
    { message: 'Contributor cannot be the same as takeover address' }
  );

export const BillionScaleTakeoverSchema = z.object({
  address: SolanaAddressSchema,
  authority: SolanaAddressSchema,
  v1TokenMint: SolanaAddressSchema,
  vault: SolanaAddressSchema,
  calculatedMinAmount: TokenAmountSchema,
  maxSafeTotalContribution: TokenAmountSchema,
  startTime: z.number()
    .int('Start time must be an integer')
    .min(Math.floor(Date.now() / 1000) - 86400, 'Start time cannot be more than 1 day in the past')
    .max(Math.floor(Date.now() / 1000) + (30 * 86400), 'Start time cannot be more than 30 days in the future'),
  endTime: z.number()
    .int('End time must be an integer')
    .min(Math.floor(Date.now() / 1000) - 86400, 'End time cannot be more than 1 day in the past')
    .max(Math.floor(Date.now() / 1000) + (365 * 86400), 'End time cannot be more than 1 year in the future'),
  rewardRateBp: z.number()
    .int('Reward rate must be an integer')
    .min(100, 'Reward rate must be at least 1.0x (100bp)')
    .max(200, 'Reward rate must be at most 2.0x (200bp) for safety'),
  targetParticipationBp: BasisPointsSchema
    .min(1, 'Target participation must be at least 0.01%')
    .max(5000, 'Target participation cannot exceed 50% for safety'),
  v1MarketPriceLamports: TokenAmountSchema
    .refine(
      (val) => {
        const price = BigInt(val);
        return price >= BigInt('1000'); // Minimum 0.000001 SOL
      },
      { message: 'Price too low - minimum 0.000001 SOL' }
    )
    .refine(
      (val) => {
        const price = BigInt(val);
        return price <= BigInt('1000000000000'); // Maximum 1000 SOL
      },
      { message: 'Price too high - maximum 1000 SOL' }
    ),
  tokenName: z.string()
    .min(1, 'Token name required')
    .max(32, 'Token name too long - maximum 32 characters')
    .regex(/^[a-zA-Z0-9\s\-_]+$/, 'Token name contains invalid characters')
    .refine(
      (name) => !name.toLowerCase().includes('scam'),
      { message: 'Invalid token name' }
    )
    .optional(),
  imageUrl: SecureUrlSchema.optional(),
  v1TotalSupply: TokenAmountSchema
    .refine(
      (val) => {
        const supply = BigInt(val);
        return supply >= BigInt('1000000000000000'); // 1B tokens with 6 decimals
      },
      { message: 'Total supply too small - minimum 1 billion tokens required for billion-scale mode' }
    ),
  v2TotalSupply: TokenAmountSchema.optional(),
  rewardPoolTokens: TokenAmountSchema
    .refine(
      (val) => {
        const pool = BigInt(val);
        return pool >= BigInt('150000000000000'); // 15% of 1B tokens minimum
      },
      { message: 'Reward pool too small' }
    ),
  liquidityPoolTokens: TokenAmountSchema.optional(),
  safetyUtilizationPercent: z.number()
    .min(50, 'Safety utilization too low - minimum 50%')
    .max(98, 'Safety utilization too high - maximum 98%')
    .default(80)
    .optional(),
  conservativeMode: z.boolean().default(true).optional(),
}).strict()
  .refine(
    (data: any) => {
      // Validate time consistency
      if (typeof data.endTime === 'number' && typeof data.startTime === 'number') {
        return data.endTime > data.startTime;
      }
      return true;
    },
    { message: 'End time must be after start time', path: ['endTime'] }
  )
  .refine(
    (data: any) => {
      // Validate duration constraints
      if (typeof data.endTime === 'number' && typeof data.startTime === 'number') {
        const duration = data.endTime - data.startTime;
        return duration >= 86400 && duration <= 2592000; // 1 day to 30 days
      }
      return true;
    },
    { message: 'Duration must be between 1 and 30 days', path: ['endTime'] }
  )
  .refine(
    (data: any) => {
      // Validate authority is not the same as vault
      if (typeof data.authority === 'string' && typeof data.vault === 'string') {
        return data.authority !== data.vault;
      }
      return true;
    },
    { message: 'Authority cannot be the same as vault', path: ['vault'] }
  )
  .refine(
    (data: any) => {
      // Validate economic feasibility
      if (typeof data.maxSafeTotalContribution === 'string' && typeof data.calculatedMinAmount === 'string') {
        try {
          const maxContribution = BigInt(data.maxSafeTotalContribution);
          const minAmount = BigInt(data.calculatedMinAmount);
          return maxContribution >= minAmount;
        } catch {
          return true; // Skip validation if BigInt conversion fails
        }
      }
      return true;
    },
    { message: 'Max safe contribution must be at least the minimum amount', path: ['maxSafeTotalContribution'] }
  )
  .refine(
    (data: any) => {
      // Validate reward pool can support max contribution
      if (typeof data.rewardPoolTokens === 'string' && 
          typeof data.maxSafeTotalContribution === 'string' && 
          typeof data.rewardRateBp === 'number') {
        try {
          const rewardPool = BigInt(data.rewardPoolTokens);
          const maxContribution = BigInt(data.maxSafeTotalContribution);
          const rewardRate = data.rewardRateBp / 10000;
          const requiredRewards = maxContribution * BigInt(Math.floor(rewardRate * 10000)) / BigInt(10000);
          
          return rewardPool >= requiredRewards;
        } catch {
          return true; // Skip validation if calculations fail
        }
      }
      return true;
    },
    { message: 'Reward pool insufficient for maximum safe contribution', path: ['rewardPoolTokens'] }
  );

// ✅ ENHANCED: Finalization schemas with security validation
export const FinalizeQuerySchema = z.object({
  authority: SolanaAddressSchema.optional(),
  includeMetrics: z.string()
    .transform(val => val === 'true')
    .pipe(z.boolean())
    .default(false)
    .optional(),
}).strict();

export const FinalizeTakeoverSchema = z.object({
  takeoverAddress: SolanaAddressSchema,
  authority: SolanaAddressSchema,
  isSuccessful: z.boolean(),
  transactionSignature: TransactionSignatureSchema,
  finalTotalContributed: TokenAmountSchema.optional(),
  finalContributorCount: z.number()
    .int('Contributor count must be an integer')
    .min(0, 'Contributor count cannot be negative')
    .max(1000000, 'Contributor count too large')
    .optional(),
  v2TokenMint: SolanaAddressSchema.optional(),
  liquidityPoolCreated: z.boolean().default(false).optional(),
  jupiterMarketId: SolanaAddressSchema.optional(),
  blockHeight: z.number().int().min(0).optional(),
  slot: z.number().int().min(0).optional(),
}).strict()
  .refine(
    (data: any) => {
      // If successful, v2TokenMint should be provided
      if (typeof data.isSuccessful === 'boolean' && data.isSuccessful && !data.v2TokenMint) {
        return false;
      }
      return true;
    },
    { message: 'V2 token mint required for successful takeovers', path: ['v2TokenMint'] }
  )
  .refine(
    (data: any) => {
      // Authority cannot be zero address (additional safety)
      if (typeof data.authority === 'string') {
        return data.authority !== '11111111111111111111111111111111';
      }
      return true;
    },
    { message: 'Invalid authority address', path: ['authority'] }
  );

// ✅ ADDED: Health check schema
export const HealthCheckSchema = z.object({
  includeDetails: z.string()
    .optional()
    .default('false')
    .transform(val => val === 'true'),
  component: z.enum(['database', 'blockchain', 'cache', 'all']).default('all').optional(),
}).strict();

// ✅ ADDED: Monitoring schema
export const MonitoringQuerySchema = z.object({
  metric: z.enum(['claims', 'takeovers', 'contributions', 'errors', 'performance']).optional(),
  timeframe: z.enum(['1h', '24h', '7d', '30d']).default('24h').optional(),
  format: z.enum(['json', 'csv']).default('json').optional(),
}).strict();

// Re-export all takeover schemas
export * from './takeover';

// ✅ ADDED: Schema validation helpers
export const SchemaValidationHelpers = {
  isValidSolanaAddress: (address: string): boolean => {
    return SolanaAddressSchema.safeParse(address).success;
  },
  
  isValidTransactionSignature: (signature: string): boolean => {
    return TransactionSignatureSchema.safeParse(signature).success;
  },
  
  isValidTokenAmount: (amount: string): boolean => {
    return TokenAmountSchema.safeParse(amount).success;
  },
  
  isValidBasisPoints: (bp: number): boolean => {
    return BasisPointsSchema.safeParse(bp).success;
  },
  
  validateImageFile: (file: File): { valid: boolean; error?: string } => {
    const result = ImageFileSchema.safeParse(file);
    return {
      valid: result.success,
      error: result.success ? undefined : result.error.issues[0]?.message
    };
  },
  
  validateCrossFieldConsistency: (data: any): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    // Check for logical inconsistencies across schemas
    if (typeof data.isSuccessful === 'boolean' && typeof data.isFinalized === 'boolean') {
      if (data.isSuccessful && !data.isFinalized) {
        errors.push('Cannot be successful without being finalized');
      }
    }
    
    if (typeof data.endTime === 'number' && typeof data.startTime === 'number') {
      if (data.endTime <= data.startTime) {
        errors.push('End time must be after start time');
      }
    }
    
    if (typeof data.maxSafeTotalContribution === 'string' && typeof data.calculatedMinAmount === 'string') {
      try {
        const max = BigInt(data.maxSafeTotalContribution);
        const min = BigInt(data.calculatedMinAmount);
        if (max < min) {
          errors.push('Max safe contribution cannot be less than minimum amount');
        }
      } catch {
        // Skip validation if BigInt conversion fails
      }
    }
    
    return { valid: errors.length === 0, errors };
  }
};

// ✅ ADDED: Export all validation constants
export const VALIDATION_CONSTANTS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_URL_LENGTH: 500,
  MAX_TOKEN_NAME_LENGTH: 32,
  MAX_MEMO_LENGTH: 280,
  MIN_TOKEN_AMOUNT: '1000000', // 1 token with 6 decimals
  MAX_TOKEN_AMOUNT: '1000000000000000000', // 1B tokens with 9 decimals
  MIN_REWARD_RATE_BP: 100,
  MAX_REWARD_RATE_BP: 200,
  MIN_PARTICIPATION_BP: 1,
  MAX_PARTICIPATION_BP: 5000,
  MIN_DURATION_SECONDS: 86400, // 1 day
  MAX_DURATION_SECONDS: 2592000, // 30 days
  BILLION_SCALE_MIN_SUPPLY: '1000000000000000', // 1B tokens with 6 decimals
} as const;