export interface TakeoverDbRow {
  id: number;
  address: string;
  authority: string;
  v1_token_mint: string;
  vault: string;
  min_amount: string;
  start_time: string;
  end_time: string;
  custom_reward_rate: number;
  reward_rate_bp: number;
  token_amount_target: string;
  v1_market_price_lamports: string;
  calculated_min_amount: string;
  max_safe_total_contribution: string;
  token_name: string | null;
  image_url: string | null;
  signature: string | null;
  created_at: string;
  total_contributed: string;
  contributor_count: number;
  is_finalized: boolean;
  is_successful: boolean;
  v2_token_mint: string | null;
  // Billion-scale specific fields
  v1_total_supply?: string;
  participation_rate_bp?: number;
  final_safety_utilization?: number;
  reward_pool_tokens?: string;
  has_v2_mint?: boolean;
  jupiter_swap_completed?: boolean;
  lp_created?: boolean;
  updated_at?: string;
}

export interface ContributionDbRow {
  id: number;
  takeover_id: number;
  contributor: string;
  amount: string;
  transaction_signature: string;
  created_at: string;
  is_claimed: boolean;
  claim_signature: string | null;
  claim_amount: string | null;
  claim_type: 'reward' | 'refund' | null;
  claimed_at: string | null;
  is_claimable?: boolean;
  updated_at?: string;
  // Enhanced fields
  claim_method?: string;
  jupiter_swap_used?: boolean;
  liquidity_pool_used?: boolean;
}

export interface ClaimDbJoinRow {
  // Base contribution fields
  id: number;
  takeover_id: number;
  contributor: string;
  amount: string;
  transaction_signature: string;
  created_at: string;
  is_claimed: boolean;
  claim_signature: string | null;
  claim_amount: string | null;
  claim_type: 'reward' | 'refund' | null;
  claimed_at: string | null;
  is_claimable?: boolean;
  updated_at?: string;
  // Enhanced fields
  claim_method?: string;
  jupiter_swap_used?: boolean;
  liquidity_pool_used?: boolean;
  
  // Joined takeover fields
  takeover_address: string;
  takeover_authority: string;
  token_name: string | null;
  is_successful: boolean;
  is_finalized: boolean;
  custom_reward_rate: number;
  v1_token_mint: string;
  v2_token_mint: string | null;
  vault: string;
  has_v2_mint: boolean;
  total_contributed: string;
  end_time: string;
  // Calculated fields
  calculated_claimable_amount?: string;
  calculated_claim_type?: 'reward' | 'refund';
  calculated_token_mint?: string;
}

/**
 * Enhanced claims API response types
 */
export interface EnhancedClaimResponse {
  id: number;
  takeoverId: number;
  takeoverAddress: string;
  takeoverAuthority: string;
  tokenName: string | null;
  contributionAmount: string;
  isSuccessful: boolean;
  isFinalized: boolean;
  customRewardRate: number;
  claimableAmount: string;
  tokenMint: string;
  claimType: 'reward' | 'refund';
  vault: string;
  v1TokenMint: string;
  v2TokenMint: string | null;
  hasV2Mint: boolean;
  isClaimed: boolean;
  isClaimable: boolean;
  transactionSignature: string;
  createdAt: string;
  claimedAt: string | null;
  refundAmount: string;
  rewardAmount: string;
  status: ClaimStatus;
  debugInfo: ClaimDebugInfo;
}

export interface ClaimDebugInfo {
  takeoverEndTime: string;
  currentTime: number;
  totalContributed: string;
  finalizationMissing: boolean;
}

export type ClaimStatus = 
  | 'available' 
  | 'claimed' 
  | 'pending_finalization' 
  | 'missing_token_mint' 
  | 'missing_vault';

export interface ClaimsSummary {
  total: number;
  available: number;
  claimed: number;
  pending_finalization: number;
  missing_token_mint: number;
  missing_vault: number;
}

/**
 * Billion-scale specific types
 */
export interface BillionScaleClaimDbRow extends ClaimDbJoinRow {
  v1_total_supply: string;
  participation_rate_bp: number;
  final_safety_utilization: number;
  reward_pool_tokens: string;
  jupiter_swap_completed: boolean;
  lp_created: boolean;
}

export interface BillionScaleStatistics {
  billion_scale_takeovers: number;
  successful_billion_scale: number;
  avg_reward_rate_bp: number;
  conservative_operations: number;
  with_jupiter_swap: number;
  with_liquidity_pool: number;
}

/**
 * Finalization types
 */
export interface FinalizationDbRow extends TakeoverDbRow {
  readyReason: 'time_expired' | 'target_reached';
}

export interface FinalizationResult {
  success: boolean;
  takeover: TakeoverDbRow;
  claimsInitialized: boolean;
  liquidityPoolReady: boolean;
}

/**
 * API response wrapper types
 */
export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  meta?: {
    timestamp: string;
    requestId?: string;
    pagination?: PaginationMeta;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  details?: any;
  timestamp: string;
}

