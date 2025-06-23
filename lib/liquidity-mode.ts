"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { useToast } from '@/components/ui/use-toast';
import { BN, Program } from '@coral-xyz/anchor';
import { getProgram, findContributorPDA } from '@/lib/program';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from '@/lib/token-utils';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID || "CJxUrvjAXL2PR2bK8vANxLJiWWRXbyaFvzzF9cMgYmfJ";

export interface LiquidityStatus {
  v1TotalSupply: number;
  v2TotalSupply: number;
  rewardPoolTokens: number;
  liquidityPoolTokens: number;
  totalContributed: number;
  rewardRateBp: number;
  targetParticipationBp: number;
  calculatedMinAmount: number;
  maxSafeTotalContribution: number;
  participationRate: number;
  rewardPoolUtilization: number;
  canCreateLp: boolean;
  isJupiterSwapCompleted: boolean;
  jupiterSwapCompleted: boolean; // Alias for isJupiterSwapCompleted
  lpCreated: boolean;
  maxSafeContribution: number;
  wouldOverflow: boolean;
  conservativeAllocation: number;
  bonusMultiplier: number;
  estimatedV2Tokens: number;
  liquiditySharePct: number;
  projectedLpValue: string;
  isLiquidityMode: boolean;
  v1TokenMint?: PublicKey;
  authority?: PublicKey;
  vault?: PublicKey;
}

export interface ContributionPreview {
  contributionAmount: number;
  amount: number; // Alias for contributionAmount
  wouldOverflow: boolean;
  wouldCauseOverflow: boolean; // Alias for wouldOverflow
  estimatedV2Tokens: number;
  expectedV2Allocation: number; // Alias for estimatedV2Tokens
  newParticipationRate: number;
  participationRateAfter: number; // Alias for newParticipationRate
  newRewardPoolUtilization: number;
  rewardPoolUtilizationAfter: number; // Alias for newRewardPoolUtilization
  bonusMultiplier: number;
  scalingFactor: number; // Additional scaling information
  safetyLevel: 'safe' | 'warning' | 'danger';
  liquidityEligible: boolean;
  isScaled: boolean; // Whether the contribution was scaled down
  warningMessage?: string; // Optional warning message
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

export interface SwapUpdateResult {
  jupiterSignature: string;
  updateSignature?: string;
  solReceived: number;
  error?: string;
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
  private jupiterApiUrl = 'https://quote-api.jup.ag/v6';

  constructor(
    private program: Program,
    private connection: Connection
  ) {}

