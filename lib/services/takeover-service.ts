import { PoolClient } from 'pg';
import { ApiError, NotFoundError } from '../middleware/error-handler';

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
  min_amount?: string | number | null;
  start_time?: string | number | null;
  end_time?: string | number | null;
  custom_reward_rate?: number;
  token_name?: string;
  image_url?: string;
  has_v2_mint?: boolean;
  v2_token_mint?: string;
  v1_total_supply?: string | number | null;
  v2_total_supply?: string | number | null;
  reward_rate_bp?: number;
  // UPDATED: Use token_amount_target instead of target_participation_bp
  token_amount_target?: string | number | null;
  calculated_min_amount?: string | number | null;
  max_safe_total_contribution?: string | number | null;
  v1_market_price_lamports?: string | number | null;
  sol_for_liquidity?: string | number | null;
  reward_pool_tokens?: string | number | null;
  liquidity_pool_tokens?: string | number | null;
}

export interface UpdateTakeoverData {
  total_contributed?: string | number | null;
  contributor_count?: number;
  is_finalized?: boolean;
  is_successful?: boolean;
  custom_reward_rate?: number;
  token_name?: string;
  image_url?: string;
  has_v2_mint?: boolean;
  v2_token_mint?: string;
  v2_total_supply?: string | number | null;
  reward_pool_tokens?: string | number | null;
  liquidity_pool_tokens?: string | number | null;
  participation_rate_bp?: number;
  final_safety_utilization?: number;
  final_reward_rate?: number;
  jupiter_swap_completed?: boolean;
  lp_created?: boolean;
  // UPDATED: Support token amount target updates
  token_amount_target?: string | number | null;
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
    // UPDATED: Convert token amount target
    token_amount_target: row.token_amount_target?.toString() || '0',
    // Keep backwards compatibility - map token_amount_target to minAmount for UI
    minAmount: row.token_amount_target?.toString() || row.calculated_min_amount?.toString() || row.min_amount?.toString() || '0',
  };
}

/**
 * Convert input values to appropriate database types - FIXED type safety
 */
function prepareBigIntValue(value: string | number | null | undefined): bigint | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

/**
 * Calculate token amount target from legacy target_participation_bp - FIXED type safety
 */
