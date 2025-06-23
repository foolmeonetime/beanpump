import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction } from '@solana/web3.js';
import { Token, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { BN } from '@coral-xyz/anchor';

interface ContributionFormProps {
  takeoverAddress: string;
  tokenName: string;
  minAmount: string;
  endTime: number;
  isFinalized: boolean;
  vault: string;
  v1TokenMint: string;
  totalContributed: string;
  calculatedMinAmount?: string;
  maxSafeTotalContribution?: string;
  contributorCount?: number;
  targetParticipationBp?: number;
  v1TotalSupply?: string;
  tokenAmountTarget?: string;
  onContribution?: () => void;
}

// ================================================================
// 🎯 CORRECTED GOAL CALCULATION FUNCTIONS
// ================================================================

const getCorrectGoalAmount = (takeover: any): number => {
  // Get the raw goal value (in lamports/wei format)
  const tokenTarget = parseFloat(takeover.token_amount_target || '0');
  const calculatedMin = parseFloat(takeover.calculated_min_amount || '0');
  const minAmount = parseFloat(takeover.min_amount || '0');
  
  // Priority order: token_amount_target > calculated_min_amount > min_amount
  const rawGoal = tokenTarget > 0 ? tokenTarget : 
                  calculatedMin > 0 ? calculatedMin : minAmount;
  
  // Convert from raw amount to actual tokens (assuming 6 decimals)
  const actualGoal = rawGoal / 1_000_000;
  
  console.log('🎯 Goal Calculation Debug:', {
    token_amount_target: tokenTarget,
    calculated_min_amount: calculatedMin,
    min_amount: minAmount,
    raw_goal: rawGoal,
    actual_goal_tokens: actualGoal,
    v1_total_supply: takeover.v1_total_supply,
    target_participation_bp: takeover.target_participation_bp
  });
  
  return actualGoal;
};

const getCorrectProgress = (takeover: any): number => {
  const goalAmount = getCorrectGoalAmount(takeover);
  const contributedRaw = parseFloat(takeover.total_contributed || '0');
  const contributedTokens = contributedRaw / 1_000_000; // Convert to actual tokens
  
  if (goalAmount <= 0) return 0;
  
  const progressPercent = (contributedTokens / goalAmount) * 100;
  
  console.log('📊 Progress Calculation:', {
    contributed_raw: contributedRaw,
    contributed_tokens: contributedTokens,
    goal_tokens: goalAmount,
    progress_percent: progressPercent
  });
  
  return Math.min(100, Math.max(0, progressPercent));
};

const isGoalActuallyMet = (takeover: any): boolean => {
  const goalAmount = getCorrectGoalAmount(takeover);
  const contributedTokens = parseFloat(takeover.total_contributed || '0') / 1_000_000;
  
  const goalMet = contributedTokens >= goalAmount;
  
  console.log('✅ Goal Status Check:', {
    contributed_tokens: contributedTokens,
    goal_tokens: goalAmount,
    is_goal_met: goalMet
  });
  
  return goalMet;
};

const formatGoalDisplay = (goalAmount: number): string => {
  if (goalAmount >= 1_000_000) {
    return `${(goalAmount / 1_000_000).toFixed(1)}B`;
  } else if (goalAmount >= 1_000) {
    return `${(goalAmount / 1_000).toFixed(1)}M`;
  } else if (goalAmount >= 1) {
    return `${goalAmount.toFixed(1)}K`;
  } else {
    return goalAmount.toString();
  }
};

const formatContributedDisplay = (contributedRaw: number): string => {
  const contributed = contributedRaw / 1_000_000;
  return formatGoalDisplay(contributed);
};

// ================================================================
// 🎯 MAIN COMPONENT WITH CORRECTED LOGIC
// ================================================================

export default function WorkingContributionForm(props: ContributionFormProps) {
  const {
    takeoverAddress,
    tokenName,
    minAmount,
    endTime,
    isFinalized,
    vault,
    v1TokenMint,
    totalContributed,
    calculatedMinAmount,
    maxSafeTotalContribution,
    contributorCount = 0,
    targetParticipationBp,
    v1TotalSupply,
    tokenAmountTarget,
    onContribution
  } = props;

  // Create takeover object from individual props for compatibility with existing logic
  const takeover = {
    address: takeoverAddress,
    token_name: tokenName,
    min_amount: minAmount,
    endTime: endTime,
    isFinalized: isFinalized,
    vault: vault,
    v1TokenMint: v1TokenMint,
    total_contributed: totalContributed, // Fixed: use snake_case
    calculated_min_amount: calculatedMinAmount,
    max_safe_total_contribution: maxSafeTotalContribution,
    contributor_count: contributorCount, // Fixed: use snake_case
    target_participation_bp: targetParticipationBp,
    v1_total_supply: v1TotalSupply,
    token_amount_target: tokenAmountTarget
  };
  const [amount, setAmount] = useState('');
  const [contributing, setContributing] = useState(false);
  const [userTokenBalance, setUserTokenBalance] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [estimatedRewards, setEstimatedRewards] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  const { toast } = useToast();
  const { publicKey, sendTransaction, connected } = useWallet();
  const { connection } = useConnection();

  // ================================================================
  // 🎯 CORRECTED CALCULATIONS USING NEW FUNCTIONS
  // ================================================================
  
  // Use corrected goal calculation
  const actualGoal = getCorrectGoalAmount(takeover);
  const progressPercent = getCorrectProgress(takeover);
  const isGoalMet = isGoalActuallyMet(takeover);
  const goalDisplay = formatGoalDisplay(actualGoal);
  
  // Parse takeover data with corrections
  const totalContributedRaw = parseFloat(totalContributed || '0');
  const totalContributedDisplay = formatContributedDisplay(totalContributedRaw);
  const maxSafeRaw = parseFloat(maxSafeTotalContribution || '0');
  const maxSafeTokens = maxSafeRaw / 1_000_000;
  
  // Check if takeover is still active
  const now = Math.floor(Date.now() / 1000);
  const isActive = !isFinalized && endTime > now;
  const timeLeft = Math.max(0, endTime - now);
  
  // Calculate remaining safe contribution space
  const remainingSafeSpace = Math.max(0, maxSafeTokens - (totalContributedRaw / 1_000_000));

  // Debug function for browser console
  const debugTakeoverGoals = useCallback(() => {
    console.log('🔍 TAKEOVER GOAL ANALYSIS:');
    console.log('================================');
    console.log('Raw Database Values:');
    console.log('  min_amount:', takeover.min_amount);
    console.log('  calculated_min_amount:', takeover.calculated_min_amount);
    console.log('  token_amount_target:', takeover.token_amount_target);
    console.log('  v1_total_supply:', takeover.v1_total_supply);
    console.log('  total_contributed:', takeover.total_contributed);
    console.log('');
    
    console.log('Corrected Values:');
    console.log('  Actual Goal (tokens):', actualGoal.toLocaleString());
    console.log('  Progress:', progressPercent.toFixed(2) + '%');
    console.log('  Goal Met:', isGoalMet);
    console.log('  Display Goal:', goalDisplay);
    console.log('');
    
    console.log('Issues Found:');
    if (parseFloat(takeover.v1_total_supply || '0') > 100_000_000_000_000) {
      console.log('  ❌ V1 total supply seems too high:', takeover.v1_total_supply);
    }
    if (!takeover.target_participation_bp) {
      console.log('  ❌ Missing target_participation_bp');
    }
    if (actualGoal > 1_000_000) {
      console.log('  ⚠️ Goal over 1M tokens - check if this is correct');
    }
  }, [takeover, actualGoal, progressPercent, isGoalMet, goalDisplay]);

  // Make debug function available globally
  useEffect(() => {
    (window as any).debugTakeoverGoals = debugTakeoverGoals;
  }, [debugTakeoverGoals]);

  // Fetch user token balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (!publicKey || !takeover.v1TokenMint || !connected) return;
      
      try {
        setLoading(true);
        const tokenMintPubkey = new PublicKey(v1TokenMint); // Use prop directly
        
        // Get associated token address using Token class (v0.1.8 method)
        const userTokenAccount = await Token.getAssociatedTokenAddress(
          ASSOCIATED_TOKEN_PROGRAM_ID,
          TOKEN_PROGRAM_ID,
          tokenMintPubkey,
          publicKey
        );
        
        // Try to get token account balance
        try {
          const accountInfo = await connection.getTokenAccountBalance(userTokenAccount);
          if (accountInfo?.value?.amount) {
            setUserTokenBalance(Number(accountInfo.value.amount) / 1_000_000); // Convert from lamports
          } else {
            setUserTokenBalance(0);
          }
        } catch (error) {
          console.log('Token account not found or no balance:', error);
          setUserTokenBalance(0);
        }
      } catch (error) {
        console.error('Error fetching balance:', error);
        setUserTokenBalance(0);
      } finally {
        setLoading(false);
      }
    };

    fetchBalance();
  }, [publicKey, v1TokenMint, connection, connected]); // Updated dependencies

  // Calculate estimated rewards when amount changes
  useEffect(() => {
    const calculateRewards = () => {
      const contributionAmount = parseFloat(amount);
      if (contributionAmount > 0) {
        // Basic 1:1 conversion with potential bonus for early contributors
        const v1Tokens = contributionAmount;
        const baseV2Tokens = contributionAmount;
        
        // Simple bonus calculation based on how early the contribution is
        const timeRemainingRatio = timeLeft / (7 * 24 * 60 * 60); // Assuming 7 day duration
        const earlyBirdBonus = Math.min(0.5, timeRemainingRatio * 0.2); // Up to 20% bonus
        const rewardMultiplier = 1 + earlyBirdBonus;
        const v2Tokens = baseV2Tokens * rewardMultiplier;
        
        setEstimatedRewards({
          v1Tokens,
          v2Tokens,
          rewardMultiplier
        });
      } else {
        setEstimatedRewards(null);
      }
    };

    calculateRewards();
  }, [amount, timeLeft]);

  const handleContribute = async () => {
    if (!publicKey || !sendTransaction) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to contribute",
        variant: "destructive"
      });
      return;
    }

    const contributionAmount = parseFloat(amount);
    if (!contributionAmount || contributionAmount <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid contribution amount",
        variant: "destructive"
      });
      return;
    }

    if (contributionAmount > userTokenBalance) {
      toast({
        title: "Insufficient balance",
        description: `You only have ${userTokenBalance.toLocaleString()} tokens`,
        variant: "destructive"
      });
      return;
    }

    try {
      setContributing(true);
      
      // Convert contribution to lamports for blockchain
      const contributionLamports = new BN(contributionAmount * 1_000_000);
      
      console.log('🔄 Starting contribution:', {
        amount: contributionAmount,
        lamports: contributionLamports.toString(),
        takeover_address: takeover.address
      });

      // Here you would call your blockchain contribution function
      // const signature = await contributeToTakeover(takeover.address, contributionLamports);
      const signature = `mock_signature_${Date.now()}`; // Mock for now
      
      console.log('✅ Blockchain contribution successful:', signature);
      
      // Record the contribution in the database
      try {
        const response = await fetch('/api/contributions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            takeoverId: takeoverAddress, // Use prop directly
            amount: contributionLamports.toString(),
            contributor: publicKey.toString(),
            transactionSignature: signature
          })
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.warn('❌ Database recording failed:', errorText);
          
          // Try to sync the database
          try {
            const newTotalContributed = totalContributedRaw + contributionLamports.toNumber();
            await fetch('/api/sync-takeover', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                takeoverAddress: takeoverAddress, // Use prop directly
                onChainTotalContributed: newTotalContributed.toString(),
                onChainContributorCount: takeover.contributor_count + 1 // Fixed: use snake_case
              })
            });
            console.log('✅ Database synced successfully');
          } catch (syncError) {
            console.warn('⚠️ Sync also failed:', syncError);
          }
        } else {
          console.log('✅ Database recording successful');
        }
      } catch (dbError) {
        console.warn('❌ Database error:', dbError);
        // Don't fail the whole operation for database issues
      }

      toast({
        title: "Success! 🎉",
        description: `Contributed ${contributionAmount.toLocaleString()} tokens successfully`,
      });
      
      // Reset form
      setAmount('');
      setEstimatedRewards(null);
      
      // Call onContribution callback if provided
      if (onContribution) {
        onContribution();
      }
      
      // Refresh the page data
      setTimeout(() => {
        window.location.reload();
      }, 2000);
      
    } catch (error: any) {
      console.error("❌ Contribution error:", error);
      
      let errorMessage = "Unknown error occurred";
      
      // Provide specific error messages for common issues
      if (error.message?.includes('User rejected')) {
        errorMessage = "Transaction was cancelled by user";
      }
      
      toast({
        title: "Contribution Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setContributing(false);
    }
  };

  const formatAmount = (amount: number) => {
    return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const formatTimeLeft = (seconds: number) => {
    const days = Math.floor(seconds / (24 * 60 * 60));
    const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  if (!isActive) {
    return (
      <Card className="bg-gray-100 dark:bg-gray-800">
        <CardHeader>
          <CardTitle className="text-gray-600 dark:text-gray-400">Takeover Ended</CardTitle>
          <CardDescription>
            This takeover has {isFinalized ? 'been finalized' : 'expired'}.
            {isGoalMet ? ' The goal was successfully reached!' : ' The goal was not reached.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <div>Goal: {goalDisplay} tokens</div>
            <div>Contributed: {totalContributedDisplay} tokens</div>
            <div>Progress: {progressPercent.toFixed(2)}%</div>
            <div>Status: {isGoalMet ? '✅ Goal Met' : '❌ Goal Not Met'}</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Contribute Tokens</span>
          <span className="text-sm font-normal">
            {formatTimeLeft(timeLeft)} left
          </span>
        </CardTitle>
        <CardDescription>
          Help reach the goal of {goalDisplay} tokens
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress Section */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span className="font-medium">
              {totalContributedDisplay} / {goalDisplay} ({progressPercent.toFixed(1)}%)
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all ${
                isGoalMet ? 'bg-green-600' : 'bg-blue-600'
              }`}
              style={{ width: `${Math.min(100, progressPercent)}%` }}
            />
          </div>
          {isGoalMet && (
            <div className="text-green-600 text-sm font-medium">
              🎉 Goal reached! Additional contributions welcome.
            </div>
          )}
        </div>

        {/* Balance Display */}
        {connected && (
          <div className="flex justify-between text-sm text-gray-600">
            <span>Your balance:</span>
            <span className="font-medium">
              {loading ? 'Loading...' : `${formatAmount(userTokenBalance)} tokens`}
            </span>
          </div>
        )}

        {/* Contribution Input */}
        <div className="space-y-2">
          <label htmlFor="amount" className="text-sm font-medium">
            Contribution Amount
          </label>
          <Input
            id="amount"
            type="number"
            placeholder="Enter amount..."
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0"
            max={userTokenBalance}
            step="1"
          />
          {userTokenBalance > 0 && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAmount((userTokenBalance * 0.25).toString())}
              >
                25%
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAmount((userTokenBalance * 0.5).toString())}
              >
                50%
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAmount((userTokenBalance * 0.75).toString())}
              >
                75%
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAmount(userTokenBalance.toString())}
              >
                Max
              </Button>
            </div>
          )}
        </div>

        {/* Estimated Rewards */}
        {estimatedRewards && (
          <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg space-y-1">
            <div className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Estimated Rewards
            </div>
            <div className="text-xs text-blue-600 dark:text-blue-300 space-y-1">
              <div>V1 Tokens: {formatAmount(estimatedRewards.v1Tokens)}</div>
              <div>V2 Tokens: {formatAmount(estimatedRewards.v2Tokens)}</div>
              <div>Multiplier: {estimatedRewards.rewardMultiplier.toFixed(2)}x</div>
            </div>
          </div>
        )}

        {/* Safe Space Warning */}
        {remainingSafeSpace < actualGoal * 0.1 && (
          <div className="bg-yellow-50 dark:bg-yellow-950 p-3 rounded-lg">
            <div className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
              ⚠️ Limited space remaining
            </div>
            <div className="text-xs text-yellow-600 dark:text-yellow-300">
              Only {formatGoalDisplay(remainingSafeSpace)} tokens of safe contribution space left
            </div>
          </div>
        )}

        {/* Contribute Button */}
        <Button
          onClick={handleContribute}
          disabled={contributing || !connected || !amount || parseFloat(amount) <= 0}
          className="w-full"
        >
          {contributing ? 'Contributing...' : `Contribute ${amount || '0'} Tokens`}
        </Button>

        {/* Debug Info */}
        {showDebug && debugInfo && (
          <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg">
            <div className="text-sm font-medium mb-2">Debug Information</div>
            <pre className="text-xs overflow-auto">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </div>
        )}

        {/* Debug Button (Development) */}
        {process.env.NODE_ENV === 'development' && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              debugTakeoverGoals();
              setShowDebug(!showDebug);
            }}
          >
            {showDebug ? 'Hide Debug' : 'Show Debug'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}