  /**
   * Get comprehensive status of a billion-scale takeover with liquidity features
   */
  async getLiquidityStatus(takeoverAddress: PublicKey): Promise<LiquidityStatus> {
    try {
      // Use connection.getAccountInfo instead of program.account.takeover.fetch
      // This avoids the IDL type mismatch issue
      const accountInfo = await this.connection.getAccountInfo(takeoverAddress);
      
      if (!accountInfo) {
        throw new Error('Takeover account not found');
      }

      // Parse the account data manually or use a fallback approach
      // For now, we'll try to fetch using the program but with error handling
      let takeoverData: any;
      try {
        // Try to fetch with any available account method
        takeoverData = await (this.program.account as any).takeover?.fetch(takeoverAddress);
        
        if (!takeoverData) {
          // If takeover account doesn't exist, try other account names or fetch raw data
          throw new Error('Unable to parse takeover account data');
        }
      } catch (fetchError) {
        console.warn('Could not fetch takeover account data:', fetchError);
        
        // Return default/placeholder status for now
        return {
          v1TotalSupply: 0,
          v2TotalSupply: 0,
          rewardPoolTokens: 0,
          liquidityPoolTokens: 0,
          totalContributed: 0,
          rewardRateBp: 150,
          targetParticipationBp: 1000,
          calculatedMinAmount: 0,
          maxSafeTotalContribution: 0,
          participationRate: 0,
          rewardPoolUtilization: 0,
          canCreateLp: false,
          isJupiterSwapCompleted: false,
          jupiterSwapCompleted: false, // Alias
          lpCreated: false,
          maxSafeContribution: 0,
          wouldOverflow: false,
          conservativeAllocation: 0,
          bonusMultiplier: 1.0,
          estimatedV2Tokens: 0,
          liquiditySharePct: 0,
          projectedLpValue: '0.00 SOL',
          isLiquidityMode: true,
        };
      }
      
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
      const rewardPoolUtilization = rewardPoolTokens > 0 ? totalV2Needed / rewardPoolTokens : 0;
      
      // Conservative safety calculations
      const maxSafeContribution = Math.max(0, maxSafeTotalContribution - totalContributed);
      const wouldOverflow = rewardPoolUtilization > 0.98; // 98% threshold
      
      // Liquidity-specific calculations
      const bonusMultiplier = 1.0 + Math.min(participationRate * 0.5, 0.5); // Up to 50% bonus
      const conservativeAllocation = Math.floor(totalV2Needed * bonusMultiplier * 0.95); // 95% allocation
      
      // Status flags
      const isJupiterSwapCompleted = safeToBool(takeoverData.jupiterSwapCompleted, false);
      const lpCreated = safeToBool(takeoverData.lpCreated, false);
      const canCreateLp = isJupiterSwapCompleted && !lpCreated && totalContributed > calculatedMinAmount;
      
      return {
        v1TotalSupply,
        v2TotalSupply,
        rewardPoolTokens,
        liquidityPoolTokens,
        totalContributed,
        rewardRateBp,
        targetParticipationBp,
        calculatedMinAmount,
        maxSafeTotalContribution,
        participationRate,
        rewardPoolUtilization,
        canCreateLp,
        isJupiterSwapCompleted,
        jupiterSwapCompleted: isJupiterSwapCompleted, // Alias
        lpCreated,
        maxSafeContribution,
        wouldOverflow,
        conservativeAllocation,
        bonusMultiplier,
        estimatedV2Tokens: conservativeAllocation,
        liquiditySharePct: liquidityPoolTokens > 0 ? (conservativeAllocation / liquidityPoolTokens) * 100 : 0,
        projectedLpValue: '0.00 SOL', // Would need external price data
        isLiquidityMode: true,
        v1TokenMint: takeoverData.v1TokenMint,
        authority: takeoverData.authority,
        vault: takeoverData.vault,
      };
      
    } catch (error: any) {
      console.error('Failed to get liquidity status:', error);
      throw new Error(`Liquidity status error: ${error.message}`);
    }
  }

  /**
   * Preview the conservative outcome of a contribution in liquidity mode
   */
  async previewContribution(takeoverAddress: PublicKey, contributionAmount: number): Promise<ContributionPreview> {
    const status = await this.getLiquidityStatus(takeoverAddress);
    
    const newTotalContributed = status.totalContributed + contributionAmount;
    const newParticipationRate = status.v1TotalSupply > 0 ? newTotalContributed / status.v1TotalSupply : 0;
    
    // Check overflow safety
    const wouldOverflow = newTotalContributed > status.maxSafeTotalContribution;
    const newRewardPoolUtilization = status.rewardPoolTokens > 0 ? 
      (newTotalContributed * (status.rewardRateBp / 10000)) / status.rewardPoolTokens : 0;
    
    // Conservative V2 allocation
    const newBonusMultiplier = 1.0 + Math.min(newParticipationRate * 0.5, 0.5);
    const userV2Tokens = contributionAmount * (status.rewardRateBp / 10000) * newBonusMultiplier * 0.95;
    
    // Scaling calculations
    const maxSafeAmount = Math.max(0, status.maxSafeTotalContribution - status.totalContributed);
    const actualAmount = Math.min(contributionAmount, maxSafeAmount);
    const isScaled = actualAmount < contributionAmount;
    const scalingFactor = contributionAmount > 0 ? actualAmount / contributionAmount : 1;
    
    // Warning message
    let warningMessage: string | undefined;
    if (isScaled) {
      warningMessage = `Contribution scaled down to ${actualAmount.toLocaleString()} to prevent overflow`;
    } else if (newRewardPoolUtilization > 0.9) {
      warningMessage = 'High utilization - consider smaller contribution';
    }
    
    const newParticipationRatePercent = newParticipationRate * 100;
    const newRewardPoolUtilizationPercent = newRewardPoolUtilization * 100;
    
    return {
      contributionAmount,
      amount: contributionAmount, // Alias
      wouldOverflow,
      wouldCauseOverflow: wouldOverflow, // Alias
      estimatedV2Tokens: Math.floor(userV2Tokens),
      expectedV2Allocation: Math.floor(userV2Tokens), // Alias
      newParticipationRate: newParticipationRatePercent,
      participationRateAfter: newParticipationRatePercent, // Alias
      newRewardPoolUtilization: newRewardPoolUtilizationPercent,
      rewardPoolUtilizationAfter: newRewardPoolUtilizationPercent, // Alias
      bonusMultiplier: newBonusMultiplier,
      scalingFactor,
      safetyLevel: wouldOverflow ? 'danger' : newRewardPoolUtilization > 0.9 ? 'warning' : 'safe',
      liquidityEligible: !wouldOverflow && newTotalContributed > status.calculatedMinAmount,
      isScaled,
      warningMessage,
    };
  }

