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
  token_amount_target?: string | number | null;
}

/**
 * Utility function to prepare BigInt values from various input types
 */
function prepareBigIntValue(value: string | number | bigint | null | undefined): bigint | null {
  if (value === null || value === undefined || value === '') return null;
  
  try {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(Math.floor(value));
    if (typeof value === 'string') {
      const cleaned = value.replace(/[^\d]/g, '');
      return cleaned ? BigInt(cleaned) : null;
    }
    return null;
  } catch (error) {
    console.warn('Failed to convert to BigInt:', value, error);
    return null;
  }
}

/**
 * Convert database bigint fields to strings for safe JSON serialization
 */
function convertBigIntFields(takeover: any) {
  const converted = { ...takeover };
  
  // Convert all bigint fields to strings
  const bigintFields = [
    'min_amount', 'start_time', 'end_time', 'total_contributed',
    'v1_total_supply', 'v2_total_supply', 'reward_pool_tokens',
    'liquidity_pool_tokens', 'calculated_min_amount',
    'max_safe_total_contribution', 'v1_market_price_lamports', 'sol_for_liquidity'
  ];
  
  bigintFields.forEach(field => {
    if (converted[field] !== null && converted[field] !== undefined) {
      converted[field] = converted[field].toString();
    }
  });
  
  return converted;
}

/**
 * Calculate token amount target with proper type safety
 */
