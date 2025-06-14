// lib/services/sync-service.ts
import { PoolClient } from 'pg';
import { ApiError, NotFoundError } from '../middleware/error-handler';

export interface SyncData {
  takeoverAddress: string;
  onChainEndTime?: number;
  onChainTotalContributed?: string;
  onChainContributorCount?: number;
  onChainIsFinalized?: boolean;
  onChainIsSuccessful?: boolean;
}

export class SyncService {
  static async getTakeoverSyncStatus(db: PoolClient, takeoverAddress: string) {
    const result = await db.query(`
      SELECT 
        address,
        end_time,
        total_contributed,
        contributor_count,
        is_finalized,
        is_successful,
        updated_at,
        token_name,
        created_at
      FROM takeovers 
      WHERE address = $1
    `, [takeoverAddress]);
    
    if (result.rows.length === 0) {
      throw new NotFoundError('Takeover not found');
    }
    
    const takeover = result.rows[0];
    
    return {
      address: takeover.address,
      endTime: takeover.end_time.toString(),
      totalContributed: takeover.total_contributed.toString(),
      contributorCount: takeover.contributor_count,
      isFinalized: takeover.is_finalized,
      isSuccessful: takeover.is_successful,
      lastUpdated: takeover.updated_at,
      tokenName: takeover.token_name,
      createdAt: takeover.created_at
    };
  }

  static async syncTakeoverWithBlockchain(db: PoolClient, data: SyncData) {
    const { takeoverAddress, ...updateData } = data;

    // First, get the current database state
    const currentResult = await db.query(`
      SELECT * FROM takeovers WHERE address = $1
    `, [takeoverAddress]);
    
    if (currentResult.rows.length === 0) {
      throw new NotFoundError('Takeover not found in database');
    }
    
    const currentData = currentResult.rows[0];
    
    // Build dynamic update query based on provided data
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (updateData.onChainEndTime !== undefined) {
      updates.push(`end_time = $${paramIndex}`);
      params.push(updateData.onChainEndTime);
      paramIndex++;
    }

    if (updateData.onChainTotalContributed !== undefined) {
      updates.push(`total_contributed = $${paramIndex}`);
      params.push(updateData.onChainTotalContributed);
      paramIndex++;
    }

    if (updateData.onChainContributorCount !== undefined) {
      updates.push(`contributor_count = $${paramIndex}`);
      params.push(updateData.onChainContributorCount);
      paramIndex++;
    }

    if (updateData.onChainIsFinalized !== undefined) {
      updates.push(`is_finalized = COALESCE($${paramIndex}, is_finalized)`);
      params.push(updateData.onChainIsFinalized);
      paramIndex++;
    }

    if (updateData.onChainIsSuccessful !== undefined) {
      updates.push(`is_successful = COALESCE($${paramIndex}, is_successful)`);
      params.push(updateData.onChainIsSuccessful);
      paramIndex++;
    }

    // Always update the timestamp
    updates.push(`updated_at = NOW()`);

    if (updates.length === 1) { // Only timestamp update
      throw new ApiError('No sync data provided', 'NO_SYNC_DATA', 400);
    }

    const updateQuery = `
      UPDATE takeovers 
      SET ${updates.join(', ')}
      WHERE address = $${paramIndex}
      RETURNING *
    `;
    params.push(takeoverAddress);

    const updateResult = await db.query(updateQuery, params);
    
    if (updateResult.rows.length === 0) {
      throw new ApiError('Failed to update takeover', 'UPDATE_FAILED', 500);
    }
    
    const updatedData = updateResult.rows[0];
    
    // Calculate and return the changes
    const changes = {
      endTime: {
        old: currentData.end_time,
        new: updatedData.end_time,
        changed: currentData.end_time !== updatedData.end_time
      },
      totalContributed: {
        old: currentData.total_contributed,
        new: updatedData.total_contributed,
        changed: currentData.total_contributed !== updatedData.total_contributed
      },
      contributorCount: {
        old: currentData.contributor_count,
        new: updatedData.contributor_count,
        changed: currentData.contributor_count !== updatedData.contributor_count
      },
      isFinalized: {
        old: currentData.is_finalized,
        new: updatedData.is_finalized,
        changed: currentData.is_finalized !== updatedData.is_finalized
      },
      isSuccessful: {
        old: currentData.is_successful,
        new: updatedData.is_successful,
        changed: currentData.is_successful !== updatedData.is_successful
      }
    };

    return {
      changes,
      takeover: {
        id: updatedData.id,
        address: updatedData.address,
        authority: updatedData.authority,
        endTime: updatedData.end_time.toString(),
        totalContributed: updatedData.total_contributed.toString(),
        contributorCount: updatedData.contributor_count,
        isFinalized: updatedData.is_finalized,
        isSuccessful: updatedData.is_successful,
        tokenName: updatedData.token_name,
        lastUpdated: updatedData.updated_at
      }
    };
  }

  static async getSyncStatistics(db: PoolClient) {
    const result = await db.query(`
      SELECT 
        COUNT(*) as total_takeovers,
        COUNT(*) FILTER (WHERE is_finalized = true) as finalized_takeovers,
        COUNT(*) FILTER (WHERE is_finalized = false) as active_takeovers,
        COUNT(*) FILTER (WHERE is_successful = true) as successful_takeovers,
        COUNT(*) FILTER (WHERE updated_at > NOW() - INTERVAL '1 hour') as recently_synced,
        AVG(EXTRACT(EPOCH FROM (NOW() - updated_at))) as avg_time_since_sync
      FROM takeovers
    `);

    return result.rows[0];
  }
}