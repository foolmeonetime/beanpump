"use client";

import { useEffect, useRef } from 'react';
import { useToast } from '@/components/ui/use-toast';

interface Takeover {
  id: number;
  address: string;
  tokenName: string;
  isFinalized: boolean;
  isSuccessful: boolean;
  v2TokenMint?: string;
  totalContributed: string;
  customRewardRate: number;
}

export function useAutoPoolCreation(takeovers: Takeover[]) {
  const { toast } = useToast();
  const processedTakeoverIds = useRef(new Set<number>());

  useEffect(() => {
    // Check for newly finalized successful takeovers
    const newlyFinalized = takeovers.filter(takeover => 
      takeover.isFinalized && 
      takeover.isSuccessful && 
      takeover.v2TokenMint &&
      !processedTakeoverIds.current.has(takeover.id)
    );

    // Process each newly finalized takeover
    newlyFinalized.forEach(async (takeover) => {
      try {
        // Mark as processed to avoid duplicate creation
        processedTakeoverIds.current.add(takeover.id);

        // Calculate initial liquidity based on takeover success
        const totalContributed = Number(takeover.totalContributed) / 1e6; // Convert to human-readable
        const rewardMultiplier = takeover.customRewardRate;
        
        // Conservative liquidity calculation
        // Use 5% of contributed amount as SOL liquidity
        const initialSolAmount = Math.max(1, totalContributed * 0.05 * 1e9); // Min 1 SOL
        // Use 10% of V2 rewards as token liquidity  
        const v2TokensForLiquidity = totalContributed * rewardMultiplier * 0.1;
        const initialTokenAmount = Math.max(100000, v2TokensForLiquidity) * 1e6; // Min 100k tokens

        console.log(`🏊 Auto-creating pool for ${takeover.tokenName} takeover:`);
        console.log(`Initial SOL: ${initialSolAmount / 1e9}, Initial Tokens: ${initialTokenAmount / 1e6}`);

        // Create pool simulation via API
        const response = await fetch('/api/pools', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create',
            tokenMint: takeover.v2TokenMint,
            tokenSymbol: `${takeover.tokenName}-V2`,
            initialSolAmount,
            initialTokenAmount,
            fee: 0.003 // 0.3% fee
          })
        });

        const data = await response.json();

        if (data.success) {
          toast({
            title: "🏊 Pool Simulation Created!",
            description: `${takeover.tokenName} V2 token pool simulation is now available`,
            duration: 8000
          });

          // Optionally add some initial trading activity
          setTimeout(() => {
            simulateInitialActivity(data.pool.id, takeover.tokenName);
          }, 2000);
        } else {
          console.error('Failed to create pool:', data.error);
        }

      } catch (error) {
        console.error('Error auto-creating pool:', error);
        // Don't show error toast to avoid spam
      }
    });

  }, [takeovers, toast]);

  return {
    processedCount: processedTakeoverIds.current.size
  };
}

// Helper function to simulate some initial trading activity
async function simulateInitialActivity(poolId: string, tokenName: string) {
  try {
    // Simulate a few small trades to establish price movement
    const trades = [
      { inputToken: 'SOL', amount: 0.1 * 1e9 }, // 0.1 SOL
      { inputToken: 'TOKEN', amount: 1000 * 1e6 }, // 1000 tokens
      { inputToken: 'SOL', amount: 0.05 * 1e9 }, // 0.05 SOL
    ];

    for (const trade of trades) {
      await fetch('/api/pools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'swap',
          poolId,
          inputToken: trade.inputToken,
          inputAmount: trade.amount,
          user: 'initial_liquidity_bot',
          slippageTolerance: 0.05
        })
      });

      // Small delay between trades
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`✅ Initial trading activity simulated for ${tokenName} pool`);

  } catch (error) {
    console.error('Error simulating initial activity:', error);
  }
}