function calculateTokenAmountTarget(
  v1TotalSupply: string | number | null | undefined,
  targetParticipationBp?: number,
  calculatedMinAmount?: string | number | null | undefined,
  minAmount?: string | number | null | undefined
): bigint {
  // Priority 1: Use calculated min amount if available
  if (calculatedMinAmount !== undefined && calculatedMinAmount !== null) {
    const calculated = prepareBigIntValue(calculatedMinAmount);
    if (calculated && calculated > 0n) return calculated;
  }
  
  // Priority 2: Calculate from total supply and participation BP
  if (v1TotalSupply !== undefined && v1TotalSupply !== null && targetParticipationBp && targetParticipationBp > 0) {
    const totalSupply = prepareBigIntValue(v1TotalSupply);
    if (totalSupply && totalSupply > 0n) {
      return totalSupply * BigInt(targetParticipationBp) / 10000n;
    }
  }
  
  // Priority 3: Use min amount if available
  if (minAmount !== undefined && minAmount !== null) {
    const min = prepareBigIntValue(minAmount);
    if (min && min > 0n) return min;
  }
  
  // Default: 1M tokens
  return 1000000n;
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
          token_amount_target, calculated_min_amount, max_safe_total_contribution,
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
      
      // Convert bigint values to strings and add legacy compatibility
      return result.rows.map(row => {
        const processed = convertBigIntFields(row);
        
        // UPDATED: Enhanced goal checking using token_amount_target
        const totalContributed = BigInt(processed.total_contributed || '0');
        const tokenTarget = BigInt(processed.token_amount_target || '0');
        const calculatedMin = BigInt(processed.calculated_min_amount || '0');
        
        // Use token_amount_target as primary goal, fall back to calculated_min_amount
        const goalAmount = tokenTarget > 0n ? tokenTarget : calculatedMin;
        processed.isGoalMet = totalContributed >= goalAmount;
        processed.progressPercent = goalAmount > 0n 
          ? Math.min(100, Number(totalContributed * 100n / goalAmount))
          : 0;
        
        return processed;
      });
      
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
          token_amount_target, calculated_min_amount, max_safe_total_contribution,
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
      
      // Add goal checking logic
      const totalContributed = BigInt(processedTakeover.total_contributed || '0');
      const tokenTarget = BigInt(processedTakeover.token_amount_target || '0');
      const calculatedMin = BigInt(processedTakeover.calculated_min_amount || '0');
      
      const goalAmount = tokenTarget > 0n ? tokenTarget : calculatedMin;
      processedTakeover.isGoalMet = totalContributed >= goalAmount;
      processedTakeover.progressPercent = goalAmount > 0n 
        ? Math.min(100, Number(totalContributed * 100n / goalAmount))
        : 0;
      
      console.log(`✅ Found takeover in ${queryEnd - queryStart}ms:`, {
        id: processedTakeover.id,
        address: processedTakeover.address,
        tokenName: processedTakeover.token_name,
        isFinalized: processedTakeover.is_finalized,
        isGoalMet: processedTakeover.isGoalMet,
        tokenTarget: processedTakeover.token_amount_target
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
   * Create a new takeover with token amount target - FIXED type safety
   */
  static async createTakeover(db: PoolClient, data: CreateTakeoverData) {
    console.log('💾 TakeoverService.createTakeover called with data:', {
      address: data.address,
      authority: data.authority,
      tokenName: data.token_name,
      tokenAmountTarget: data.token_amount_target,
    });
    
    try {
      // UPDATED: Calculate token amount target if not provided - FIXED type safety
      const tokenAmountTarget = data.token_amount_target !== undefined && data.token_amount_target !== null
        ? prepareBigIntValue(data.token_amount_target)
        : calculateTokenAmountTarget(
            data.v1_total_supply,
            undefined, // No longer using target_participation_bp
            data.calculated_min_amount,
            data.min_amount
          );

      const query = `
        INSERT INTO takeovers (
          address, authority, v1_token_mint, vault, min_amount,
          start_time, end_time, total_contributed, contributor_count,
          is_finalized, is_successful, has_v2_mint, custom_reward_rate, 
          token_name, image_url, v2_token_mint, v1_total_supply,
          reward_rate_bp, token_amount_target, calculated_min_amount, max_safe_total_contribution,
          v1_market_price_lamports, sol_for_liquidity
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
        tokenAmountTarget, // UPDATED: Use calculated token amount target
        tokenAmountTarget, // Set calculated_min_amount to same value for consistency
        prepareBigIntValue(data.max_safe_total_contribution),
        prepareBigIntValue(data.v1_market_price_lamports),
        prepareBigIntValue(data.sol_for_liquidity) || 0n,
      ];
      
      console.log('🔄 Executing createTakeover query...');
      console.log('Token amount target:', tokenAmountTarget?.toString());
      const queryStart = Date.now();
      const result = await db.query(query, params);
      const queryEnd = Date.now();
      
      const newTakeover = result.rows[0];
      const processedTakeover = convertBigIntFields(newTakeover);
      
      console.log(`✅ Created takeover in ${queryEnd - queryStart}ms:`, {
        id: processedTakeover.id,
        address: processedTakeover.address,
        tokenName: processedTakeover.token_name,
        tokenAmountTarget: processedTakeover.token_amount_target,
      });
      
      return processedTakeover;
      
    } catch (error: any) {
      console.error('💥 TakeoverService.createTakeover failed:');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      throw new ApiError(`Failed to create takeover: ${error.message}`, 'DATABASE_ERROR');
    }
  }

  /**
   * Update an existing takeover - FIXED type safety
   */
  static async updateTakeover(db: PoolClient, address: string, data: UpdateTakeoverData) {
    console.log('🔄 TakeoverService.updateTakeover called for:', address);
    console.log('Update data:', data);
    
    try {
      // Build dynamic update query
      const updateFields: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      // Helper function to add update field - FIXED type safety
      const addField = (field: string, value: any, transformer?: (val: any) => any) => {
        if (value !== undefined) {
          updateFields.push(`${field} = $${paramIndex}`);
          params.push(transformer ? transformer(value) : value);
          paramIndex++;
        }
      };

      // Add all possible update fields
      addField('total_contributed', data.total_contributed, prepareBigIntValue);
      addField('contributor_count', data.contributor_count);
      addField('is_finalized', data.is_finalized);
      addField('is_successful', data.is_successful);
      addField('custom_reward_rate', data.custom_reward_rate);
      addField('token_name', data.token_name);
      addField('image_url', data.image_url);
      addField('has_v2_mint', data.has_v2_mint);
      addField('v2_token_mint', data.v2_token_mint);
      addField('v2_total_supply', data.v2_total_supply, prepareBigIntValue);
      addField('reward_pool_tokens', data.reward_pool_tokens, prepareBigIntValue);
      addField('liquidity_pool_tokens', data.liquidity_pool_tokens, prepareBigIntValue);
      addField('participation_rate_bp', data.participation_rate_bp);
      addField('final_safety_utilization', data.final_safety_utilization);
      addField('final_reward_rate', data.final_reward_rate);
      addField('jupiter_swap_completed', data.jupiter_swap_completed);
      addField('lp_created', data.lp_created);
      // UPDATED: Support token amount target updates
      addField('token_amount_target', data.token_amount_target, prepareBigIntValue);

      if (updateFields.length === 0) {
        throw new ApiError('No valid fields to update', 'VALIDATION_ERROR');
      }

      // Always update the updated_at timestamp
      updateFields.push(`updated_at = NOW()`);

      const query = `
        UPDATE takeovers 
        SET ${updateFields.join(', ')}
        WHERE address = $${paramIndex}
        RETURNING *
      `;
      params.push(address);

      console.log('🔄 Executing updateTakeover query...');
      console.log('Fields to update:', updateFields);
      const queryStart = Date.now();
      const result = await db.query(query, params);
      const queryEnd = Date.now();

      if (result.rows.length === 0) {
        throw new NotFoundError(`Takeover not found with address: ${address}`);
      }

      const updatedTakeover = result.rows[0];
      const processedTakeover = convertBigIntFields(updatedTakeover);
      
      // Add goal checking logic
      const totalContributed = BigInt(processedTakeover.total_contributed || '0');
      const tokenTarget = BigInt(processedTakeover.token_amount_target || '0');
      const calculatedMin = BigInt(processedTakeover.calculated_min_amount || '0');
      
      const goalAmount = tokenTarget > 0n ? tokenTarget : calculatedMin;
      processedTakeover.isGoalMet = totalContributed >= goalAmount;
      processedTakeover.progressPercent = goalAmount > 0n 
        ? Math.min(100, Number(totalContributed * 100n / goalAmount))
        : 0;
      
      console.log(`✅ Updated takeover in ${queryEnd - queryStart}ms:`, {
        id: processedTakeover.id,
        address: processedTakeover.address,
        fieldsUpdated: updateFields.length,
        isGoalMet: processedTakeover.isGoalMet,
        tokenTarget: processedTakeover.token_amount_target
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
          AVG(custom_reward_rate) as avg_reward_rate,
          COALESCE(SUM(CAST(token_amount_target AS BIGINT)), 0) as total_token_targets
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
        totalTokenTargets: stats.total_token_targets.toString(),
      };
      
    } catch (error: any) {
      console.error('💥 TakeoverService.getTakeoverStats failed:');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      throw new ApiError(`Failed to get takeover stats: ${error.message}`, 'DATABASE_ERROR');
    }
  }
}