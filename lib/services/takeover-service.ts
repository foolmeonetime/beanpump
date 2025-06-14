// lib/services/takeover-service.ts - Fixed TypeScript errors
import { PoolClient } from 'pg';
import { ApiError, NotFoundError } from '../middleware/error-handler';

export interface CreateTakeoverData {
  address: string;
  authority: string;
  v1TokenMint?: string;
  v1_token_mint?: string;
  vault: string;
  minAmount?: string;
  min_amount?: string;
  startTime?: string;
  start_time?: string;
  endTime?: string;
  end_time?: string;
  customRewardRate?: number;
  custom_reward_rate?: number;
  rewardRateBp?: number;
  reward_rate_bp?: number;
  targetParticipationBp?: number;
  target_participation_bp?: number;
  v1MarketPriceLamports?: string;
  v1_market_price_lamports?: string;
  calculatedMinAmount?: string;
  calculated_min_amount?: string;
  maxSafeTotalContribution?: string;
  max_safe_total_contribution?: string;
  tokenName?: string;
  token_name?: string;
  imageUrl?: string;
  image_url?: string;
  signature?: string;
}

export class TakeoverService {
  static async createTakeover(db: PoolClient, data: CreateTakeoverData) {
    // Handle both camelCase and snake_case field names for backward compatibility
    const safeValues = {
      address: data.address,
      authority: data.authority,
      v1_token_mint: data.v1TokenMint || data.v1_token_mint || '',
      vault: data.vault,
      min_amount: data.minAmount || data.min_amount || '1000000',
      start_time: data.startTime || data.start_time || Math.floor(Date.now() / 1000).toString(),
      end_time: data.endTime || data.end_time || (Math.floor(Date.now() / 1000) + 604800).toString(),
      custom_reward_rate: data.customRewardRate || data.custom_reward_rate || 1.5,
      reward_rate_bp: data.rewardRateBp || data.reward_rate_bp || Math.round((data.customRewardRate || data.custom_reward_rate || 1.5) * 100),
      target_participation_bp: data.targetParticipationBp || data.target_participation_bp || 1000,
      v1_market_price_lamports: data.v1MarketPriceLamports || data.v1_market_price_lamports || '1000000',
      calculated_min_amount: data.calculatedMinAmount || data.calculated_min_amount || data.minAmount || data.min_amount || '1000000',
      max_safe_total_contribution: data.maxSafeTotalContribution || data.max_safe_total_contribution || '100000000',
      token_name: data.tokenName || data.token_name || '',
      image_url: data.imageUrl || data.image_url || '',
      signature: data.signature || '',
      created_at: new Date().toISOString(),
      total_contributed: '0',
      contributor_count: 0,
      is_finalized: false,
      is_successful: false,
    };

    const insertQuery = `
      INSERT INTO takeovers (
        address, authority, v1_token_mint, vault, min_amount, 
        start_time, end_time, custom_reward_rate, reward_rate_bp,
        target_participation_bp, v1_market_price_lamports,
        calculated_min_amount, max_safe_total_contribution,
        token_name, image_url, signature, created_at,
        total_contributed, contributor_count, is_finalized, is_successful
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      )
      RETURNING *
    `;

    const values = Object.values(safeValues);

    try {
      const result = await db.query(insertQuery, values);
      return result.rows[0];
    } catch (error: any) {
      if (error.code === '23505') { // Unique constraint violation
        throw new ApiError('Takeover already exists', 'DUPLICATE_TAKEOVER', 409);
      }
      throw new ApiError(`Failed to create takeover: ${error.message}`, 'DATABASE_ERROR');
    }
  }

  static async getTakeovers(
    db: PoolClient,
    filters: {
      authority?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {}
  ) {
    let query = `SELECT * FROM takeovers`;
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.authority) {
      conditions.push(`authority = $${params.length + 1}`);
      params.push(filters.authority);
    }

    if (filters.status) {
      // Add status filtering logic based on your business rules
      const currentTime = Math.floor(Date.now() / 1000);
      switch (filters.status) {
        case 'active':
          conditions.push(`is_finalized = false AND ${currentTime} < CAST(end_time AS BIGINT)`);
          break;
        case 'ended':
          conditions.push(`is_finalized = false AND ${currentTime} >= CAST(end_time AS BIGINT)`);
          break;
        case 'successful':
          conditions.push(`is_finalized = true AND is_successful = true`);
          break;
        case 'failed':
          conditions.push(`is_finalized = true AND is_successful = false`);
          break;
      }
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY created_at DESC`;

    if (filters.limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(filters.limit);
    }

    if (filters.offset) {
      query += ` OFFSET $${params.length + 1}`;
      params.push(filters.offset);
    }

    const result = await db.query(query, params);
    return result.rows;
  }

  static async getTakeoverByAddress(db: PoolClient, address: string) {
    const result = await db.query(
      'SELECT * FROM takeovers WHERE address = $1',
      [address]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('Takeover not found');
    }

    return result.rows[0];
  }

 static async finalizeTakeover(
  db: PoolClient,
  takeoverAddress: string,
  authority: string,
  isSuccessful: boolean,
  transactionSignature?: string,
  v2TokenMint?: string
) {
  // First verify the takeover exists and authority matches
  const takeover = await this.getTakeoverByAddress(db, takeoverAddress);
  
  if (takeover.authority !== authority) {
    throw new ApiError('Unauthorized to finalize this takeover', 'UNAUTHORIZED', 401);
  }

  if (takeover.is_finalized) {
    throw new ApiError('Takeover already finalized', 'ALREADY_FINALIZED', 409);
  }

  // Build dynamic update query based on available columns
  const schemaResult = await db.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'takeovers' AND table_schema = 'public'
  `);
  
  const availableColumns = schemaResult.rows.map(row => row.column_name);
  
  let updateQuery = `UPDATE takeovers SET is_finalized = true, is_successful = $1`;
  const params: any[] = [isSuccessful]; // FIXED: Explicit type annotation
  let paramIndex = 2;

  // FIXED: Handle each column individually with proper types
  if (availableColumns.includes('finalized_at')) {
    updateQuery += `, finalized_at = $${paramIndex}`;
    params.push(new Date().toISOString());
    paramIndex++;
  }

  if (availableColumns.includes('finalize_tx') && transactionSignature) {
    updateQuery += `, finalize_tx = $${paramIndex}`;
    params.push(transactionSignature);
    paramIndex++;
  }

  if (availableColumns.includes('v2_token_mint') && v2TokenMint) {
    updateQuery += `, v2_token_mint = $${paramIndex}`;
    params.push(v2TokenMint);
    paramIndex++;
  }

  // FIXED Line 203: Explicit boolean conversion and type annotation
  if (availableColumns.includes('has_v2_mint')) {
    updateQuery += `, has_v2_mint = $${paramIndex}`;
    const hasV2MintValue: boolean = Boolean(isSuccessful && v2TokenMint);
    params.push(hasV2MintValue);
    paramIndex++;
  }

  // FIXED Line 209: Ensure proper parameter types
  updateQuery += ` WHERE address = $${paramIndex} AND authority = $${paramIndex + 1} RETURNING *`;
  params.push(takeoverAddress, authority);

  const result = await db.query(updateQuery, params);

  if (result.rows.length === 0) {
    throw new ApiError('Failed to update takeover', 'DATABASE_ERROR');
  }

  return result.rows[0];
}}
