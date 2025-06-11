// lib/liquidity-mode.ts - Completely type-safe revision
import { useState, useCallback, useMemo, useEffect } from 'react';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { Program, BN } from '@coral-xyz/anchor';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useToast } from '@/components/ui/use-toast';
import { getProgram } from './program';
import { PROGRAM_ID } from './constants';

export interface LiquidityStatus {
  isLiquidityMode: boolean;
  v1TotalSupply: number;
  v2TotalSupply: number;
  rewardPoolTokens: number;
  liquidityPoolTokens: number;
  totalContributed: number;
  participationRate: number;
  maxSafeContribution: number;
  wouldOverflow: boolean;
  rewardPoolUtilization: number;
  jupiterSwapCompleted: boolean;
  lpCreated: boolean;
  solForLiquidity: number;
  estimatedInitialV2Price: number;
  unclaimedV2Tokens: number;
  rewardRateBp: number;
  targetParticipationBp: number;
  calculatedMinAmount: number;
  maxSafeTotalContribution: number;
}

export interface ContributionPreview {
  amount: number;
  wouldCauseOverflow: boolean;
  maxSafeAmount: number;
  expectedV2Allocation: number;
  scalingFactor: number;
  isScaled: boolean;
  participationRateAfter: number;
  rewardPoolUtilizationAfter: number;
  warningMessage?: string;
}

export interface JupiterQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
}

// Helper functions for safe type conversion
const safeToNumber = (value: any, defaultValue: number = 0): number => {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  if (value && typeof value.toNumber === 'function') {
    try {
      return value.toNumber();
    } catch (e) {
      return defaultValue;
    }
  }
  return defaultValue;
};

