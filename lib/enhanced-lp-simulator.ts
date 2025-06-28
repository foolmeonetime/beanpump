import { Pool, PoolClient } from 'pg';
import { PublicKey } from '@solana/web3.js';

// Database connection using your existing setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export interface DatabasePoolData {
  takeoverId: number;
  takeoverAddress: string;
  tokenName: string;
  v2TokenMint: string;
  initialTokenReserve: string;
  initialSolReserve: string;
  isActive: boolean;
  totalSupply?: string;
  circulatingSupply?: string;
}

export interface EnhancedSimulatedPool {
  id: string;
  takeoverAddress: string;
  tokenMint: string;
  tokenSymbol: string;
  solReserve: number;
  tokenReserve: number;
  lpTokenSupply: number;
  fee: number;
  volume24h: number;
  totalValueLocked: number;
  createdAt: number;
  isFromDatabase: boolean;
  transactions: PoolTransaction[];
  priceHistory: PricePoint[];
  lastDatabaseSync: number;
}

export interface PoolTransaction {
  id: string;
  type: 'swap' | 'add_liquidity' | 'remove_liquidity';
  timestamp: number;
  user: string;
  solAmount?: number;
  tokenAmount?: number;
  lpTokens?: number;
  priceImpact: number;
  fee: number;
}

export interface PricePoint {
  timestamp: number;
  price: number;
  solReserve: number;
  tokenReserve: number;
}

export interface SwapResult {
  outputAmount: number;
  priceImpact: number;
  fee: number;
  newSolReserve: number;
  newTokenReserve: number;
  slippage: number;
}

export interface PoolAnalytics {
  poolId: string;
  currentPrice: number;
  priceChange24h: number;
  maxPrice24h: number;
  minPrice24h: number;
  volume24h: number;
  totalValueLocked: number;
  solReserve: number;
  tokenReserve: number;
  lpTokenSupply: number;
  transactionCount: number;
  averageTradeSize: number;
}

export class EnhancedLiquiditySimulator {
  private pools: Map<string, EnhancedSimulatedPool> = new Map();
  private databaseSyncInterval: NodeJS.Timeout | null = null;
  private isDestroyed: boolean = false;

  constructor() {
    this.startDatabaseSync();
  }

  /**
   * Start periodic sync with database for finalized takeovers
   */
  private startDatabaseSync() {
    if (this.isDestroyed) return;
    
    // Sync every 30 seconds
    this.databaseSyncInterval = setInterval(async () => {
      if (this.isDestroyed) return;
      
      try {
        await this.syncWithDatabase();
      } catch (error) {
        console.error('🔄 Database sync failed:', error);
      }
    }, 30000);

    // Initial sync
    this.syncWithDatabase().catch(error => {
      console.error('🔄 Initial database sync failed:', error);
    });
  }

