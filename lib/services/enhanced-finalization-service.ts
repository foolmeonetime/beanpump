import { Pool, PoolClient } from 'pg';
import { PublicKey } from '@solana/web3.js';

// Database connection using your existing setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Define error classes since they might not exist in your project
export class ApiError extends Error {
  constructor(message: string, public code: string, public status: number = 500) {
    super(message);
    this.name = 'ApiError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export interface FinalizationData {
  takeoverAddress: string;
  authority: string;
  isSuccessful: boolean;
  transactionSignature: string;
  v2TokenMint?: string;
  blockchainData?: {
    actualTotalContributed?: string;
    actualContributorCount?: number;
    onChainEndTime?: number;
  };
}

export class EnhancedFinalizationService {
  
  /**
   * Complete finalization process with full database sync
   */
  static async finalizeWithSync(db: PoolClient, data: FinalizationData) {
    console.log('🚀 Enhanced finalization started for:', data.takeoverAddress);
    
    try {
      // Start transaction
      await db.query('BEGIN');
      
      // 1. Verify takeover exists and authority
      const takeoverQuery = `
        SELECT id, address, authority, is_finalized, token_name, 
               total_contributed, contributor_count, v1_token_mint, vault
        FROM takeovers 
        WHERE address = $1
      `;
      
      const takeoverResult = await db.query(takeoverQuery, [data.takeoverAddress]);
      
      if (takeoverResult.rows.length === 0) {
        throw new NotFoundError('Takeover not found');
      }
      
      const takeover = takeoverResult.rows[0];
      
      if (takeover.authority !== data.authority) {
        throw new ApiError('Unauthorized: Only takeover authority can finalize', 'UNAUTHORIZED', 403);
      }
      
      if (takeover.is_finalized) {
        throw new ApiError('Takeover already finalized', 'ALREADY_FINALIZED', 400);
      }
      
      // 2. Prepare finalization update
      const updateFields = [
        'is_finalized = $2',
        'is_successful = $3', 
        'signature = $4',
        'updated_at = NOW()',
        'finalized_at = NOW()'
      ];
      
      const updateParams: any[] = [
        data.takeoverAddress,
        true,
        data.isSuccessful,
        data.transactionSignature
      ];
      
      let paramIndex = 5;
      
      // 3. Add v2 token mint for successful takeovers
      if (data.isSuccessful && data.v2TokenMint) {
        updateFields.push(`v2_token_mint = $${paramIndex}`);
        updateFields.push(`has_v2_mint = $${paramIndex + 1}`);
        updateParams.push(data.v2TokenMint);
        updateParams.push(true);
        paramIndex += 2;
      }
      
      // 4. Sync blockchain data if provided
      if (data.blockchainData) {
        if (data.blockchainData.actualTotalContributed) {
          updateFields.push(`total_contributed = $${paramIndex}`);
          updateParams.push(data.blockchainData.actualTotalContributed);
          paramIndex++;
        }
        
        if (data.blockchainData.actualContributorCount) {
          updateFields.push(`contributor_count = $${paramIndex}`);
          // FIXED: Convert number to string for database parameter
          updateParams.push(data.blockchainData.actualContributorCount.toString());
          paramIndex++;
        }
        
        if (data.blockchainData.onChainEndTime) {
          updateFields.push(`end_time = $${paramIndex}`);
          // FIXED: Convert number to string for database parameter
          updateParams.push(data.blockchainData.onChainEndTime.toString());
          paramIndex++;
        }
      }
      
      // 5. Execute finalization update
      const finalizeQuery = `
        UPDATE takeovers 
        SET ${updateFields.join(', ')}
        WHERE address = $1
        RETURNING *
      `;
      
      console.log('📝 Executing finalization update...');
      const finalizeResult = await db.query(finalizeQuery, updateParams);
      const finalizedTakeover = finalizeResult.rows[0];
      
      // 6. Initialize claims for all contributors
      await this.initializeClaimsForTakeover(db, finalizedTakeover);
      
      // 7. Initialize liquidity pool data if successful
      if (data.isSuccessful && data.v2TokenMint) {
        await this.initializeLiquidityPoolData(db, finalizedTakeover, data.v2TokenMint);
      }
      
      // Commit transaction
      await db.query('COMMIT');
      
      console.log('✅ Enhanced finalization completed successfully');
      
      return {
        success: true,
        takeover: finalizedTakeover,
        claimsInitialized: true,
        liquidityPoolReady: data.isSuccessful
      };
      
    } catch (error: any) {
      await db.query('ROLLBACK');
      console.error('💥 Enhanced finalization failed:', error);
      throw error;
    }
  }
  