  /**
   * Get Jupiter quote with conservative retry logic
   */
  async getSwapQuote(inputMint: string, amount: number, maxRetries = 3): Promise<JupiterQuote> {
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    let lastError: Error = new Error('Unknown error'); // Initialize lastError
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        const params = new URLSearchParams({
          inputMint,
          outputMint: SOL_MINT,
          amount: Math.floor(amount).toString(),
          slippageBps: '300', // 3% max slippage for safety
          onlyDirectRoutes: 'false',
          asLegacyTransaction: 'false'
        });

        const response = await fetch(`${this.jupiterApiUrl}/quote?${params}`);
        
        if (!response.ok) {
          throw new Error(`Jupiter API error: ${response.status}`);
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
    authority: PublicKey,
    sendTransaction: (transaction: Transaction, connection: Connection) => Promise<string>
  ): Promise<SwapUpdateResult> {
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
      
      // Send Jupiter swap transaction
      const jupiterSignature = await sendTransaction(transaction, this.connection);
      await this.connection.confirmTransaction(jupiterSignature);
      
      const solReceived = parseInt(quote.outAmount);
      
      console.log('✅ Jupiter swap completed conservatively:', jupiterSignature);
      console.log(`💰 SOL received: ${solReceived / 1e9} SOL`);

      // Now update the takeover account with swap completion status
      try {
        console.log('🔄 Updating takeover with swap completion...');
        
        // Create instruction to update takeover with Jupiter swap completion
        // This would use a custom instruction - for now we'll simulate the update
        const updateInstruction = await this.createSwapUpdateInstruction(
          takeoverAddress,
          authority,
          solReceived
        );

        const updateTransaction = new Transaction().add(updateInstruction);
        const { blockhash } = await this.connection.getLatestBlockhash();
        updateTransaction.recentBlockhash = blockhash;
        updateTransaction.feePayer = authority;

        const updateSignature = await sendTransaction(updateTransaction, this.connection);
        await this.connection.confirmTransaction(updateSignature);

        console.log('✅ Takeover updated with swap data:', updateSignature);

        return {
          jupiterSignature,
          updateSignature,
          solReceived
        };

      } catch (updateError: any) {
        console.warn('⚠️ Jupiter swap successful but takeover update failed:', updateError);
        return {
          jupiterSignature,
          solReceived,
          error: `Swap completed but update failed: ${updateError.message}`
        };
      }
      
    } catch (error: any) {
      console.error('❌ Jupiter swap failed:', error);
      throw new Error(`Jupiter swap failed: ${error.message}`);
    }
  }