function calculateTokenAmountTarget(
  v1TotalSupply?: string | number | null | undefined,
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
          target_participation_bp, participation_rate_bp,
          token_amount_target, calculated_min_amount, max_safe_total_contribution,
          v1_market_price_lamports, sol_for_liquidity, signature,
          jupiter_swap_completed, lp_created, final_safety_utilization, final_reward_rate,
          created_at, updated_at
        FROM takeovers
        WHERE 1=1
      `;
      
      const params: any[] = [];
      let paramIndex = 1;

      // Add filters
      if (filters.authority) {
        query += ` AND authority = $${paramIndex}`;
        params.push(filters.authority);
        paramIndex++;
      }

      if (filters.address) {
        query += ` AND address = $${paramIndex}`;
        params.push(filters.address);
        paramIndex++;
      }

      if (filters.status) {
        switch (filters.status) {
          case 'active':
            query += ` AND is_finalized = false`;
            break;
          case 'finalized':
            query += ` AND is_finalized = true`;
            break;
          case 'successful':
            query += ` AND is_finalized = true AND is_successful = true`;
            break;
          case 'failed':
            query += ` AND is_finalized = true AND is_successful = false`;
            break;
        }
      }

      // Add ordering and pagination
      query += ` ORDER BY created_at DESC`;
      
      if (filters.limit) {
        query += ` LIMIT $${paramIndex}`;
        params.push(filters.limit);
        paramIndex++;
      }
      
      if (filters.offset) {
        query += ` OFFSET $${paramIndex}`;
        params.push(filters.offset);
        paramIndex++;
      }

      console.log('🔄 Executing getTakeovers query...');
      const queryStart = Date.now();
      const result = await db.query(query, params);
      const queryEnd = Date.now();
      
      const takeovers = result.rows.map(convertBigIntFields);
      console.log(`✅ Found ${takeovers.length} takeovers in ${queryEnd - queryStart}ms`);
      
      return takeovers;
      
    } catch (error: any) {
      console.error('💥 TakeoverService.getTakeovers failed:');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      throw new ApiError(`Failed to get takeovers: ${error.message}`, 'DATABASE_ERROR');
    }
  }

  /**
   * Get a specific takeover by address with goal checking logic
   */
  static async getTakeoverByAddress(db: PoolClient, address: string) {
    console.log('🔍 TakeoverService.getTakeoverByAddress called for:', address);
    
    try {
      const query = `
        SELECT 
          id, address, authority, v1_token_mint, vault, min_amount, 
          start_time, end_time, total_contributed, contributor_count, 
          is_finalized, is_successful, has_v2_mint, v2_token_mint, v2_total_supply,
          custom_reward_rate, token_name, image_url, v1_total_supply,
          reward_pool_tokens, liquidity_pool_tokens, reward_rate_bp, 
          target_participation_bp, participation_rate_bp,
          token_amount_target, calculated_min_amount, max_safe_total_contribution,
          v1_market_price_lamports, sol_for_liquidity, signature,
          jupiter_swap_completed, lp_created, final_safety_utilization, final_reward_rate,
          created_at, updated_at
        FROM takeovers 
        WHERE address = $1
      `;
      
      console.log('🔄 Executing getTakeoverByAddress query...');
      const queryStart = Date.now();
      const result = await db.query(query, [address]);
      const queryEnd = Date.now();

      if (result.rows.length === 0) {
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
   * Create a new takeover with token amount target
   */
  static async createTakeover(db: PoolClient, data: CreateTakeoverData) {
    console.log('💾 TakeoverService.createTakeover called with data:', {
      address: data.address,
      authority: data.authority,
      tokenName: data.token_name,
      tokenAmountTarget: data.token_amount_target,
    });
    
    try {
      // Calculate token amount target if not provided
      const tokenAmountTarget = data.token_amount_target !== undefined && data.token_amount_target !== null
        ? prepareBigIntValue(data.token_amount_target)
        : calculateTokenAmountTarget(
            data.v1_total_supply,
            undefined,
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
        tokenAmountTarget,
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
   * Update an existing takeover
   */
  static async updateTakeover(db: PoolClient, address: string, data: UpdateTakeoverData) {
    console.log('🔄 TakeoverService.updateTakeover called for:', address);
    console.log('Update data:', data);
    
    try {
      // Build dynamic update query
      const updateFields: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      // Helper function to add update field
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
   * Finalize a takeover - NEW METHOD
   */
  static async finalizeTakeover(
    db: PoolClient,
    takeoverAddress: string,
    authority: string,
    isSuccessful: boolean,
    transactionSignature: string
  ) {
    console.log('🏁 TakeoverService.finalizeTakeover called for:', {
      takeoverAddress,
      authority,
      isSuccessful,
      transactionSignature
    });
    
    try {
      // First, verify the takeover exists and belongs to the authority
      const existingTakeover = await this.getTakeoverByAddress(db, takeoverAddress);
      
      if (existingTakeover.authority !== authority) {
        throw new ApiError('Unauthorized: Only the takeover authority can finalize', 'UNAUTHORIZED', 403);
      }
      
      if (existingTakeover.is_finalized) {
        throw new ApiError('Takeover is already finalized', 'ALREADY_FINALIZED', 400);
      }
      
      // Update the takeover as finalized
      const updateData: UpdateTakeoverData = {
        is_finalized: true,
        is_successful: isSuccessful,
        // Store transaction signature in the existing signature field
        // Note: This overwrites any previous signature, but that's acceptable for finalization
      };
      
      // If successful, ensure we have a v2 token mint
      if (isSuccessful) {
        updateData.has_v2_mint = true;
        // v2_token_mint should be set from the transaction or provided separately
      }
      
      const finalizedTakeover = await this.updateTakeover(db, takeoverAddress, updateData);
      
      // Also update the signature field separately to store the finalization transaction
      await db.query(
        'UPDATE takeovers SET signature = $1 WHERE address = $2',
        [transactionSignature, takeoverAddress]
      );
      
      console.log('✅ Takeover finalized successfully:', {
        id: finalizedTakeover.id,
        address: finalizedTakeover.address,
        isSuccessful: finalizedTakeover.is_successful,
        transactionSignature: transactionSignature
      });
      
      return finalizedTakeover;
      
    } catch (error: any) {
      console.error('💥 TakeoverService.finalizeTakeover failed:');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      
      if (error instanceof ApiError || error instanceof NotFoundError) {
        throw error;
      }
      
      throw new ApiError(`Failed to finalize takeover: ${error.message}`, 'DATABASE_ERROR');
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