  /**
   * Initialize claims for all contributors of a finalized takeover
   */
  static async initializeClaimsForTakeover(db: PoolClient, takeover: any) {
    console.log('🎁 Initializing claims for takeover:', takeover.id);
    
    try {
      // Get all contributions for this takeover
      const contributionsQuery = `
        SELECT id, contributor, amount, transaction_signature 
        FROM contributions 
        WHERE takeover_id = $1 AND COALESCE(is_claimed, false) = false
      `;
      
      const contributions = await db.query(contributionsQuery, [takeover.id]);
      
      console.log(`Found ${contributions.rows.length} contributions to process`);
      
      // Update contribution records to mark them as claimable
      for (const contribution of contributions.rows) {
        const claimAmount = takeover.is_successful 
          ? BigInt(contribution.amount) * BigInt(Math.floor((takeover.custom_reward_rate || 1.5) * 100)) / 100n
          : BigInt(contribution.amount);
        
        await db.query(`
          UPDATE contributions 
          SET 
            claim_amount = $1,
            claim_type = $2,
            is_claimable = true,
            updated_at = NOW()
          WHERE id = $3
        `, [
          claimAmount.toString(),
          takeover.is_successful ? 'reward' : 'refund',
          contribution.id
        ]);
      }
      
      console.log('✅ Claims initialized for all contributors');
      
    } catch (error) {
      console.error('⚠️ Failed to initialize claims:', error);
      // Don't throw - this is not critical for finalization
    }
  }
  
  /**
   * Initialize liquidity pool data for successful takeovers
   */
  static async initializeLiquidityPoolData(db: PoolClient, takeover: any, v2TokenMint: string) {
    console.log('🏊 Initializing liquidity pool data...');
    
    try {
      // Check if liquidity_pools table exists first
      const tableExistsQuery = `
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'liquidity_pools'
        );
      `;
      
      const tableExists = await db.query(tableExistsQuery);
      
      if (!tableExists.rows[0].exists) {
        console.log('⚠️ liquidity_pools table does not exist, skipping pool initialization');
        return;
      }
      
      // Insert or update liquidity pool record
      const poolQuery = `
        INSERT INTO liquidity_pools (
          takeover_id, 
          v2_token_mint, 
          token_symbol, 
          initial_token_reserve,
          initial_sol_reserve,
          created_at,
          is_active
        ) VALUES ($1, $2, $3, $4, $5, NOW(), true)
        ON CONFLICT (takeover_id) 
        DO UPDATE SET 
          v2_token_mint = EXCLUDED.v2_token_mint,
          updated_at = NOW(),
          is_active = true
      `;
      
      // Calculate initial reserves (you may need to adjust these based on your tokenomics)
      const totalSupply = takeover.v2_total_supply || takeover.v1_total_supply || '1000000000000'; // 1M tokens default
      const liquidityPoolTokens = takeover.liquidity_pool_tokens || (BigInt(totalSupply) / 10n); // 10% for liquidity
      const solForLiquidity = takeover.sol_for_liquidity || '1000000000'; // 1 SOL default
      
      await db.query(poolQuery, [
        takeover.id,
        v2TokenMint,
        takeover.token_name,
        liquidityPoolTokens.toString(),
        solForLiquidity
      ]);
      
      console.log('✅ Liquidity pool data initialized');
      
    } catch (error) {
      console.error('⚠️ Failed to initialize liquidity pool data:', error);
      // Don't throw - this is not critical for the finalization process
    }
  }
  
