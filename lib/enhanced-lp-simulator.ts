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
    // Only start sync on client side, not during build
    if (typeof window !== 'undefined') {
      this.startApiSync();
    }
  }

  /**
   * Start periodic sync with database through API calls
   */
  private startApiSync() {
    if (this.isDestroyed || typeof window === 'undefined') return;
    
    // Sync every 30 seconds via API
    this.databaseSyncInterval = setInterval(async () => {
      if (this.isDestroyed) return;
      
      try {
        await this.syncWithDatabaseViaAPI();
      } catch (error) {
        console.error('🔄 Database sync failed:', error);
      }
    }, 30000);

    // Initial sync
    this.syncWithDatabaseViaAPI().catch(error => {
      console.error('🔄 Initial database sync failed:', error);
    });
  }

  /**
   * Sync pools with database via API call
   */
  async syncWithDatabaseViaAPI(): Promise<void> {
    if (this.isDestroyed || typeof window === 'undefined') return;
    
    console.log('🔄 Syncing LP simulator with database via API...');

    try {
      const response = await fetch('/api/pools/sync', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API sync failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.success && data.pools) {
        // Update pools with data from API
        for (const poolData of data.pools) {
          await this.createOrUpdatePoolFromData(poolData);
        }
        
        console.log(`📊 Synced ${data.pools.length} pools from database`);
      }

    } catch (error) {
      console.error('💥 API sync error:', error);
    }
  }

  /**
   * Create or update a pool from API data
   */
  private async createOrUpdatePoolFromData(dbData: any): Promise<void> {
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
   * Get pool by ID with automatic API fallback
   */
  async getPool(poolId: string): Promise<EnhancedSimulatedPool | null> {
    let pool = this.pools.get(poolId);
    
    if (!pool && poolId.startsWith('takeover_')) {
      // Try to load from API
      const takeoverAddress = poolId.replace('takeover_', '');
      await this.loadPoolFromAPI(takeoverAddress);
      pool = this.pools.get(poolId);
    }
    
    return pool || null;
  }

  /**
   * Load a specific pool from API
   */
  private async loadPoolFromAPI(takeoverAddress: string): Promise<void> {
    if (this.isDestroyed || typeof window === 'undefined') return;
    
    try {
      const response = await fetch(`/api/pools/takeover/${takeoverAddress}`);
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.pool) {
          await this.createOrUpdatePoolFromData(data.pool);
        }
      }

    } catch (error) {
      console.error('💥 Error loading pool from API:', error);
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

    // Calculate output using constant product formula (x * y = k)
    if (inputToken === 'SOL') {
      // SOL -> TOKEN
      newSolReserve = pool.solReserve + amountAfterFee;
      newTokenReserve = (pool.solReserve * pool.tokenReserve) / newSolReserve;
      outputAmount = pool.tokenReserve - newTokenReserve;
    } else {
      // TOKEN -> SOL
      newTokenReserve = pool.tokenReserve + amountAfterFee;
      newSolReserve = (pool.solReserve * pool.tokenReserve) / newTokenReserve;
      outputAmount = pool.solReserve - newSolReserve;
    }

    // Calculate price impact
    const oldPrice = pool.solReserve / pool.tokenReserve;
    const newPrice = newSolReserve / newTokenReserve;
    const priceImpact = Math.abs((newPrice - oldPrice) / oldPrice);

    // Calculate slippage
    const expectedOutput = inputToken === 'SOL' 
      ? (amountAfterFee / oldPrice)
      : (amountAfterFee * oldPrice);
    const slippage = Math.abs((expectedOutput - outputAmount) / expectedOutput);

    const result: SwapResult = {
      outputAmount,
      priceImpact,
      fee,
      newSolReserve,
      newTokenReserve,
      slippage
    };

    // Log the swap for debugging
    console.log(`🔄 Simulated swap: ${inputAmount / (inputToken === 'SOL' ? 1e9 : 1e6)} ${inputToken} → ${result.outputAmount / (inputToken === 'SOL' ? 1e6 : 1e9)} ${inputToken === 'SOL' ? pool.tokenSymbol : 'SOL'}`);
    console.log(`Price impact: ${(result.priceImpact * 100).toFixed(2)}%`);

    return result;
  }

  /**
   * Execute swap and update pool state
   */
  executeSwap(
    poolId: string,
    inputToken: 'SOL' | 'TOKEN',
    inputAmount: number,
    userAddress: string = 'simulator',
    slippageTolerance: number = 0.01
  ): SwapResult | null {
    const result = this.simulateSwap(poolId, inputToken, inputAmount, slippageTolerance);
    if (!result) return null;

    const pool = this.pools.get(poolId);
    if (!pool) return null;

    // Check slippage tolerance
    if (result.slippage > slippageTolerance) {
      throw new Error(`Slippage ${(result.slippage * 100).toFixed(2)}% exceeds tolerance ${(slippageTolerance * 100).toFixed(2)}%`);
    }

    // Update pool reserves
    pool.solReserve = result.newSolReserve;
    pool.tokenReserve = result.newTokenReserve;
    pool.volume24h += inputAmount;
    pool.totalValueLocked = pool.solReserve * 2; // Simplified TVL

    // Add transaction
    const transaction: PoolTransaction = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'swap',
      timestamp: Date.now(),
      user: userAddress,
      solAmount: inputToken === 'SOL' ? inputAmount : result.outputAmount,
      tokenAmount: inputToken === 'TOKEN' ? inputAmount : result.outputAmount,
      priceImpact: result.priceImpact,
      fee: result.fee
    };

    pool.transactions.push(transaction);

    // Add price point
    pool.priceHistory.push({
      timestamp: Date.now(),
      price: pool.solReserve / pool.tokenReserve,
      solReserve: pool.solReserve,
      tokenReserve: pool.tokenReserve
    });

    // Keep only last 1000 transactions and 1000 price points
    if (pool.transactions.length > 1000) {
      pool.transactions = pool.transactions.slice(-1000);
    }
    if (pool.priceHistory.length > 1000) {
      pool.priceHistory = pool.priceHistory.slice(-1000);
    }

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
   * Cleanup and stop sync
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