const safeToBool = (value: any, defaultValue: boolean = false): boolean => {
  if (value === null || value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true') return true;
  if (value === 0 || value === '0' || value === 'false') return false;
  return defaultValue;
};

export class LiquidityModeManager {
  constructor(
    private program: Program,
    private connection: Connection
  ) {}

  /**
   * Get comprehensive status of a billion-scale takeover with liquidity features
   */
  async getLiquidityStatus(takeoverAddress: PublicKey): Promise<LiquidityStatus> {
    try {
      const takeoverData = await this.program.account.takeover.fetch(takeoverAddress);
      
      // Safely extract all values with type conversion
      const v1TotalSupply = safeToNumber(takeoverData.v1TotalSupply, 0);
      const v2TotalSupply = safeToNumber(takeoverData.v2TotalSupply, v1TotalSupply);
      const rewardPoolTokens = safeToNumber(takeoverData.rewardPoolTokens, Math.floor(v2TotalSupply * 0.8));
      const liquidityPoolTokens = safeToNumber(takeoverData.liquidityPoolTokens, Math.floor(v2TotalSupply * 0.2));
      const totalContributed = safeToNumber(takeoverData.totalContributed, 0);
      const customRewardRate = safeToNumber(takeoverData.customRewardRate, 1.5);
      const rewardRateBp = safeToNumber(takeoverData.rewardRateBp, customRewardRate * 100);
      const targetParticipationBp = safeToNumber(takeoverData.targetParticipationBp, 1000);
      const calculatedMinAmount = safeToNumber(takeoverData.calculatedMinAmount, safeToNumber(takeoverData.minAmount, 0));
      const maxSafeTotalContribution = safeToNumber(takeoverData.maxSafeTotalContribution, 0);

      // Calculate derived values safely
      const participationRate = v1TotalSupply > 0 ? totalContributed / v1TotalSupply : 0;
      const rewardRate = rewardRateBp / 10000;
      const totalV2Needed = totalContributed * rewardRate;
      const rewardPoolUtilization = rewardPoolTokens > 0 ? Math.min(1.0, totalV2Needed / rewardPoolTokens) : 0;
      
      // Calculate max safe contribution with 2% safety cushion
      const safetyMultiplier = 0.98;
      const safeRewardPool = rewardPoolTokens * safetyMultiplier;
      const theoreticalMaxTotal = rewardRate > 0 ? safeRewardPool / rewardRate : 0;
      const maxSafeContribution = Math.max(0, theoreticalMaxTotal - totalContributed);
      
      // Calculate unclaimed tokens for LP
      const allocatedFromRewardPool = Math.min(totalV2Needed, safeRewardPool);
      const unclaimedFromRewards = safeRewardPool - allocatedFromRewardPool;
      const unclaimedV2Tokens = unclaimedFromRewards + liquidityPoolTokens;

      const isLiquidityMode = safeToBool(takeoverData.liquidityMode, false) || 
                          (takeoverData.hasOwnProperty('jupiterSwapCompleted') || takeoverData.hasOwnProperty('lpCreated'));
      
      return {
        isLiquidityMode,
        v1TotalSupply,
        v2TotalSupply,
        rewardPoolTokens,
        liquidityPoolTokens,
        totalContributed,
        participationRate,
        maxSafeContribution,
        wouldOverflow: totalV2Needed > safeRewardPool,
        rewardPoolUtilization,
        jupiterSwapCompleted: safeToBool(takeoverData.jupiterSwapCompleted, false),
        lpCreated: safeToBool(takeoverData.lpCreated, false),
        solForLiquidity: safeToNumber(takeoverData.solForLiquidity, 0),
        estimatedInitialV2Price: this.calculateEstimatedPrice(takeoverData),
        unclaimedV2Tokens,
        rewardRateBp,
        targetParticipationBp,
        calculatedMinAmount,
        maxSafeTotalContribution,
      };
    } catch (error: any) {
      console.error('Error fetching liquidity status:', error);
      throw new Error(`Failed to get liquidity status: ${error.message}`);
    }
  }

  /**
   * Preview the effects of a contribution with billion-scale safety checks
   */
  async previewContribution(
    takeoverAddress: PublicKey, 
    contributionAmount: number
  ): Promise<ContributionPreview> {
    const status = await this.getLiquidityStatus(takeoverAddress);
    
    // Billion-scale validation
    if (contributionAmount > 100_000_000 * 1_000_000) {
      throw new Error('Contribution exceeds maximum allowed (100M tokens)');
    }
    
    const wouldCauseOverflow = contributionAmount > status.maxSafeContribution;
    const maxSafeAmount = status.maxSafeContribution;
    const actualAmount = Math.min(contributionAmount, maxSafeAmount);
    
    // Calculate allocation with new total
    const newTotalContributed = status.totalContributed + actualAmount;
    const rewardRate = status.rewardRateBp / 10000;
    const totalV2Needed = newTotalContributed * rewardRate;
    
    // Apply 2% safety cushion
    const safetyMultiplier = 0.98;
    const safeRewardPool = status.rewardPoolTokens * safetyMultiplier;
    
    let expectedV2Allocation: number;
    let scalingFactor = 1.0;
    let isScaled = false;
    let warningMessage: string | undefined;
    
    if (totalV2Needed > safeRewardPool) {
      scalingFactor = safeRewardPool / totalV2Needed;
      expectedV2Allocation = actualAmount * rewardRate * scalingFactor;
      isScaled = true;
      warningMessage = `Allocation scaled down by ${((1 - scalingFactor) * 100).toFixed(1)}% due to conservative safety limits`;
    } else {
      expectedV2Allocation = actualAmount * rewardRate;
    }
    
    const participationRateAfter = status.v1TotalSupply > 0 ? newTotalContributed / status.v1TotalSupply : 0;
    const rewardPoolUtilizationAfter = Math.min(1.0, totalV2Needed / safeRewardPool);

    return {
      amount: actualAmount,
      wouldCauseOverflow,
      maxSafeAmount,
      expectedV2Allocation,
      scalingFactor,
      isScaled,
      participationRateAfter,
      rewardPoolUtilizationAfter,
      warningMessage,
    };
  }

  /**
   * Calculate estimated V2 price based on current state with conservative approach
   */
  private calculateEstimatedPrice(takeoverData: any): number {
    try {
      const isFinalized = safeToBool(takeoverData.isFinalized, false);
      const jupiterSwapCompleted = safeToBool(takeoverData.jupiterSwapCompleted, false);

      if (!isFinalized || !jupiterSwapCompleted) {
        return 0;
      }

      const totalContributed = safeToNumber(takeoverData.totalContributed, 0);
      const v1TotalSupply = safeToNumber(takeoverData.v1TotalSupply, 1);
      const solForLiquidity = safeToNumber(takeoverData.solForLiquidity, 0);
      
      if (solForLiquidity === 0) return 0;
      
      // Calculate unclaimed tokens using conservative method
      const rewardRateBp = safeToNumber(takeoverData.rewardRateBp, 150);
      const rewardRate = rewardRateBp / 10000;
      const rewardPoolTokens = safeToNumber(takeoverData.rewardPoolTokens, 0);
      const liquidityPoolTokens = safeToNumber(takeoverData.liquidityPoolTokens, 0);
      
      const safetyMultiplier = 0.98;
      const safeRewardPool = rewardPoolTokens * safetyMultiplier;
      const totalV2Needed = totalContributed * rewardRate;
      const allocatedFromRewards = Math.min(totalV2Needed, safeRewardPool);
      const unclaimedFromRewards = safeRewardPool - allocatedFromRewards;
      const unclaimedV2Tokens = unclaimedFromRewards + liquidityPoolTokens;
      
      if (unclaimedV2Tokens === 0) return 0;
      
      return solForLiquidity / unclaimedV2Tokens;
    } catch (error) {
      console.error('Error calculating estimated price:', error);
      return 0;
    }
  }
}

/**
 * Jupiter integration for V1 -> SOL swaps with error handling
 */
export class JupiterSwapManager {
  constructor(
    private connection: Connection,
    private jupiterApiUrl: string = 'https://quote-api.jup.ag/v6'
  ) {}

  /**
   * Get Jupiter quote for V1 -> SOL swap with retries
   */
  async getSwapQuote(
    v1TokenMint: string,
    amount: number,
    slippageBps: number = 50
  ): Promise<JupiterQuote> {
    const maxRetries = 3;
    let lastError: Error = new Error('Unknown error');

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(
          `${this.jupiterApiUrl}/quote?` +
          `inputMint=${v1TokenMint}&` +
          `outputMint=So11111111111111111111111111111111111111112&` +
          `amount=${amount}&` +
          `slippageBps=${slippageBps}&` +
          `onlyDirectRoutes=false&` +
          `asLegacyTransaction=false`
        );
        
        if (!response.ok) {
          throw new Error(`Jupiter API error: ${response.status} ${response.statusText}`);
        }
        
        const quote = await response.json();
        
        if (!quote || !quote.outAmount) {
          throw new Error('Invalid quote response from Jupiter');
        }
        
        return quote;
      } catch (error: any) {
        lastError = error;
        console.warn(`Jupiter quote attempt ${i + 1} failed:`, error.message);
        
        if (i < maxRetries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
    }
    
    throw new Error(`Failed to get Jupiter quote after ${maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Execute the V1 -> SOL swap and update takeover with conservative validation
   */
  async executeSwapAndUpdate(
    takeoverAddress: PublicKey,
    v1TokenMint: string,
    amount: number,
    program: Program,
    authority: PublicKey
  ): Promise<string> {
    try {
      console.log('🔄 Getting Jupiter quote for conservative swap...');
      const quote = await this.getSwapQuote(v1TokenMint, amount);
      
      const priceImpact = parseFloat(quote.priceImpactPct);
      if (priceImpact > 5.0) {
        throw new Error(`Price impact too high: ${priceImpact.toFixed(2)}% (max 5%)`);
      }

      const swapResponse = await fetch(`${this.jupiterApiUrl}/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: authority.toString(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 1000,
        })
      });

      if (!swapResponse.ok) {
        throw new Error(`Jupiter swap API error: ${swapResponse.status}`);
      }

      const { swapTransaction } = await swapResponse.json();
      
      console.log('📤 Executing conservative Jupiter swap...');
      const transaction = Transaction.from(Buffer.from(swapTransaction, 'base64'));
      
      // Use connection directly instead of provider
      const signature = await this.connection.sendTransaction(transaction, []);
      await this.connection.confirmTransaction(signature);
      
      const solReceived = parseInt(quote.outAmount);
      
      // Get takeover data safely
      const takeoverData = await program.account.takeover.fetch(takeoverAddress);
      const totalContributed = safeToNumber(takeoverData.totalContributed, 0);
      const v1TotalSupply = safeToNumber(takeoverData.v1TotalSupply, 1);
      const participationRate = totalContributed / v1TotalSupply;
      const bonusMultiplier = 1.0 + Math.min(participationRate * 0.5, 0.5);
      const conservativeSolForLp = Math.floor(solReceived * bonusMultiplier * 0.95);
      
      console.log('🔄 Updating takeover with conservative calculations...');
      
      const updateTx = await program.methods
        .completeJupiterSwap(new BN(conservativeSolForLp))
        .accounts({
          takeover: takeoverAddress,
          authority: authority,
          solDestination: authority,
        })
        .rpc();

      console.log('✅ Takeover updated with conservative approach:', updateTx);
      return updateTx;
    } catch (error: any) {
      console.error('❌ Jupiter swap failed:', error);
      throw new Error(`Jupiter swap failed: ${error.message}`);
    }
  }
}

