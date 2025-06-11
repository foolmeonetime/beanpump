// lib/lp-simulator.ts - Complete LP simulation engine for SOL/SPL pairs
import { PublicKey } from '@solana/web3.js';

// Simulated pool state for SOL/SPL token pairs
export interface SimulatedPool {
  id: string;
  tokenMint: string;
  tokenSymbol: string;
  solReserve: number;        // SOL reserves in lamports
  tokenReserve: number;      // Token reserves (with decimals)
  lpTokenSupply: number;     // Total LP tokens in circulation
  fee: number;               // Pool fee (e.g., 0.003 for 0.3%)
  volume24h: number;         // 24h trading volume
  createdAt: number;         // Timestamp
  transactions: PoolTransaction[];
  priceHistory: PricePoint[];
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
  price: number;           // SOL per token
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

interface MarketConditions {
  volatility: number;        // 0-1 scale
  trending: number;          // -1 to +1 (bearish to bullish)
  liquidity: number;         // Multiplier for available liquidity
  slippageMultiplier: number; // Multiplier for slippage
}

export class LiquidityPoolSimulator {
  private pools: Map<string, SimulatedPool> = new Map();
  private marketConditions: MarketConditions = {
    volatility: 0.1,          // 10% volatility
    trending: 0,              // 0 = sideways, +1 = bullish, -1 = bearish
    liquidity: 1.0,           // 1.0 = normal liquidity
    slippageMultiplier: 1.0   // 1.0 = normal slippage
  };

  constructor() {
    // Initialize with some default market conditions
    this.simulateMarketActivity();
  }

  /**
   * Create a new simulated pool with SOL/SPL token pair
   */
  createPool(params: {
    tokenMint: string;
    tokenSymbol: string;
    initialSolAmount: number;    // SOL in lamports
    initialTokenAmount: number;  // Tokens with decimals
    fee?: number;
  }): SimulatedPool {
    const poolId = `${params.tokenMint}_SOL_${Date.now()}`;
    
    const initialPrice = params.initialSolAmount / params.initialTokenAmount;
    const initialLpSupply = Math.sqrt(params.initialSolAmount * params.initialTokenAmount);
    
    const pool: SimulatedPool = {
      id: poolId,
      tokenMint: params.tokenMint,
      tokenSymbol: params.tokenSymbol,
      solReserve: params.initialSolAmount,
      tokenReserve: params.initialTokenAmount,
      lpTokenSupply: initialLpSupply,
      fee: params.fee || 0.003, // 0.3% default
      volume24h: 0,
      createdAt: Date.now(),
      transactions: [],
      priceHistory: [{
        timestamp: Date.now(),
        price: initialPrice,
        solReserve: params.initialSolAmount,
        tokenReserve: params.initialTokenAmount
      }]
    };

    this.pools.set(poolId, pool);
    
    console.log(`🏊 Created simulated pool: ${params.tokenSymbol}/SOL`);
    console.log(`Initial reserves: ${params.initialSolAmount / 1e9} SOL, ${params.initialTokenAmount / 1e6} ${params.tokenSymbol}`);
    console.log(`Initial price: ${(initialPrice * 1e9 / 1e6).toFixed(6)} SOL per ${params.tokenSymbol}`);
    
    return pool;
  }

  /**
   * Simulate a swap in the pool using constant product formula
   */
  simulateSwap(
    poolId: string,
    inputToken: 'SOL' | 'TOKEN',
    inputAmount: number,
    slippageTolerance: number = 0.01 // 1%
  ): SwapResult {
    const pool = this.pools.get(poolId);
    if (!pool) throw new Error('Pool not found');

    const fee = inputAmount * pool.fee;
    const inputAmountAfterFee = inputAmount - fee;
    
    let outputAmount: number;
    let newSolReserve: number;
    let newTokenReserve: number;

    if (inputToken === 'SOL') {
      // Swapping SOL for tokens
      // Using constant product: x * y = k
      const k = pool.solReserve * pool.tokenReserve;
      newSolReserve = pool.solReserve + inputAmountAfterFee;
      newTokenReserve = k / newSolReserve;
      outputAmount = pool.tokenReserve - newTokenReserve;
    } else {
      // Swapping tokens for SOL
      const k = pool.solReserve * pool.tokenReserve;
      newTokenReserve = pool.tokenReserve + inputAmountAfterFee;
      newSolReserve = k / newTokenReserve;
      outputAmount = pool.solReserve - newSolReserve;
    }

    // Calculate price impact
    const oldPrice = pool.solReserve / pool.tokenReserve;
    const newPrice = newSolReserve / newTokenReserve;
    const priceImpact = Math.abs(newPrice - oldPrice) / oldPrice;

    // Apply market conditions
    const adjustedPriceImpact = priceImpact * this.marketConditions.slippageMultiplier;
    const slippage = adjustedPriceImpact;

    // Check slippage tolerance
    if (slippage > slippageTolerance) {
      throw new Error(`Slippage too high: ${(slippage * 100).toFixed(2)}% > ${(slippageTolerance * 100).toFixed(2)}%`);
    }

    return {
      outputAmount,
      priceImpact: adjustedPriceImpact,
      fee,
      newSolReserve,
      newTokenReserve,
      slippage
    };
  }