  /**
   * Create instruction to update takeover with Jupiter swap data
   * Note: This is a placeholder - actual implementation would depend on your program's instruction
   */
  private async createSwapUpdateInstruction(
    takeoverAddress: PublicKey,
    authority: PublicKey,
    solReceived: number
  ): Promise<TransactionInstruction> {
    // This is a placeholder implementation
    // In practice, you'd have a specific instruction in your program for this
    const instructionData = Buffer.alloc(12);
    instructionData.writeUInt8(255, 0); // Custom discriminator for swap update
    instructionData.writeBigUInt64LE(BigInt(solReceived), 4);

    return new TransactionInstruction({
      keys: [
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: takeoverAddress, isSigner: false, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: new PublicKey(PROGRAM_ID),
      data: instructionData,
    });
  }

  /**
   * Build a contribution transaction for liquidity mode
   */
  async buildContributionTransaction(
    takeoverAddress: PublicKey,
    contributorAddress: PublicKey,
    amount: number,
    v1TokenMint: PublicKey,
    vault: PublicKey
  ): Promise<Transaction> {
    const contributionLamports = BigInt(Math.floor(amount * 1_000_000)); // Assuming 6 decimals
    
    // Get user's associated token account
    const userTokenAccount = getAssociatedTokenAddress(v1TokenMint, contributorAddress);
    
    // Create contributor account PDA
    const [contributorPDA] = await findContributorPDA(takeoverAddress, contributorAddress);

    // Create the transaction
    const transaction = new Transaction();
    
    // Check if ATA exists, create if needed
    try {
      const accountInfo = await this.connection.getAccountInfo(userTokenAccount);
      if (!accountInfo) {
        const createATAInstruction = createAssociatedTokenAccountInstruction(
          contributorAddress,
          userTokenAccount,
          contributorAddress,
          v1TokenMint
        );
        transaction.add(createATAInstruction);
      }
    } catch (error) {
      // Create ATA instruction if it doesn't exist
      const createATAInstruction = createAssociatedTokenAccountInstruction(
        contributorAddress,
        userTokenAccount,
        contributorAddress,
        v1TokenMint
      );
      transaction.add(createATAInstruction);
    }

    const instructionData = Buffer.alloc(16); // 8 bytes discriminator + 8 bytes amount
const discriminator = [14, 10, 23, 114, 130, 172, 248, 38]; // Complete discriminator from IDL

// Write the complete discriminator
discriminator.forEach((byte, index) => {
  instructionData.writeUInt8(byte, index);
});

// Write amount starting at byte 8 (after the discriminator)
instructionData.writeBigUInt64LE(contributionLamports, 8);

    // Create the contribute instruction
    const contributeInstruction = new TransactionInstruction({
      keys: [
        { pubkey: contributorAddress, isSigner: true, isWritable: true },        // contributor
        { pubkey: takeoverAddress, isSigner: false, isWritable: true },          // takeover
        { pubkey: userTokenAccount, isSigner: false, isWritable: true },         // contributor_ata
        { pubkey: vault, isSigner: false, isWritable: true },                    // vault
        { pubkey: contributorPDA, isSigner: false, isWritable: true },           // contributor_account
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },        // token_program
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
      ],
      programId: new PublicKey(PROGRAM_ID),
      data: instructionData
    });

    transaction.add(contributeInstruction);
    
    return transaction;
  }
}

/**
 * React hook for liquidity mode operations integrated with existing patterns
 */
export function useLiquidityMode(takeoverAddress: PublicKey) {
  const [status, setStatus] = useState<LiquidityStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, sendTransaction } = wallet;
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
    if (!liquidityManager || !publicKey || !program || !sendTransaction || !status) {
      throw new Error('Not ready to contribute');
    }
    
    if (!status.v1TokenMint || !status.vault) {
      throw new Error('Missing required takeover data');
    }
    