  /**
   * Sync pools with database for finalized successful takeovers
   */
  async syncWithDatabase(): Promise<void> {
    if (this.isDestroyed) return;
    
    console.log('🔄 Syncing LP simulator with database...');

    let client: PoolClient | null = null;
    
    try {
      client = await pool.connect();
      
      // Query for successful, finalized takeovers with v2 tokens
      const query = `
        SELECT 
          t.id as takeover_id,
          t.address as takeover_address,
          t.token_name,
          t.v2_token_mint,
          t.v2_total_supply,
          t.liquidity_pool_tokens,
          t.sol_for_liquidity,
          t.total_contributed,
          t.is_finalized,
          t.is_successful,
          t.has_v2_mint,
          t.created_at,
          lp.initial_token_reserve,
          lp.initial_sol_reserve,
          lp.is_active,
          lp.created_at as pool_created_at
        FROM takeovers t
        LEFT JOIN liquidity_pools lp ON t.id = lp.takeover_id
        WHERE t.is_finalized = true 
          AND t.is_successful = true 
          AND t.v2_token_mint IS NOT NULL
          AND COALESCE(t.has_v2_mint, false) = true
        ORDER BY t.created_at DESC
      `;

      const result = await client.query(query);
      
      console.log(`📊 Found ${result.rows.length} finalized successful takeovers`);

      for (const row of result.rows) {
        if (this.isDestroyed) break;
        await this.createOrUpdatePoolFromDatabase(row);
      }

    } catch (error) {
      console.error('💥 Database sync error:', error);
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Create or update a pool from database data
   */
  private async createOrUpdatePoolFromDatabase(dbData: any): Promise<void> {
    if (this.isDestroyed) return;
    
    const poolId = `takeover_${dbData.takeover_address}`;
    
    // Calculate initial reserves
    let liquidityTokens: bigint;
    try {
      liquidityTokens = dbData.liquidity_pool_tokens 
        ? BigInt(dbData.liquidity_pool_tokens)
        : dbData.v2_total_supply 
          ? BigInt(dbData.v2_total_supply) / 10n // 10% default
          : 1000000n * 1000000n; // 1M tokens default with 6 decimals
    } catch (error) {
      console.error('⚠️ Error calculating liquidity tokens:', error);
      liquidityTokens = 1000000n * 1000000n; // Default fallback
    }
    
    const solReserve = parseInt(dbData.sol_for_liquidity || '1000000000'); // 1 SOL default
    const tokenReserve = parseInt(liquidityTokens.toString());

    // Check if pool already exists
    const existingPool = this.pools.get(poolId);
    
    if (existingPool && 
        existingPool.lastDatabaseSync > Date.now() - 60000) { // Don't sync if updated in last minute
      return;
    }

    const poolData: EnhancedSimulatedPool = {
      id: poolId,
      takeoverAddress: dbData.takeover_address,
      tokenMint: dbData.v2_token_mint,
      tokenSymbol: dbData.token_name || 'V2',
      solReserve: Math.max(solReserve, 1000000), // Minimum 0.001 SOL
      tokenReserve: Math.max(tokenReserve, 1000000), // Minimum 1 token with 6 decimals
      lpTokenSupply: Math.sqrt(Math.max(solReserve, 1000000) * Math.max(tokenReserve, 1000000)), // Simplified LP calculation
      fee: 0.003, // 0.3% fee
      volume24h: 0,
      totalValueLocked: Math.max(solReserve, 1000000) * 2, // Simplified TVL calculation
      createdAt: new Date(dbData.created_at).getTime(),
      isFromDatabase: true,
      transactions: existingPool?.transactions || [],
      priceHistory: existingPool?.priceHistory || [],
      lastDatabaseSync: Date.now()
    };

    // Add initial price point if this is a new pool
    if (!existingPool || existingPool.priceHistory.length === 0) {
      poolData.priceHistory.push({
        timestamp: poolData.createdAt,
        price: poolData.solReserve / poolData.tokenReserve,
        solReserve: poolData.solReserve,
        tokenReserve: poolData.tokenReserve
      });
    }

    this.pools.set(poolId, poolData);
    
    console.log(`💎 ${existingPool ? 'Updated' : 'Created'} pool for ${dbData.token_name}:`, {
      poolId,
      tokenMint: dbData.v2_token_mint,
      solReserve: poolData.solReserve / 1e9, // Convert to SOL
      tokenReserve: poolData.tokenReserve / 1e6 // Convert to tokens
    });
  }

  /**
   * Get all pools including database-synced ones
   */
  getAllPools(): EnhancedSimulatedPool[] {
    return Array.from(this.pools.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get pools filtered by takeover address
   */
  getPoolsByTakeover(takeoverAddress: string): EnhancedSimulatedPool[] {
    return this.getAllPools().filter(pool => 
      pool.takeoverAddress.toLowerCase() === takeoverAddress.toLowerCase()
    );
  }

  /**
   * Get pool by ID with automatic database fallback
   */
  async getPool(poolId: string): Promise<EnhancedSimulatedPool | null> {
    let pool = this.pools.get(poolId);
    
    if (!pool && poolId.startsWith('takeover_')) {
      // Try to load from database
      const takeoverAddress = poolId.replace('takeover_', '');
      await this.loadPoolFromDatabase(takeoverAddress);
      pool = this.pools.get(poolId);
    }
    
    return pool || null;
  }

  /**
   * Load a specific pool from database
   */
  private async loadPoolFromDatabase(takeoverAddress: string): Promise<void> {
    if (this.isDestroyed) return;
    
    let client: PoolClient | null = null;
    
    try {
      client = await pool.connect();
      
      const query = `
        SELECT 
          t.id as takeover_id,
          t.address as takeover_address,
          t.token_name,
          t.v2_token_mint,
          t.v2_total_supply,
          t.liquidity_pool_tokens,
          t.sol_for_liquidity,
          t.is_finalized,
          t.is_successful,
          t.has_v2_mint,
          t.created_at
        FROM takeovers t
        WHERE t.address = $1
          AND t.is_finalized = true 
          AND t.is_successful = true 
          AND t.v2_token_mint IS NOT NULL
      `;

      const result = await client.query(query, [takeoverAddress]);
      
      if (result.rows.length > 0) {
        await this.createOrUpdatePoolFromDatabase(result.rows[0]);
      }

    } catch (error) {
      console.error('💥 Error loading pool from database:', error);
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Enhanced swap simulation with price impact calculation
   */
  simulateSwap(
    poolId: string,
    inputToken: 'SOL' | 'TOKEN',
    inputAmount: number,
    slippageTolerance: number = 0.01
  ): SwapResult | null {
    const pool = this.pools.get(poolId);
    if (!pool) return null;

    const fee = inputAmount * pool.fee;
    const amountAfterFee = inputAmount - fee;

    let outputAmount: number;
    let newSolReserve: number;
    let newTokenReserve: number;

    // Constant product formula: x * y = k
    const k = pool.solReserve * pool.tokenReserve;

    if (inputToken === 'SOL') {
      newSolReserve = pool.solReserve + amountAfterFee;
      newTokenReserve = k / newSolReserve;
      outputAmount = pool.tokenReserve - newTokenReserve;
    } else {
      newTokenReserve = pool.tokenReserve + amountAfterFee;
      newSolReserve = k / newTokenReserve;
      outputAmount = pool.solReserve - newSolReserve;
    }

    // Calculate price impact
    const oldPrice = pool.solReserve / pool.tokenReserve;
    const newPrice = newSolReserve / newTokenReserve;
    const priceImpact = Math.abs(newPrice - oldPrice) / oldPrice;

    // Check slippage tolerance
    if (priceImpact > slippageTolerance) {
      throw new Error(`Slippage too high: ${(priceImpact * 100).toFixed(2)}% > ${(slippageTolerance * 100).toFixed(2)}%`);
    }

    return {
      outputAmount,
      priceImpact,
      fee,
      newSolReserve,
      newTokenReserve,
      slippage: priceImpact
    };
  }

  /**
   * Execute swap and update pool state
   */
  executeSwap(
    poolId: string,
    inputToken: 'SOL' | 'TOKEN',
    inputAmount: number,
    user: string = 'simulator',
    slippageTolerance: number = 0.01
  ): SwapResult | null {
    const result = this.simulateSwap(poolId, inputToken, inputAmount, slippageTolerance);
    if (!result) return null;

    const pool = this.pools.get(poolId)!;

    // Update pool reserves
    pool.solReserve = result.newSolReserve;
    pool.tokenReserve = result.newTokenReserve;
    pool.volume24h += inputAmount;
    pool.totalValueLocked = pool.solReserve * 2; // Update TVL

    // Add transaction record
    const transaction: PoolTransaction = {
      id: `swap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'swap',
      timestamp: Date.now(),
      user,
      solAmount: inputToken === 'SOL' ? inputAmount : result.outputAmount,
      tokenAmount: inputToken === 'TOKEN' ? inputAmount : result.outputAmount,
      priceImpact: result.priceImpact,
      fee: result.fee
    };
    pool.transactions.push(transaction);

    // Update price history
    const newPrice = pool.solReserve / pool.tokenReserve;
    pool.priceHistory.push({
      timestamp: Date.now(),
      price: newPrice,
      solReserve: pool.solReserve,
      tokenReserve: pool.tokenReserve
    });

    console.log(`💱 Swap executed on ${pool.tokenSymbol}: ${inputAmount / (inputToken === 'SOL' ? 1e9 : 1e6)} ${inputToken} → ${result.outputAmount / (inputToken === 'SOL' ? 1e6 : 1e9)} ${inputToken === 'SOL' ? pool.tokenSymbol : 'SOL'}`);
    console.log(`Price impact: ${(result.priceImpact * 100).toFixed(2)}%`);

    return result;
  }

  /**
   * Get pool analytics
   */
  getPoolAnalytics(poolId: string): PoolAnalytics | null {
    const pool = this.pools.get(poolId);
    if (!pool) return null;

    const currentPrice = pool.solReserve / pool.tokenReserve;
    const history24h = pool.priceHistory.filter(p => p.timestamp > Date.now() - 86400000);
    
    let priceChange24h = 0;
    let maxPrice24h = currentPrice;
    let minPrice24h = currentPrice;

    if (history24h.length > 1) {
      const oldestPrice = history24h[0].price;
      priceChange24h = ((currentPrice - oldestPrice) / oldestPrice) * 100;
      
      maxPrice24h = Math.max(...history24h.map(p => p.price));
      minPrice24h = Math.min(...history24h.map(p => p.price));
    }

    return {
      poolId,
      currentPrice,
      priceChange24h,
      maxPrice24h,
      minPrice24h,
      volume24h: pool.volume24h,
      totalValueLocked: pool.totalValueLocked,
      solReserve: pool.solReserve,
      tokenReserve: pool.tokenReserve,
      lpTokenSupply: pool.lpTokenSupply,
      transactionCount: pool.transactions.length,
      averageTradeSize: pool.transactions.length > 0 
        ? pool.volume24h / pool.transactions.length 
        : 0
    };
  }

  /**
   * Create a new simulated pool (for testing purposes)
   */
  createTestPool(params: {
    tokenMint: string;
    tokenSymbol: string;
    initialSolAmount: number;
    initialTokenAmount: number;
    fee?: number;
  }): string {
    const poolId = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const pool: EnhancedSimulatedPool = {
      id: poolId,
      takeoverAddress: '',
      tokenMint: params.tokenMint,
      tokenSymbol: params.tokenSymbol,
      solReserve: params.initialSolAmount,
      tokenReserve: params.initialTokenAmount,
      lpTokenSupply: Math.sqrt(params.initialSolAmount * params.initialTokenAmount),
      fee: params.fee || 0.003,
      volume24h: 0,
      totalValueLocked: params.initialSolAmount * 2,
      createdAt: Date.now(),
      isFromDatabase: false,
      transactions: [],
      priceHistory: [{
        timestamp: Date.now(),
        price: params.initialSolAmount / params.initialTokenAmount,
        solReserve: params.initialSolAmount,
        tokenReserve: params.initialTokenAmount
      }],
      lastDatabaseSync: 0
    };

    this.pools.set(poolId, pool);
    
    console.log(`🧪 Created test pool: ${params.tokenSymbol}/SOL`);
    
    return poolId;
  }

  /**
   * Cleanup and stop database sync
   */
  cleanup(): void {
    this.isDestroyed = true;
    
    if (this.databaseSyncInterval) {
      clearInterval(this.databaseSyncInterval);
      this.databaseSyncInterval = null;
    }
    
    this.pools.clear();
  }
}

// Global simulator instance
export const globalLPSimulator = new EnhancedLiquiditySimulator();