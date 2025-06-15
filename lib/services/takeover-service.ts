// lib/services/takeover-service.ts - Complete service for your bigint schema
import { PoolClient } from 'pg';
import { ApiError, NotFoundError } from '@/lib/middleware/error-handler';

export interface TakeoverFilters {
  authority?: string;
  address?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export interface CreateTakeoverData {
  address: string;
  authority: string;
  v1_token_mint: string;
  vault: string;
  min_amount?: string | number;
  start_time?: string | number;
  end_time?: string | number;
  custom_reward_rate?: number;
  token_name?: string;
  image_url?: string;
  v2_token_mint?: string;
  v1_total_supply?: string | number;
  reward_rate_bp?: number;
  calculated_min_amount?: string | number;
  max_safe_total_contribution?: string | number;
  target_participation_bp?: number;
  v1_market_price_lamports?: string | number;
  sol_for_liquidity?: string | number;
}

export interface UpdateTakeoverData {
  total_contributed?: string | number;
  contributor_count?: number;
  is_finalized?: boolean;
  is_successful?: boolean;
  custom_reward_rate?: number;
  token_name?: string;
  image_url?: string;
  has_v2_mint?: boolean;
  v2_token_mint?: string;
  v2_total_supply?: string | number;
  reward_pool_tokens?: string | number;
  liquidity_pool_tokens?: string | number;
  participation_rate_bp?: number;
  final_safety_utilization?: number;
  final_reward_rate?: number;
  jupiter_swap_completed?: boolean;
  lp_created?: boolean;
}

/**
 * Convert database bigint values to strings for JavaScript compatibility
 */
function convertBigIntFields(row: any): any {
  return {
    ...row,
    // Convert bigint fields to strings
    min_amount: row.min_amount?.toString() || '0',
    start_time: row.start_time?.toString() || '0',
    end_time: row.end_time?.toString() || '0',
    total_contributed: row.total_contributed?.toString() || '0',
    v1_total_supply: row.v1_total_supply?.toString(),
    v2_total_supply: row.v2_total_supply?.toString(),
    calculated_min_amount: row.calculated_min_amount?.toString(),
    max_safe_total_contribution: row.max_safe_total_contribution?.toString(),
    v1_market_price_lamports: row.v1_market_price_lamports?.toString(),
    reward_pool_tokens: row.reward_pool_tokens?.toString(),
    liquidity_pool_tokens: row.liquidity_pool_tokens?.toString(),
    sol_for_liquidity: row.sol_for_liquidity?.toString(),
  };
}

/**
 * Convert input values to appropriate database types
 */
function prepareBigIntValue(value: string | number | undefined | null): bigint | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

export class TakeoverService {
  /**
   * Get multiple takeovers with optional filtering
   */
  static async getTakeovers(db: PoolClient, filters: TakeoverFilters = {}) {
    console.log('🔍 TakeoverService.getTakeovers called with filters:', filters);
    
    try {
      let query = `
        SELECT 
          id, address, authority, v1_token_mint, vault, min_amount, 
          start_time, end_time, total_contributed, contributor_count, 
          is_finalized, is_successful, has_v2_mint, v2_token_mint, v2_total_supply,
          custom_reward_rate, token_name, image_url, v1_total_supply,
          reward_pool_tokens, liquidity_pool_tokens, reward_rate_bp, 
          target_participation_bp, calculated_min_amount, max_safe_total_contribution,
          v1_market_price_lamports, sol_for_liquidity, jupiter_swap_completed,
          lp_created, participation_rate_bp, final_safety_utilization,
          final_reward_rate, created_at, updated_at
        FROM takeovers
      `;
      
      const conditions: string[] = [];
      const params: any[] = [];
      
      // Add address filter (exact match)
      if (filters.address) {
        conditions.push(`address = $${params.length + 1}`);
        params.push(filters.address);
        console.log('🔍 Adding address filter:', filters.address);
      }
      
      // Add authority filter
      if (filters.authority) {
        conditions.push(`authority = $${params.length + 1}`);
        params.push(filters.authority);
        console.log('🔍 Adding authority filter:', filters.authority);
      }
      
      // Add status filter
      if (filters.status) {
        const now = Math.floor(Date.now() / 1000);
        switch (filters.status.toLowerCase()) {
          case 'active':
            conditions.push(`is_finalized = false AND end_time > $${params.length + 1}`);
            params.push(now);
            break;
          case 'finalized':
            conditions.push(`is_finalized = true`);
            break;
          case 'successful':
            conditions.push(`is_finalized = true AND is_successful = true`);
            break;
          case 'failed':
            conditions.push(`is_finalized = true AND is_successful = false`);
            break;
          case 'expired':
            conditions.push(`is_finalized = false AND end_time <= $${params.length + 1}`);
            params.push(now);
            break;
        }
        console.log('🔍 Adding status filter:', filters.status);
      }
      
      // Add WHERE clause if we have conditions
      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }
      
      // Add ordering
      query += ` ORDER BY created_at DESC`;
      
      // Add pagination
      if (filters.limit) {
        query += ` LIMIT $${params.length + 1}`;
        params.push(filters.limit);
      }
      
      if (filters.offset) {
        query += ` OFFSET $${params.length + 1}`;
        params.push(filters.offset);
      }

      console.log('🔄 Executing getTakeovers query...');
      console.log('Query:', query.replace(/\s+/g, ' ').trim());
      console.log('Params:', params);

      const queryStart = Date.now();
      const result = await db.query(query, params);
      const queryEnd = Date.now();

      console.log(`✅ Retrieved ${result.rows.length} takeovers in ${queryEnd - queryStart}ms`);
      
      // Convert bigint values to strings for JavaScript compatibility
      return result.rows.map(convertBigIntFields);
      
    } catch (error: any) {
      console.error('💥 TakeoverService.getTakeovers failed:');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      throw new ApiError(`Failed to get takeovers: ${error.message}`, 'DATABASE_ERROR');
    }
  }