export interface PaginationMeta {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * Type guards for database rows
 */
export function isTakeoverDbRow(obj: any): obj is TakeoverDbRow {
  return obj && 
    typeof obj.id === 'number' &&
    typeof obj.address === 'string' &&
    typeof obj.authority === 'string' &&
    typeof obj.v1_token_mint === 'string';
}

export function isContributionDbRow(obj: any): obj is ContributionDbRow {
  return obj && 
    typeof obj.id === 'number' &&
    typeof obj.takeover_id === 'number' &&
    typeof obj.contributor === 'string' &&
    typeof obj.amount === 'string';
}

export function isClaimDbJoinRow(obj: any): obj is ClaimDbJoinRow {
  return obj && 
    typeof obj.id === 'number' &&
    typeof obj.takeover_id === 'number' &&
    typeof obj.contributor === 'string' &&
    typeof obj.amount === 'string' &&
    typeof obj.takeover_address === 'string' &&
    (typeof obj.token_name === 'string' || obj.token_name === null);
}

/**
 * Type-safe database query result helpers
 */
export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface TypedPoolClient {
  query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
  release(): void;
}

/**
 * Enhanced error types with proper type safety
 */
export interface DatabaseError extends Error {
  code: string;
  detail?: string;
  constraint?: string;
  table?: string;
  column?: string;
}

export interface ValidationErrorDetail {
  field: string;
  message: string;
  code: string;
}

export interface EnhancedApiError {
  message: string;
  code: string;
  statusCode: number;
  details?: ValidationErrorDetail[] | any;
  timestamp: string;
  requestId?: string;
}

/**
 * Utility types for better type inference
 */
export type DatabaseTimestamp = string; // ISO timestamp string
export type SolanaAddress = string; // Base58 encoded address
export type TokenAmount = string; // String representation of BigInt
export type TransactionSignature = string; // Base58 encoded signature

/**
 * Enhanced type-safe mapper functions
 */
export class TypeSafeMappers {
  static mapTakeoverDbRowToApi(row: TakeoverDbRow): any {
    return {
      id: row.id,
      address: row.address,
      authority: row.authority,
      v1TokenMint: row.v1_token_mint,
      vault: row.vault,
      minAmount: row.min_amount,
      startTime: row.start_time,
      endTime: row.end_time,
      customRewardRate: row.custom_reward_rate,
      rewardRateBp: row.reward_rate_bp,
      tokenAmountTarget: row.token_amount_target,
      v1MarketPriceLamports: row.v1_market_price_lamports,
      calculatedMinAmount: row.calculated_min_amount,
      maxSafeTotalContribution: row.max_safe_total_contribution,
      tokenName: row.token_name,
      imageUrl: row.image_url,
      signature: row.signature,
      createdAt: row.created_at,
      totalContributed: row.total_contributed,
      contributorCount: row.contributor_count,
      isFinalized: row.is_finalized,
      isSuccessful: row.is_successful,
      v2TokenMint: row.v2_token_mint,
    };
  }

  static mapClaimDbJoinRowToEnhanced(row: ClaimDbJoinRow, currentTime: number): EnhancedClaimResponse {
    const claimableAmount = row.calculated_claimable_amount || '0';
    const tokenMint = row.calculated_token_mint || '';
    
    const isClaimAvailable = Boolean(row.is_finalized && 
                            !row.is_claimed && 
                            tokenMint && 
                            row.vault);
    
    return {
      id: row.id,
      takeoverId: row.takeover_id,
      takeoverAddress: row.takeover_address,
      takeoverAuthority: row.takeover_authority,
      tokenName: row.token_name,
      contributionAmount: row.amount,
      isSuccessful: row.is_successful,
      isFinalized: row.is_finalized,
      customRewardRate: row.custom_reward_rate,
      claimableAmount,
      tokenMint,
      claimType: row.calculated_claim_type || (row.is_successful ? 'reward' : 'refund'),
      vault: row.vault,
      v1TokenMint: row.v1_token_mint,
      v2TokenMint: row.v2_token_mint,
      hasV2Mint: row.has_v2_mint,
      isClaimed: row.is_claimed || false,
      isClaimable: isClaimAvailable,
      transactionSignature: row.transaction_signature,
      createdAt: row.created_at,
      claimedAt: row.claimed_at,
      refundAmount: row.is_successful ? '0' : row.amount,
      rewardAmount: row.is_successful ? claimableAmount : '0',
      status: this.getClaimStatus(row),
      debugInfo: {
        takeoverEndTime: row.end_time,
        currentTime,
        totalContributed: row.total_contributed,
        finalizationMissing: !row.is_finalized && parseInt(row.end_time) < currentTime
      }
    };
  }

  private static getClaimStatus(row: ClaimDbJoinRow): ClaimStatus {
    if (row.is_claimed) return 'claimed';
    if (!row.is_finalized) return 'pending_finalization';
    if (!row.calculated_token_mint) return 'missing_token_mint';
    if (!row.vault) return 'missing_vault';
    return 'available';
  }

  static createClaimsSummary(claims: EnhancedClaimResponse[]): ClaimsSummary {
    return {
      total: claims.length,
      available: claims.filter(c => c.isClaimable).length,
      claimed: claims.filter(c => c.isClaimed).length,
      pending_finalization: claims.filter(c => !c.isFinalized && c.debugInfo.finalizationMissing).length,
      missing_token_mint: claims.filter(c => !c.tokenMint).length,
      missing_vault: claims.filter(c => !c.vault).length
    };
  }
}

/**
 * Database operations interface with updated types
 */
export interface DatabaseOperations {
  getTakeovers<T extends TakeoverDbRow = TakeoverDbRow>(filters: any): Promise<T[]>;
  getTakeoverByAddress<T extends TakeoverDbRow = TakeoverDbRow>(address: string): Promise<T>;
  getContributions<T extends ContributionDbRow = ContributionDbRow>(filters: any): Promise<T[]>;
  getClaims<T extends ClaimDbJoinRow = ClaimDbJoinRow>(filters: any): Promise<T[]>;
  getEnhancedClaims(contributor: string, takeoverAddress?: string): Promise<EnhancedClaimResponse[]>;
}