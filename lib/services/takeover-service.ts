// lib/services/takeover-service.ts
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
  v1TokenMint: string;
  vault: string;
  minAmount?: string;
  startTime?: string;
  endTime?: string;
  customRewardRate?: number;
  tokenName?: string;
  imageUrl?: string;
  rewardRateBp?: number;
  calculatedMinAmount?: string;
  maxSafeTotalContribution?: string;
  targetParticipationBp?: number;
  v1MarketPriceLamports?: string;
  signature?: string;
}

export interface UpdateTakeoverData {
  totalContributed?: string;
  contributorCount?: number;
  isFinalized?: boolean;
  isSuccessful?: boolean;
  customRewardRate?: number;
  tokenName?: string;
  imageUrl?: string;
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
          is_finalized, is_successful, custom_reward_rate, token_name, 
          image_url, created_at, reward_rate_bp, calculated_min_amount, 
          max_safe_total_contribution, target_participation_bp, 
          v1_market_price_lamports, signature
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
        switch (filters.status.toLowerCase()) {
          case 'active':
            conditions.push(`is_finalized = false AND end_time > $${params.length + 1}`);
            params.push(Math.floor(Date.now() / 1000));
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
            params.push(Math.floor(Date.now() / 1000));
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
      
      return result.rows;
      
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
          is_finalized, is_successful, custom_reward_rate, token_name, 
          image_url, created_at, reward_rate_bp, calculated_min_amount, 
          max_safe_total_contribution, target_participation_bp, 
          v1_market_price_lamports, signature
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
      console.log(`✅ Found takeover in ${queryEnd - queryStart}ms:`, {
        id: takeover.id,
        address: takeover.address,
        tokenName: takeover.token_name,
        isFinalized: takeover.is_finalized
      });

      return takeover;
      
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
      tokenName: data.tokenName,
    });
    
    try {
      const query = `
        INSERT INTO takeovers (
          address, authority, v1_token_mint, vault, min_amount,
          start_time, end_time, total_contributed, contributor_count,
          is_finalized, is_successful, custom_reward_rate, token_name,
          image_url, reward_rate_bp, calculated_min_amount,
          max_safe_total_contribution, target_participation_bp,
          v1_market_price_lamports, signature, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW()
        )
        RETURNING *
      `;
      
      const params = [
        data.address,
        data.authority,
        data.v1TokenMint,
        data.vault,
        data.minAmount || '1000000',
        data.startTime || Math.floor(Date.now() / 1000).toString(),
        data.endTime || (Math.floor(Date.now() / 1000) + 86400 * 7).toString(), // 7 days default
        '0', // total_contributed
        0,   // contributor_count
        false, // is_finalized
        false, // is_successful
        data.customRewardRate || 1.5,
        data.tokenName || 'Unknown Token',
        data.imageUrl,
        data.rewardRateBp,
        data.calculatedMinAmount,
        data.maxSafeTotalContribution,
        data.targetParticipationBp,
        data.v1MarketPriceLamports,
        data.signature,
      ];
      
      console.log('🔄 Executing createTakeover query...');
      const queryStart = Date.now();
      const result = await db.query(query, params);
      const queryEnd = Date.now();
      
      const newTakeover = result.rows[0];
      console.log(`✅ Created takeover in ${queryEnd - queryStart}ms:`, {
        id: newTakeover.id,
        address: newTakeover.address,
        tokenName: newTakeover.token_name,
      });
      
      return newTakeover;
      
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
   * Update takeover data (contributions, finalization, etc.)
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
      if (data.totalContributed !== undefined) {
        updateFields.push(`total_contributed = $${paramCount++}`);
        params.push(data.totalContributed);
      }
      
      if (data.contributorCount !== undefined) {
        updateFields.push(`contributor_count = $${paramCount++}`);
        params.push(data.contributorCount);
      }
      
      if (data.isFinalized !== undefined) {
        updateFields.push(`is_finalized = $${paramCount++}`);
        params.push(data.isFinalized);
      }
      
      if (data.isSuccessful !== undefined) {
        updateFields.push(`is_successful = $${paramCount++}`);
        params.push(data.isSuccessful);
      }
      
      if (data.customRewardRate !== undefined) {
        updateFields.push(`custom_reward_rate = $${paramCount++}`);
        params.push(data.customRewardRate);
      }
      
      if (data.tokenName !== undefined) {
        updateFields.push(`token_name = $${paramCount++}`);
        params.push(data.tokenName);
      }
      
      if (data.imageUrl !== undefined) {
        updateFields.push(`image_url = $${paramCount++}`);
        params.push(data.imageUrl);
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
      console.log('Params:', params);
      
      const queryStart = Date.now();
      const result = await db.query(query, params);
      const queryEnd = Date.now();
      
      if (result.rows.length === 0) {
        throw new NotFoundError(`Takeover not found with address: ${address}`);
      }
      
      const updatedTakeover = result.rows[0];
      console.log(`✅ Updated takeover in ${queryEnd - queryStart}ms:`, {
        id: updatedTakeover.id,
        address: updatedTakeover.address,
        fieldsUpdated: updateFields.length,
      });
      
      return updatedTakeover;
      
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
   * Delete a takeover
   */
  static async deleteTakeover(db: PoolClient, address: string) {
    console.log('🗑️ TakeoverService.deleteTakeover called for:', address);
    
    try {
      const query = `DELETE FROM takeovers WHERE address = $1 RETURNING id, address, token_name`;
      
      console.log('🔄 Executing deleteTakeover query...');
      const queryStart = Date.now();
      const result = await db.query(query, [address]);
      const queryEnd = Date.now();
      
      if (result.rows.length === 0) {
        throw new NotFoundError(`Takeover not found with address: ${address}`);
      }
      
      const deletedTakeover = result.rows[0];
      console.log(`✅ Deleted takeover in ${queryEnd - queryStart}ms:`, {
        id: deletedTakeover.id,
        address: deletedTakeover.address,
        tokenName: deletedTakeover.token_name,
      });
      
      return deletedTakeover;
      
    } catch (error: any) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      console.error('💥 TakeoverService.deleteTakeover failed:');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      throw new ApiError(`Failed to delete takeover: ${error.message}`, 'DATABASE_ERROR');
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
          COALESCE(SUM(total_contributed::bigint), 0) as total_contributed,
          COALESCE(SUM(contributor_count), 0) as total_contributors
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
      };
      
    } catch (error: any) {
      console.error('💥 TakeoverService.getTakeoverStats failed:');
      console.error('Error:', error.message);
      console.error('Stack:', error.stack);
      throw new ApiError(`Failed to get takeover stats: ${error.message}`, 'DATABASE_ERROR');
    }
  }
}