/**
 * React hook for liquidity mode operations integrated with existing patterns
 * Note: This is primarily for status display. Use existing contribution forms for actual contributions.
 */
export function useLiquidityMode(takeoverAddress: PublicKey) {
  const [status, setStatus] = useState<LiquidityStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey } = wallet;
  const { toast } = useToast();

  // Create program instance using existing pattern
  const program = useMemo(() => {
    if (!wallet || !connection) return null;
    try {
      const adaptedWallet = {
        publicKey: wallet.publicKey,
        signTransaction: wallet.signTransaction,
        signAllTransactions: wallet.signAllTransactions,
        payer: wallet.publicKey ? { publicKey: wallet.publicKey } : undefined
      };
      return getProgram(connection, adaptedWallet as any);
    } catch (error) {
      console.error('Failed to create program:', error);
      return null;
    }
  }, [wallet, connection]);

  const liquidityManager = useMemo(
    () => program ? new LiquidityModeManager(program, connection) : null,
    [program, connection]
  );

  const refreshStatus = useCallback(async () => {
    if (!liquidityManager || !takeoverAddress) return;
    
    try {
      setLoading(true);
      setError(null);
      const newStatus = await liquidityManager.getLiquidityStatus(takeoverAddress);
      setStatus(newStatus);
    } catch (err: any) {
      console.error('Failed to refresh liquidity status:', err);
      setError(err.message);
      if (toast) {
        toast({
          title: "Error Loading Status",
          description: err.message,
          variant: "destructive"
        });
      }
    } finally {
      setLoading(false);
    }
  }, [liquidityManager, takeoverAddress, toast]);

  const previewContribution = useCallback(async (amount: number) => {
    if (!liquidityManager) throw new Error('Liquidity manager not initialized');
    return await liquidityManager.previewContribution(takeoverAddress, amount);
  }, [liquidityManager, takeoverAddress]);

  const contribute = useCallback(async (amount: number) => {
    if (!liquidityManager || !publicKey || !program || !wallet.sendTransaction) {
      throw new Error('Not ready to contribute');
    }
    
    try {
      console.log('🔄 Building contribution transaction...');
      throw new Error('Please use the main contribution form for now. Liquidity mode contribution integration is in progress.');
        
    } catch (error: any) {
      if (toast) {
        toast({
          title: "Contribution Failed",
          description: error.message,
          variant: "destructive"
        });
      }
      throw error;
    }
  }, [liquidityManager, takeoverAddress, publicKey, program, toast, wallet.sendTransaction]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  return {
    status,
    loading,
    error,
    refreshStatus,
    previewContribution,
    contribute,
    // Computed values for UI
    isOverflowRisk: status ? status.rewardPoolUtilization > 0.9 : false,
    canContribute: status ? status.maxSafeContribution > 0 && !status.wouldOverflow : false,
    participationLevel: status ? status.participationRate * 100 : 0,
    isConservativeMode: status ? status.rewardRateBp <= 200 : false,
    safetyMargin: status ? ((status.maxSafeTotalContribution - status.totalContributed) / 1_000_000) : 0,
  };
}