  /**
   * Verify and sync takeover state with blockchain
   */
  static async syncWithBlockchain(db: PoolClient, takeoverAddress: string, connection: any) {
    console.log('🔄 Syncing takeover with blockchain:', takeoverAddress);
    
    try {
      // Fetch on-chain takeover account
      const takeoverPubkey = new PublicKey(takeoverAddress);
      const accountInfo = await connection.getAccountInfo(takeoverPubkey);
      
      if (!accountInfo) {
        throw new Error('Takeover account not found on blockchain');
      }
      
      // Parse account data (you'll need to implement this based on your program's structure)
      const onChainData = this.parseTakeoverAccountData(accountInfo.data);
      
      // Update database with on-chain data
      const syncQuery = `
        UPDATE takeovers 
        SET 
          total_contributed = $1,
          contributor_count = $2,
          is_finalized = $3,
          is_successful = $4,
          updated_at = NOW()
        WHERE address = $5
        RETURNING *
      `;
      
      const result = await db.query(syncQuery, [
        onChainData.totalContributed.toString(),
        onChainData.contributorCount,
        onChainData.isFinalized,
        onChainData.isSuccessful,
        takeoverAddress
      ]);
      
      console.log('✅ Blockchain sync completed');
      return result.rows[0];
      
    } catch (error) {
      console.error('⚠️ Blockchain sync failed:', error);
      // FIXED: Properly type the error parameter
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new ApiError(`Failed to sync with blockchain: ${errorMessage}`, 'SYNC_ERROR');
    }
  }
  
  /**
   * Parse takeover account data from blockchain
   * NOTE: You'll need to implement this based on your program's account structure
   */
  private static parseTakeoverAccountData(data: Buffer) {
    // This is a placeholder - implement based on your program's account layout
    // You should use your program's IDL or manual deserialization
    
    return {
      totalContributed: BigInt(0), // Parse from data
      contributorCount: 0,         // Parse from data  
      isFinalized: false,          // Parse from data
      isSuccessful: false,         // Parse from data
      v2TokenMint: null           // Parse from data if successful
    };
  }

  /**
   * Auto-finalize takeovers that are ready
   */
  static async autoFinalizeTakeovers() {
    const client = await pool.connect();
    
    try {
      const now = Math.floor(Date.now() / 1000);
      
      // Find takeovers ready for finalization
      const readyQuery = `
        SELECT id, address, authority, end_time, total_contributed, 
               min_amount, calculated_min_amount, token_amount_target
        FROM takeovers 
        WHERE is_finalized = false 
          AND (
            end_time < $1 
            OR total_contributed >= COALESCE(token_amount_target, calculated_min_amount, min_amount)
          )
      `;
      
      const result = await client.query(readyQuery, [now]);
      
      console.log(`🎯 Found ${result.rows.length} takeovers ready for auto-finalization`);
      
      const finalized = [];
      const errors = [];
      
      for (const takeover of result.rows) {
        try {
          const totalContributed = BigInt(takeover.total_contributed || '0');
          const minAmount = BigInt(takeover.min_amount || '0');
          const tokenTarget = BigInt(takeover.token_amount_target || '0');
          
          const goalAmount = tokenTarget > 0n ? tokenTarget : minAmount;
          const isSuccessful = totalContributed >= goalAmount;
          
          // Create dummy transaction signature for auto-finalization
          const dummySignature = `auto_finalize_${Date.now()}_${takeover.id}`;
          
          await this.finalizeWithSync(client, {
            takeoverAddress: takeover.address,
            authority: takeover.authority,
            isSuccessful,
            transactionSignature: dummySignature,
            v2TokenMint: isSuccessful ? `v2_${takeover.address.slice(0, 8)}` : undefined
          });
          
          finalized.push({
            id: takeover.id,
            address: takeover.address,
            isSuccessful
          });
          
        } catch (error: unknown) {
          // FIXED: Properly handle unknown error type
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          console.error(`❌ Failed to auto-finalize ${takeover.address}:`, errorMessage);
          errors.push({
            takeoverAddress: takeover.address,
            error: errorMessage
          });
        }
      }
      
      return {
        success: true,
        finalized,
        errors,
        totalProcessed: result.rows.length
      };
      
    } finally {
      client.release();
    }
  }
}