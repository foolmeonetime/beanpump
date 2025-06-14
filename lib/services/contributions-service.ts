// lib/services/contributions-service.ts
import { PoolClient } from 'pg';
import { ApiError, NotFoundError } from '../middleware/error-handler';

export interface ContributionFilters {
  takeoverId?: number;
  contributor?: string;
  limit?: number;
  offset?: number;
}

export interface CreateContributionData {
  takeoverId: number;
  amount: string;
  contributor: string;
  transactionSignature: string;
}

export class ContributionsService {
  static async getContributions(db: PoolClient, filters: ContributionFilters) {
    let query = `
      SELECT 
        c.*,
        t.address as takeover_address,
        t.token_name
      FROM contributions c
      JOIN takeovers t ON c.takeover_id = t.id
    `;
    
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.takeoverId) {
      conditions.push(`c.takeover_id = $${params.length + 1}`);
      params.push(filters.takeoverId);
    }

    if (filters.contributor) {
      conditions.push(`c.contributor = $${params.length + 1}`);
      params.push(filters.contributor);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY c.created_at DESC`;

    if (filters.limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(filters.limit);
    }

    if (filters.offset) {
      query += ` OFFSET $${params.length + 1}`;
      params.push(filters.offset);
    }

    const result = await db.query(query, params);
    
    return result.rows.map(row => ({
      id: row.id,
      takeoverId: row.takeover_id,
      amount: row.amount.toString(),
      createdAt: row.created_at,
      contributor: row.contributor,
      transactionSignature: row.transaction_signature,
      takeoverAddress: row.takeover_address,
      tokenName: row.token_name
    }));
  }

  static async createContribution(db: PoolClient, data: CreateContributionData) {
    // Start a transaction to ensure data consistency
    await db.query('BEGIN');
    
    try {
      // First verify the takeover exists and is not finalized
      const takeoverResult = await db.query(`
        SELECT id, is_finalized, min_amount, calculated_min_amount 
        FROM takeovers 
        WHERE id = $1
      `, [data.takeoverId]);

      if (takeoverResult.rows.length === 0) {
        throw new NotFoundError('Takeover not found');
      }

      const takeover = takeoverResult.rows[0];
      
      if (takeover.is_finalized) {
        throw new ApiError('Cannot contribute to finalized takeover', 'TAKEOVER_FINALIZED', 400);
      }

      // Insert the contribution
      const contributionResult = await db.query(`
        INSERT INTO contributions (
          takeover_id, amount, contributor, transaction_signature, created_at
        ) VALUES ($1, $2, $3, $4, NOW())
        RETURNING *
      `, [
        data.takeoverId,
        data.amount,
        data.contributor,
        data.transactionSignature
      ]);
      
      // Update the takeover totals
      const updateResult = await db.query(`
        UPDATE takeovers 
        SET 
          total_contributed = COALESCE(total_contributed::bigint, 0) + $1::bigint,
          contributor_count = COALESCE(contributor_count, 0) + 1,
          updated_at = NOW()
        WHERE id = $2
        RETURNING total_contributed, min_amount, calculated_min_amount, is_finalized
      `, [data.amount, data.takeoverId]);
      
      await db.query('COMMIT');
      
      return {
        contribution: contributionResult.rows[0],
        takeoverUpdate: updateResult.rows[0]
      };
      
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    }
  }

  static async getContributionsByTakeover(db: PoolClient, takeoverId: number) {
    const result = await db.query(`
      SELECT 
        c.*,
        t.address as takeover_address,
        t.token_name,
        t.is_finalized,
        t.is_successful
      FROM contributions c
      JOIN takeovers t ON c.takeover_id = t.id
      WHERE c.takeover_id = $1
      ORDER BY c.created_at DESC
    `, [takeoverId]);

    return result.rows.map(row => ({
      id: row.id,
      takeoverId: row.takeover_id,
      amount: row.amount.toString(),
      contributor: row.contributor,
      transactionSignature: row.transaction_signature,
      createdAt: row.created_at,
      takeoverAddress: row.takeover_address,
      tokenName: row.token_name,
      isFinalized: row.is_finalized,
      isSuccessful: row.is_successful
    }));
  }

  static async getContributorStats(db: PoolClient, contributor: string) {
    const result = await db.query(`
      SELECT 
        COUNT(*) as total_contributions,
        SUM(CAST(amount AS BIGINT)) as total_amount,
        COUNT(DISTINCT takeover_id) as takeovers_participated
      FROM contributions
      WHERE contributor = $1
    `, [contributor]);

    return result.rows[0];
  }
}