  /**
   * Execute a swap and update pool state
   */
  executeSwap(
    poolId: string,
    inputToken: 'SOL' | 'TOKEN',
    inputAmount: number,
    user: string = 'simulator',
    slippageTolerance: number = 0.01
  ): SwapResult {
    const result = this.simulateSwap(poolId, inputToken, inputAmount, slippageTolerance);
    const pool = this.pools.get(poolId)!;

    // Update pool reserves
    pool.solReserve = result.newSolReserve;
    pool.tokenReserve = result.newTokenReserve;
    pool.volume24h += inputAmount;

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

    console.log(`💱 Swap executed: ${inputAmount / (inputToken === 'SOL' ? 1e9 : 1e6)} ${inputToken} → ${result.outputAmount / (inputToken === 'SOL' ? 1e6 : 1e9)} ${inputToken === 'SOL' ? pool.tokenSymbol : 'SOL'}`);
    console.log(`Price impact: ${(result.priceImpact * 100).toFixed(2)}%`);

    return result;
  }

  /**
   * Add liquidity to the pool
   */
  addLiquidity(
    poolId: string,
    solAmount: number,
    maxTokenAmount: number,
    user: string = 'simulator'
  ): { lpTokens: number; tokenAmountUsed: number } {
    const pool = this.pools.get(poolId);
    if (!pool) throw new Error('Pool not found');

    // Calculate token amount needed to maintain ratio
    const ratio = pool.tokenReserve / pool.solReserve;
    const tokenAmountNeeded = solAmount * ratio;

    if (tokenAmountNeeded > maxTokenAmount) {
      throw new Error(`Insufficient token amount. Need ${tokenAmountNeeded}, provided ${maxTokenAmount}`);
    }

    // Calculate LP tokens to mint
    const lpTokensToMint = (solAmount / pool.solReserve) * pool.lpTokenSupply;

    // Update pool state
    pool.solReserve += solAmount;
    pool.tokenReserve += tokenAmountNeeded;
    pool.lpTokenSupply += lpTokensToMint;

    // Add transaction record
    const transaction: PoolTransaction = {
      id: `add_lp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: 'add_liquidity',
      timestamp: Date.now(),
      user,
      solAmount,
      tokenAmount: tokenAmountNeeded,
      lpTokens: lpTokensToMint,
      priceImpact: 0, // No price impact for balanced liquidity addition
      fee: 0
    };
    pool.transactions.push(transaction);

    console.log(`💧 Added liquidity: ${solAmount / 1e9} SOL + ${tokenAmountNeeded / 1e6} ${pool.tokenSymbol} → ${lpTokensToMint.toFixed(6)} LP tokens`);

    return {
      lpTokens: lpTokensToMint,
      tokenAmountUsed: tokenAmountNeeded
    };
  }

  /**
   * Get current pool information
   */
  getPool(poolId: string): SimulatedPool | undefined {
    return this.pools.get(poolId);
  }

  /**
   * Get all pools
   */
  getAllPools(): SimulatedPool[] {
    return Array.from(this.pools.values());
  }

  /**
   * Get current price of token in SOL
   */
  getCurrentPrice(poolId: string): number {
    const pool = this.pools.get(poolId);
    if (!pool) throw new Error('Pool not found');
    return pool.solReserve / pool.tokenReserve;
  }

  /**
   * Simulate market activity with random trades
   */
  simulateMarketActivity() {
    setInterval(() => {
      this.pools.forEach(pool => {
        // Random market activity
        if (Math.random() < 0.1) { // 10% chance per interval
          const isSOLInput = Math.random() < 0.5;
          const amount = isSOLInput 
            ? Math.random() * pool.solReserve * 0.01  // Max 1% of reserves
            : Math.random() * pool.tokenReserve * 0.01;
          
          try {
            this.executeSwap(
              pool.id,
              isSOLInput ? 'SOL' : 'TOKEN',
              amount,
              'market_bot',
              0.05 // 5% slippage tolerance for bots
            );
          } catch (error) {
            // Ignore failed swaps (too much slippage)
          }
        }
      });
    }, 5000); // Every 5 seconds
  }

  /**
   * Set market conditions to affect trading
   */
  setMarketConditions(conditions: Partial<MarketConditions>) {
    this.marketConditions = { ...this.marketConditions, ...conditions };
    console.log('📊 Market conditions updated:', this.marketConditions);
  }

  /**
   * Get pool analytics
   */
  getPoolAnalytics(poolId: string): PoolAnalytics {
    const pool = this.pools.get(poolId);
    if (!pool) throw new Error('Pool not found');

    const currentPrice = this.getCurrentPrice(poolId);
    const priceHistory24h = pool.priceHistory.filter(
      p => p.timestamp > Date.now() - 24 * 60 * 60 * 1000
    );
    
    const price24hAgo = priceHistory24h.length > 0 ? priceHistory24h[0].price : currentPrice;
    const priceChange24h = ((currentPrice - price24hAgo) / price24hAgo) * 100;

    const maxPrice24h = Math.max(...priceHistory24h.map(p => p.price));
    const minPrice24h = Math.min(...priceHistory24h.map(p => p.price));

    const totalValueLocked = (pool.solReserve + (pool.tokenReserve * currentPrice)) / 1e9;

    return {
      poolId,
      currentPrice,
      priceChange24h,
      maxPrice24h,
      minPrice24h,
      volume24h: pool.volume24h,
      totalValueLocked,
      solReserve: pool.solReserve,
      tokenReserve: pool.tokenReserve,
      lpTokenSupply: pool.lpTokenSupply,
      transactionCount: pool.transactions.length,
      averageTradeSize: pool.volume24h / Math.max(pool.transactions.length, 1)
    };
  }
}

// Export singleton instance
export const lpSimulator = new LiquidityPoolSimulator();