    try {
      console.log('🔄 Building liquidity mode contribution transaction...');
      
      // Build the contribution transaction
      const transaction = await liquidityManager.buildContributionTransaction(
        takeoverAddress,
        publicKey,
        amount,
        status.v1TokenMint,
        status.vault
      );
      
      // Get recent blockhash and set fee payer
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // Send and confirm transaction
      console.log('🔄 Sending liquidity mode contribution transaction...');
      const signature = await sendTransaction(transaction, connection);
      
      console.log('⏳ Waiting for confirmation...', signature);
      await connection.confirmTransaction(signature, 'confirmed');
      
      console.log('✅ Liquidity mode contribution confirmed!');
      
      // Record the contribution in the database
      try {
        const response = await fetch('/api/contributions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            takeoverId: parseInt(takeoverAddress.toString().slice(0, 8), 16),
            amount: (amount * 1_000_000).toString(), // Convert to lamports
            contributor: publicKey.toString(),
            transactionSignature: signature,
            isLiquidityMode: true
          })
        });

        if (!response.ok) {
          console.warn('Failed to record contribution in database, but blockchain transaction succeeded');
        }
      } catch (dbError) {
        console.warn('Database recording failed:', dbError);
        // Don't fail the whole operation for database issues
      }

      if (toast) {
        toast({
          title: "Liquidity Contribution Success! 🌊",
          description: `Contributed ${amount.toLocaleString()} tokens in liquidity mode`,
        });
      }
      
      // Refresh status after contribution
      await refreshStatus();
      
      return signature;
        
    } catch (error: any) {
      console.error('Liquidity contribution error:', error);
      if (toast) {
        toast({
          title: "Liquidity Contribution Failed",
          description: error.message,
          variant: "destructive"
        });
      }
      throw error;
    }
  }, [liquidityManager, takeoverAddress, publicKey, program, toast, sendTransaction, status, connection, refreshStatus]);

  const executeSwap = useCallback(async (v1TokenMint: string, amount: number) => {
    if (!liquidityManager || !publicKey || !sendTransaction) {
      throw new Error('Not ready to execute swap');
    }

    try {
      console.log('🔄 Executing Jupiter swap for liquidity...');
      
      const result = await liquidityManager.executeSwapAndUpdate(
        takeoverAddress,
        v1TokenMint,
        amount,
        program!,
        publicKey,
        sendTransaction
      );

      if (toast) {
        if (result.error) {
          toast({
            title: "Swap Completed with Warning ⚠️",
            description: result.error,
            variant: "destructive"
          });
        } else {
          toast({
            title: "Jupiter Swap Successful! 🚀",
            description: `Received ${(result.solReceived / 1e9).toFixed(4)} SOL`,
          });
        }
      }

      // Refresh status after swap
      await refreshStatus();
      
      return result;
      
    } catch (error: any) {
      console.error('Jupiter swap error:', error);
      if (toast) {
        toast({
          title: "Jupiter Swap Failed",
          description: error.message,
          variant: "destructive"
        });
      }
      throw error;
    }
  }, [liquidityManager, takeoverAddress, publicKey, sendTransaction, program, toast, refreshStatus]);

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
    executeSwap,
    
    // Computed values for UI
    isOverflowRisk: status ? status.rewardPoolUtilization > 0.9 : false,
    canContribute: status ? status.maxSafeContribution > 0 && !status.wouldOverflow : false,
    participationLevel: status ? status.participationRate * 100 : 0,
    isConservativeMode: status ? status.rewardRateBp <= 200 : false,
    safetyMargin: status ? ((status.maxSafeTotalContribution - status.totalContributed) / 1_000_000) : 0,
    liquidityEligible: status ? status.totalContributed > status.calculatedMinAmount : false,
    estimatedApy: status ? Math.min(status.bonusMultiplier * 100 - 100, 50) : 0, // Cap at 50% APY
    riskLevel: status ? (
      status.rewardPoolUtilization > 0.95 ? 'high' :
      status.rewardPoolUtilization > 0.8 ? 'medium' : 'low'
    ) : 'unknown',
  };
}