  /**
   * Get a single takeover by address
   */
  static async getTakeoverByAddress(db: PoolClient, address: string) {
    console.log('🔍 TakeoverService.getTakeoverByAddress called for:', address);
    
    if (!address || typeof address !== 'string') {
      throw new ApiError('Invalid address parameter', 'VALIDATION_ERROR');
    }
    
    try {
      const query = `
        SELECT 
          id, address, authority, v1_token_mint, vault, min_amount, 
          start_time, end_time, total_contributed, contributor_count, 
          is_finalized, is_successful, has_v2_mint, v2_token_mint, v2_total_supply,
          custom_reward_rate, token_name, image_url, v1_total_supply,
          reward_pool_tokens, liquidity_pool_tokens, reward_rate_bp, 
          target_participation_bp, calculated_min_amount, max_safe_total_contribution,
          v1_market_price_lamports, sol_for_liquidity, jupiter_swap_completed,
          lp_created, participation_rate_bp, final_safety_utilization,
          final_reward_rate, created_at, updated_at
        FROM takeovers 
        WHERE address = $1
      `;
      
      console.log('🔄 Executing getTakeoverByAddress query for:', address);
      const queryStart = Date.now();
      const result = await db.query(query, [address]);
      const queryEnd = Date.now();

      if (result.rows.length === 0) {
        console.error('❌ Takeover not found for address:', address);
        throw new NotFoundError(`Takeover not found with address: ${address}`);
      }

      const takeover = result.rows[0];
      const processedTakeover = convertBigIntFields(takeover);
      
      console.log(`✅ Found takeover in ${queryEnd - queryStart}ms:`, {
        id: processedTakeover.id,
        address: processedTakeover.address,
        tokenName: processedTakeover.token_name,
        isFinalized: processedTakeover.is_finalized
      });

      return processedTakeover;
      
    } catch (error: any) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      console.error('💥 TakeoverService.getTakeoverByAddress failed:');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      throw new ApiError(`Failed to get takeover: ${error.message}`, 'DATABASE_ERROR');
    }
  }

  /**
   * Create a new takeover
   */
  static async createTakeover(db: PoolClient, data: CreateTakeoverData) {
    console.log('💾 TakeoverService.createTakeover called with data:', {
      address: data.address,
      authority: data.authority,
      tokenName: data.token_name,
    });
    
    try {
      const query = `
        INSERT INTO takeovers (
          address, authority, v1_token_mint, vault, min_amount,
          start_time, end_time, total_contributed, contributor_count,
          is_finalized, is_successful, has_v2_mint, custom_reward_rate, 
          token_name, image_url, v2_token_mint, v1_total_supply,
          reward_rate_bp, calculated_min_amount, max_safe_total_contribution,
          target_participation_bp, v1_market_price_lamports, sol_for_liquidity
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
        )
        RETURNING *
      `;
      
      const params = [
        data.address,
        data.authority,
        data.v1_token_mint,
        data.vault,
        prepareBigIntValue(data.min_amount) || 1000000n,
        prepareBigIntValue(data.start_time) || BigInt(Math.floor(Date.now() / 1000)),
        prepareBigIntValue(data.end_time) || BigInt(Math.floor(Date.now() / 1000) + 86400 * 7),
        0n, // total_contributed
        0,  // contributor_count
        false, // is_finalized
        false, // is_successful
        false, // has_v2_mint
        data.custom_reward_rate || 1.5,
        data.token_name || 'Unknown Token',
        data.image_url,
        data.v2_token_mint,
        prepareBigIntValue(data.v1_total_supply),
        data.reward_rate_bp,
        prepareBigIntValue(data.calculated_min_amount),
        prepareBigIntValue(data.max_safe_total_contribution),
        data.target_participation_bp,
        prepareBigIntValue(data.v1_market_price_lamports),
        prepareBigIntValue(data.sol_for_liquidity) || 0n,
      ];
      
      console.log('🔄 Executing createTakeover query...');
      const queryStart = Date.now();
      const result = await db.query(query, params);
      const queryEnd = Date.now();
      
      const newTakeover = result.rows[0];
      const processedTakeover = convertBigIntFields(newTakeover);
      
      console.log(`✅ Created takeover in ${queryEnd - queryStart}ms:`, {
        id: processedTakeover.id,
        address: processedTakeover.address,
        tokenName: processedTakeover.token_name,
      });
      
      return processedTakeover;
      
    } catch (error: any) {
      console.error('💥 TakeoverService.createTakeover failed:');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      
      // Handle specific database errors
      if (error.code === '23505') { // Unique constraint violation
        throw new ApiError('Takeover with this address already exists', 'DUPLICATE_ADDRESS');
      }
      
      throw new ApiError(`Failed to create takeover: ${error.message}`, 'DATABASE_ERROR');
    }
  }

  /**
   * Update takeover data
   */
  static async updateTakeover(db: PoolClient, address: string, data: UpdateTakeoverData) {
    console.log('🔄 TakeoverService.updateTakeover called for:', address);
    console.log('📝 Update data:', data);
    
    try {
      // Build dynamic update query
      const updateFields: string[] = [];
      const params: any[] = [];
      let paramCount = 1;
      
      // Add address as the first parameter
      params.push(address);
      paramCount++;
      
      // Build update fields dynamically
      if (data.total_contributed !== undefined) {
        updateFields.push(`total_contributed = $${paramCount++}`);
        params.push(prepareBigIntValue(data.total_contributed));
      }
      
      if (data.contributor_count !== undefined) {
        updateFields.push(`contributor_count = $${paramCount++}`);
        params.push(data.contributor_count);
      }
      
      if (data.is_finalized !== undefined) {
        updateFields.push(`is_finalized = $${paramCount++}`);
        params.push(data.is_finalized);
      }
      
      if (data.is_successful !== undefined) {
        updateFields.push(`is_successful = $${paramCount++}`);
        params.push(data.is_successful);
      }
      
      if (data.custom_reward_rate !== undefined) {
        updateFields.push(`custom_reward_rate = $${paramCount++}`);
        params.push(data.custom_reward_rate);
      }
      
      if (data.token_name !== undefined) {
        updateFields.push(`token_name = $${paramCount++}`);
        params.push(data.token_name);
      }
      
      if (data.image_url !== undefined) {
        updateFields.push(`image_url = $${paramCount++}`);
        params.push(data.image_url);
      }
      
      if (data.has_v2_mint !== undefined) {
        updateFields.push(`has_v2_mint = $${paramCount++}`);
        params.push(data.has_v2_mint);
      }
      
      if (data.v2_token_mint !== undefined) {
        updateFields.push(`v2_token_mint = $${paramCount++}`);
        params.push(data.v2_token_mint);
      }
      
      if (data.v2_total_supply !== undefined) {
        updateFields.push(`v2_total_supply = $${paramCount++}`);
        params.push(prepareBigIntValue(data.v2_total_supply));
      }
      
      if (data.reward_pool_tokens !== undefined) {
        updateFields.push(`reward_pool_tokens = $${paramCount++}`);
        params.push(prepareBigIntValue(data.reward_pool_tokens));
      }
      
      if (data.liquidity_pool_tokens !== undefined) {
        updateFields.push(`liquidity_pool_tokens = $${paramCount++}`);
        params.push(prepareBigIntValue(data.liquidity_pool_tokens));
      }
      
      if (data.participation_rate_bp !== undefined) {
        updateFields.push(`participation_rate_bp = $${paramCount++}`);
        params.push(data.participation_rate_bp);
      }
      
      if (data.final_safety_utilization !== undefined) {
        updateFields.push(`final_safety_utilization = $${paramCount++}`);
        params.push(data.final_safety_utilization);
      }
      
      if (data.final_reward_rate !== undefined) {
        updateFields.push(`final_reward_rate = $${paramCount++}`);
        params.push(data.final_reward_rate);
      }
      
      if (data.jupiter_swap_completed !== undefined) {
        updateFields.push(`jupiter_swap_completed = $${paramCount++}`);
        params.push(data.jupiter_swap_completed);
      }
      
      if (data.lp_created !== undefined) {
        updateFields.push(`lp_created = $${paramCount++}`);
        params.push(data.lp_created);
      }
      
      if (updateFields.length === 0) {
        throw new ApiError('No update data provided', 'VALIDATION_ERROR');
      }
      
      const query = `
        UPDATE takeovers 
        SET ${updateFields.join(', ')}, updated_at = NOW()
        WHERE address = $1
        RETURNING *
      `;
      
      console.log('🔄 Executing updateTakeover query...');
      console.log('Query:', query.replace(/\s+/g, ' ').trim());
      console.log('Params length:', params.length);
      
      const queryStart = Date.now();
      const result = await db.query(query, params);
      const queryEnd = Date.now();
      
      if (result.rows.length === 0) {
        throw new NotFoundError(`Takeover not found with address: ${address}`);
      }
      
      const updatedTakeover = result.rows[0];
      const processedTakeover = convertBigIntFields(updatedTakeover);
      
      console.log(`✅ Updated takeover in ${queryEnd - queryStart}ms:`, {
        id: processedTakeover.id,
        address: processedTakeover.address,
        fieldsUpdated: updateFields.length,
      });
      
      return processedTakeover;
      
    } catch (error: any) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      console.error('💥 TakeoverService.updateTakeover failed:');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      throw new ApiError(`Failed to update takeover: ${error.message}`, 'DATABASE_ERROR');
    }
  }

  /**
   * Get takeover statistics
   */
  static async getTakeoverStats(db: PoolClient) {
    console.log('📊 TakeoverService.getTakeoverStats called');
    
    try {
      const query = `
        SELECT 
          COUNT(*) as total_takeovers,
          COUNT(*) FILTER (WHERE is_finalized = false) as active_takeovers,
          COUNT(*) FILTER (WHERE is_finalized = true AND is_successful = true) as successful_takeovers,
          COUNT(*) FILTER (WHERE is_finalized = true AND is_successful = false) as failed_takeovers,
          COALESCE(SUM(total_contributed), 0) as total_contributed,
          COALESCE(SUM(contributor_count), 0) as total_contributors,
          AVG(custom_reward_rate) as avg_reward_rate
        FROM takeovers
      `;
      
      console.log('🔄 Executing getTakeoverStats query...');
      const queryStart = Date.now();
      const result = await db.query(query);
      const queryEnd = Date.now();
      
      const stats = result.rows[0];
      console.log(`✅ Retrieved takeover stats in ${queryEnd - queryStart}ms:`, stats);
      
      return {
        totalTakeovers: parseInt(stats.total_takeovers),
        activeTakeovers: parseInt(stats.active_takeovers),
        successfulTakeovers: parseInt(stats.successful_takeovers),
        failedTakeovers: parseInt(stats.failed_takeovers),
        totalContributed: stats.total_contributed.toString(),
        totalContributors: parseInt(stats.total_contributors),
        avgRewardRate: parseFloat(stats.avg_reward_rate) || 0,
      };
      
    } catch (error: any) {
      console.error('💥 TakeoverService.getTakeoverStats failed:');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      throw new ApiError(`Failed to get takeover stats: ${error.message}`, 'DATABASE_ERROR');
    }
  }
}