// lib/services/takeover-service.ts - Complete TakeoverService with all methods
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
  duration?: number; // Duration in days
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

export interface TakeoverFilters {
  authority?: string;
  status?: string;
  limit?: number;
  offset?: number;
  isFinalized?: boolean;
  isSuccessful?: boolean;
}

export interface UpdateTakeoverData {
  totalContributed?: string;
  contributorCount?: number;
  isFinalized?: boolean;
  isSuccessful?: boolean;
  finalizedAt?: string;
  finalizeTransaction?: string;
  v2TokenMint?: string;
}

export class TakeoverService {
  /**
   * Create a new takeover with comprehensive logging and validation
   */
  static async createTakeover(db: PoolClient, data: CreateTakeoverData) {
    console.log('🔧 TakeoverService.createTakeover called');
    console.log('📝 Input data keys:', Object.keys(data));
    
    try {
      // Handle duration conversion to start/end times
      let startTime = data.startTime || data.start_time;
      let endTime = data.endTime || data.end_time;
      
      // If duration is provided instead of start/end times, calculate them
      if (data.duration && (!startTime || !endTime)) {
        const now = Math.floor(Date.now() / 1000);
        startTime = now.toString();
        endTime = (now + (data.duration * 24 * 60 * 60)).toString(); // duration in days
        console.log(`⏰ Converted duration ${data.duration} days to start/end times:`, {
          startTime,
          endTime,
          durationSeconds: data.duration * 24 * 60 * 60
        });
      }
      
      // Handle both camelCase and snake_case field names for backward compatibility
      const safeValues = {
        address: data.address,
        authority: data.authority,
        v1_token_mint: data.v1TokenMint || data.v1_token_mint || '',
        vault: data.vault,
        min_amount: data.minAmount || data.min_amount || '1000000',
        start_time: startTime || Math.floor(Date.now() / 1000).toString(),
        end_time: endTime || (Math.floor(Date.now() / 1000) + 604800).toString(),
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

      console.log('✅ Processed safe values:', {
        address: safeValues.address,
        authority: safeValues.authority,
        token_name: safeValues.token_name,
        reward_rate_bp: safeValues.reward_rate_bp,
        min_amount: safeValues.min_amount,
        start_time: safeValues.start_time,
        end_time: safeValues.end_time,
        created_at: safeValues.created_at
      });

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
      
      console.log('📊 Prepared query parameters:');
      console.log('Parameter count:', values.length);
      console.log('Key values:', {
        address: values[0],
        authority: values[1],
        token_name: values[13],
        start_time: values[5],
        end_time: values[6]
      });
      
      console.log('🔄 Executing database insert...');
      const queryStart = Date.now();
      
      const result = await db.query(insertQuery, values);
      
      const queryEnd = Date.now();
      console.log(`✅ Database insert completed in ${queryEnd - queryStart}ms`);
      
      if (!result.rows || result.rows.length === 0) {
        console.error('❌ No rows returned from insert query');
        throw new ApiError('Insert query returned no rows', 'NO_ROWS_RETURNED');
      }
      
      const insertedRow = result.rows[0];
      console.log('🎉 Successfully inserted takeover:');
      console.log('- ID:', insertedRow.id);
      console.log('- Address:', insertedRow.address);
      console.log('- Token Name:', insertedRow.token_name);
      console.log('- Start Time:', insertedRow.start_time);
      console.log('- End Time:', insertedRow.end_time);
      console.log('- Created At:', insertedRow.created_at);
      console.log('- Total Contributed:', insertedRow.total_contributed);
      console.log('- Is Finalized:', insertedRow.is_finalized);
      
      // Additional verification query
      console.log('🔍 Performing verification query...');
      const verifyResult = await db.query(
        'SELECT COUNT(*) as count FROM takeovers WHERE address = $1',
        [safeValues.address]
      );
      
      const count = parseInt(verifyResult.rows[0].count);
      console.log(`✅ Verification complete: ${count} takeover(s) found with address ${safeValues.address}`);
      
      if (count === 0) {
        console.error('❌ VERIFICATION FAILED: Takeover not found after insertion');
        throw new ApiError('Takeover verification failed after insertion', 'VERIFICATION_FAILED');
      }
      
      return insertedRow;
      
    } catch (error: any) {
      console.error('💥 TakeoverService.createTakeover failed:');
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      console.error('Error details:', error.detail);
      
      if (error.code === '23505') { // Unique constraint violation
        console.error('🔄 Duplicate takeover detected');
        throw new ApiError('Takeover already exists', 'DUPLICATE_TAKEOVER', 409);
      }
      
      if (error.code === '42703') { // Undefined column
        console.error('❌ Database schema mismatch - column does not exist');
        throw new ApiError('Database schema error: column does not exist', 'SCHEMA_ERROR');
      }
      
      if (error.code === '42601') { // Syntax error
        console.error('❌ SQL syntax error in query');
        throw new ApiError('Database query syntax error', 'SYNTAX_ERROR');
      }
      
      console.error('❌ Generic database error occurred');
      throw new ApiError(`Failed to create takeover: ${error.message}`, 'DATABASE_ERROR');
    }
  }

  /**
   * Get multiple takeovers with filtering and pagination
   */
  static async getTakeovers(db: PoolClient, filters: TakeoverFilters = {}) {
    console.log('📊 TakeoverService.getTakeovers called with filters:', filters);
    
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

      if (filters.authority) {
        conditions.push(`authority = $${params.length + 1}`);
        params.push(filters.authority);
      }

      if (filters.isFinalized !== undefined) {
        conditions.push(`is_finalized = $${params.length + 1}`);
        params.push(filters.isFinalized);
      }

      if (filters.isSuccessful !== undefined) {
        conditions.push(`is_successful = $${params.length + 1}`);
        params.push(filters.isSuccessful);
      }

      if (filters.status) {
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
      throw new ApiError(`Failed to get takeovers: ${error.message}`, 'DATABASE_ERROR');
    }
  }

  /**
   * Get a single takeover by address
   */
  static async getTakeoverByAddress(db: PoolClient, address: string) {
    console.log('🔍 TakeoverService.getTakeoverByAddress called for:', address);
    
    try {
      const result = await db.query(
        `SELECT 
          id, address, authority, v1_token_mint, vault, min_amount, 
          start_time, end_time, total_contributed, contributor_count, 
          is_finalized, is_successful, custom_reward_rate, token_name, 
          image_url, created_at, reward_rate_bp, calculated_min_amount, 
          max_safe_total_contribution, target_participation_bp, 
          v1_market_price_lamports, signature
        FROM takeovers WHERE address = $1`,
        [address]
      );

      if (result.rows.length === 0) {
        console.error('❌ Takeover not found for address:', address);
        throw new NotFoundError('Takeover not found');
      }

      const takeover = result.rows[0];
      console.log('✅ Found takeover:', {
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
      throw new ApiError(`Failed to get takeover: ${error.message}`, 'DATABASE_ERROR');
    }
  }

  /**
   * Update takeover data (contributions, finalization, etc.)
   */
  static async updateTakeover(db: PoolClient, address: string, updates: UpdateTakeoverData) {
    console.log('🔄 TakeoverService.updateTakeover called for:', address);
    console.log('Updates:', updates);
    
    try {
      // First verify the takeover exists
      await this.getTakeoverByAddress(db, address);

      // Build dynamic update query
      const updateFields: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (updates.totalContributed !== undefined) {
        updateFields.push(`total_contributed = $${paramIndex}`);
        params.push(updates.totalContributed);
        paramIndex++;
      }

      if (updates.contributorCount !== undefined) {
        updateFields.push(`contributor_count = $${paramIndex}`);
        params.push(updates.contributorCount);
        paramIndex++;
      }

      if (updates.isFinalized !== undefined) {
        updateFields.push(`is_finalized = $${paramIndex}`);
        params.push(updates.isFinalized);
        paramIndex++;
      }

      if (updates.isSuccessful !== undefined) {
        updateFields.push(`is_successful = $${paramIndex}`);
        params.push(updates.isSuccessful);
        paramIndex++;
      }

      if (updates.finalizedAt !== undefined) {
        updateFields.push(`finalized_at = $${paramIndex}`);
        params.push(updates.finalizedAt);
        paramIndex++;
      }

      if (updates.finalizeTransaction !== undefined) {
        updateFields.push(`finalize_tx = $${paramIndex}`);
        params.push(updates.finalizeTransaction);
        paramIndex++;
      }

      if (updates.v2TokenMint !== undefined) {
        updateFields.push(`v2_token_mint = $${paramIndex}`);
        params.push(updates.v2TokenMint);
        paramIndex++;
      }

      if (updateFields.length === 0) {
        console.warn('⚠️ No fields to update');
        return await this.getTakeoverByAddress(db, address);
      }

      // Add the address parameter at the end
      params.push(address);

      const updateQuery = `
        UPDATE takeovers 
        SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE address = $${paramIndex}
        RETURNING *
      `;

      console.log('🔄 Executing update query...');
      console.log('Query:', updateQuery.replace(/\s+/g, ' ').trim());
      console.log('Params:', params);

      const result = await db.query(updateQuery, params);

      if (result.rows.length === 0) {
        throw new ApiError('Failed to update takeover', 'UPDATE_FAILED');
      }

      console.log('✅ Takeover updated successfully');
      return result.rows[0];
      
    } catch (error: any) {
      if (error instanceof NotFoundError || error instanceof ApiError) {
        throw error;
      }
      console.error('💥 TakeoverService.updateTakeover failed:');
      console.error('Error:', error.message);
      throw new ApiError(`Failed to update takeover: ${error.message}`, 'DATABASE_ERROR');
    }
  }

  /**
   * Finalize a takeover with comprehensive validation and logging
   */
  static async finalizeTakeover(
    db: PoolClient,
    takeoverAddress: string,
    authority: string,
    isSuccessful: boolean,
    transactionSignature?: string,
    v2TokenMint?: string
  ) {
    console.log('🏁 TakeoverService.finalizeTakeover called');
    console.log('Address:', takeoverAddress);
    console.log('Authority:', authority);
    console.log('Is Successful:', isSuccessful);
    console.log('Transaction:', transactionSignature);
    console.log('V2 Token Mint:', v2TokenMint);
    
    try {
      // First verify the takeover exists and authority matches
      const takeover = await this.getTakeoverByAddress(db, takeoverAddress);
      
      if (takeover.authority !== authority) {
        console.error('❌ Authority mismatch');
        throw new ApiError('Unauthorized to finalize this takeover', 'UNAUTHORIZED', 401);
      }

      if (takeover.is_finalized) {
        console.error('❌ Takeover already finalized');
        throw new ApiError('Takeover already finalized', 'ALREADY_FINALIZED', 409);
      }

      // Build dynamic update query based on available columns
      console.log('🔍 Checking available columns...');
      const schemaResult = await db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'takeovers' AND table_schema = 'public'
      `);
      
      const availableColumns = schemaResult.rows.map(row => row.column_name);
      console.log('Available columns:', availableColumns);
      
      let updateQuery = `UPDATE takeovers SET is_finalized = true, is_successful = $1`;
      const params: any[] = [isSuccessful];
      let paramIndex = 2;

      // Handle optional columns that may or may not exist
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

      if (availableColumns.includes('has_v2_mint')) {
        updateQuery += `, has_v2_mint = $${paramIndex}`;
        const hasV2MintValue: boolean = Boolean(isSuccessful && v2TokenMint);
        params.push(hasV2MintValue);
        paramIndex++;
      }

      if (availableColumns.includes('updated_at')) {
        updateQuery += `, updated_at = $${paramIndex}`;
        params.push(new Date().toISOString());
        paramIndex++;
      }

      updateQuery += ` WHERE address = $${paramIndex} AND authority = $${paramIndex + 1} RETURNING *`;
      params.push(takeoverAddress, authority);

      console.log('🔄 Executing finalization query...');
      console.log('Query:', updateQuery.replace(/\s+/g, ' ').trim());
      console.log('Params count:', params.length);

      const result = await db.query(updateQuery, params);

      if (result.rows.length === 0) {
        console.error('❌ No rows updated in finalization');
        throw new ApiError('Failed to update takeover', 'DATABASE_ERROR');
      }

      const finalizedTakeover = result.rows[0];
      console.log('🎉 Takeover finalized successfully:');
      console.log('- ID:', finalizedTakeover.id);
      console.log('- Address:', finalizedTakeover.address);
      console.log('- Is Successful:', finalizedTakeover.is_successful);
      console.log('- Finalized At:', finalizedTakeover.finalized_at);

      return finalizedTakeover;
      
    } catch (error: any) {
      if (error instanceof NotFoundError || error instanceof ApiError) {
        throw error;
      }
      console.error('💥 TakeoverService.finalizeTakeover failed:');
      console.error('Error:', error.message);
      throw new ApiError(`Failed to finalize takeover: ${error.message}`, 'DATABASE_ERROR');
    }
  }

  /**
   * Get takeovers ready for finalization
   */
  static async getFinalizableTakeovers(db: PoolClient, authority?: string) {
    console.log('⏰ TakeoverService.getFinalizableTakeovers called');
    
    try {
      const currentTime = Math.floor(Date.now() / 1000);
      
      let query = `
        SELECT 
          id, address, authority, v1_token_mint, vault, min_amount, 
          start_time, end_time, total_contributed, contributor_count, 
          is_finalized, is_successful, custom_reward_rate, token_name, 
          image_url, created_at, reward_rate_bp, calculated_min_amount, 
          max_safe_total_contribution, target_participation_bp, 
          v1_market_price_lamports, signature
        FROM takeovers 
        WHERE is_finalized = false 
        AND (
          CAST(total_contributed AS BIGINT) >= CAST(COALESCE(calculated_min_amount, min_amount, '0') AS BIGINT)
          OR ${currentTime} >= CAST(end_time AS BIGINT)
        )
      `;
      
      const params: any[] = [];
      
      if (authority) {
        query += ` AND authority = $1`;
        params.push(authority);
      }
      
      query += ` ORDER BY end_time ASC`;

      console.log('🔄 Finding finalizable takeovers...');
      const result = await db.query(query, params);
      
      console.log(`✅ Found ${result.rows.length} takeovers ready for finalization`);
      
      return result.rows.map(row => {
        const totalContributed = BigInt(row.total_contributed || '0');
        const minAmount = BigInt(row.calculated_min_amount || row.min_amount || '0');
        const endTime = parseInt(row.end_time || '0');
        
        const isGoalMet = totalContributed >= minAmount;
        const isExpired = currentTime >= endTime;
        
        return {
          ...row,
          isGoalMet,
          isExpired,
          readyToFinalize: isGoalMet || isExpired,
          expectedOutcome: isGoalMet ? 'success' : 'failed',
        };
      });
      
    } catch (error: any) {
      console.error('💥 TakeoverService.getFinalizableTakeovers failed:');
      console.error('Error:', error.message);
      throw new ApiError(`Failed to get finalizable takeovers: ${error.message}`, 'DATABASE_ERROR');
    }
  }

  /**
   * Delete a takeover (admin function)
   */
  static async deleteTakeover(db: PoolClient, address: string, authority: string) {
    console.log('🗑️ TakeoverService.deleteTakeover called for:', address);
    
    try {
      // Verify the takeover exists and authority matches
      const takeover = await this.getTakeoverByAddress(db, address);
      
      if (takeover.authority !== authority) {
        throw new ApiError('Unauthorized to delete this takeover', 'UNAUTHORIZED', 401);
      }

      const result = await db.query(
        'DELETE FROM takeovers WHERE address = $1 AND authority = $2 RETURNING *',
        [address, authority]
      );

      if (result.rows.length === 0) {
        throw new ApiError('Failed to delete takeover', 'DELETE_FAILED');
      }

      console.log('✅ Takeover deleted successfully');
      return result.rows[0];
      
    } catch (error: any) {
      if (error instanceof NotFoundError || error instanceof ApiError) {
        throw error;
      }
      console.error('💥 TakeoverService.deleteTakeover failed:');
      console.error('Error:', error.message);
      throw new ApiError(`Failed to delete takeover: ${error.message}`, 'DATABASE_ERROR');
    }
  }

  /**
   * Get takeover statistics
   */
  static async getTakeoverStats(db: PoolClient) {
    console.log('📊 TakeoverService.getTakeoverStats called');
    
    try {
      const result = await db.query(`
        SELECT 
          COUNT(*) as total_takeovers,
          COUNT(*) FILTER (WHERE is_finalized = false) as active_takeovers,
          COUNT(*) FILTER (WHERE is_finalized = true AND is_successful = true) as successful_takeovers,
          COUNT(*) FILTER (WHERE is_finalized = true AND is_successful = false) as failed_takeovers,
          SUM(CAST(total_contributed AS BIGINT)) as total_contributed_all,
          AVG(CAST(total_contributed AS BIGINT)) as avg_contributed,
          MAX(created_at) as latest_created
        FROM takeovers
      `);

      const stats = result.rows[0];
      console.log('✅ Generated takeover statistics:', stats);
      
      return {
        totalTakeovers: parseInt(stats.total_takeovers || '0'),
        activeTakeovers: parseInt(stats.active_takeovers || '0'),
        successfulTakeovers: parseInt(stats.successful_takeovers || '0'),
        failedTakeovers: parseInt(stats.failed_takeovers || '0'),
        totalContributedAll: stats.total_contributed_all || '0',
        avgContributed: stats.avg_contributed || '0',
        latestCreated: stats.latest_created,
      };
      
    } catch (error: any) {
      console.error('💥 TakeoverService.getTakeoverStats failed:');
      console.error('Error:', error.message);
      throw new ApiError(`Failed to get takeover stats: ${error.message}`, 'DATABASE_ERROR');
    }
  }
}