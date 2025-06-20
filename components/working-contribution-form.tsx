"use client";

import { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { LoadingSpinner } from '@/components/loading-spinner';
import { useToast } from '@/components/ui/use-toast';

const PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID || "5Z3xKkGh9YKhwjXXiPGhAHZFb6VhjjZe8bPs2yaBU7dj");

interface WorkingContributionFormProps {
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
}

// Helper function to get associated token address (compatible with older SPL versions)
const getAssociatedTokenAddressSync = (mint: PublicKey, owner: PublicKey): PublicKey => {
  const [address] = PublicKey.findProgramAddressSync(
    [
      owner.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return address;
};

// Helper function to create ATA instruction (compatible with older SPL versions)
const createAssociatedTokenAccountInstructionLegacy = (
  payer: PublicKey,
  associatedToken: PublicKey,
  owner: PublicKey,
  mint: PublicKey
): TransactionInstruction => {
  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    data: Buffer.alloc(0),
  });
};

export function WorkingContributionForm({
  takeoverAddress,
  tokenName,
  minAmount,
  endTime,
  isFinalized,
  vault,
  v1TokenMint,
  totalContributed,
  calculatedMinAmount,
  maxSafeTotalContribution
}: WorkingContributionFormProps) {
  const { publicKey, sendTransaction, connected } = useWallet();
  const { connection } = useConnection();
  const { toast } = useToast();
  
  const [amount, setAmount] = useState('');
  const [contributing, setContributing] = useState(false);
  const [userTokenBalance, setUserTokenBalance] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [estimatedRewards, setEstimatedRewards] = useState<{
    v1Tokens: number;
    v2Tokens: number;
    rewardMultiplier: number;
  } | null>(null);

  // Convert string amounts to numbers safely
  const minAmountNum = parseFloat(minAmount || '0');
  const totalContributedNum = parseFloat(totalContributed || '0');
  const maxSafeNum = parseFloat(maxSafeTotalContribution || '0');
  const calculatedMinNum = parseFloat(calculatedMinAmount || '0');
  
  // Use calculated min amount if available, otherwise fall back to min amount
  const actualMinAmount = calculatedMinNum > 0 ? calculatedMinNum : minAmountNum;
  
  // Check if takeover is still active
  const now = Math.floor(Date.now() / 1000);
  const isActive = !isFinalized && endTime > now;
  const timeLeft = Math.max(0, endTime - now);
  
  // Calculate progress towards goal
  const progressPercent = actualMinAmount > 0 ? Math.min(100, (totalContributedNum / actualMinAmount) * 100) : 0;
  const isGoalMet = totalContributedNum >= actualMinAmount;
  
  // Calculate remaining safe contribution space
  const remainingSafeSpace = maxSafeNum > 0 ? Math.max(0, maxSafeNum - totalContributedNum) : Number.MAX_SAFE_INTEGER;

  // Fetch user token balance
  useEffect(() => {
    const fetchBalance = async () => {
      if (!publicKey || !v1TokenMint || !connected) return;
      
      try {
        setLoading(true);
        const tokenMintPubkey = new PublicKey(v1TokenMint);
        const userTokenAccount = getAssociatedTokenAddressSync(tokenMintPubkey, publicKey);
        
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
  }, [publicKey, v1TokenMint, connection, connected]);

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
    if (!publicKey || !connected) {
      toast({
        title: "Wallet Required",
        description: "Please connect your wallet to contribute",
        variant: "destructive"
      });
      return;
    }

    const contributionAmount = parseFloat(amount);
    if (contributionAmount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid contribution amount",
        variant: "destructive"
      });
      return;
    }

    if (contributionAmount > userTokenBalance) {
      toast({
        title: "Insufficient Balance",
        description: `You only have ${userTokenBalance.toLocaleString()} tokens`,
        variant: "destructive"
      });
      return;
    }

    // Check if contribution would exceed safe limits
    if (contributionAmount > remainingSafeSpace / 1_000_000) {
      toast({
        title: "Amount Too Large",
        description: `Maximum safe contribution is ${(remainingSafeSpace / 1_000_000).toLocaleString()} tokens`,
        variant: "destructive"
      });
      return;
    }

    try {
      setContributing(true);
      
      // Convert to program units (assuming 6 decimals)
      const contributionLamports = BigInt(Math.floor(contributionAmount * 1_000_000));
      
      // Create the contribution instruction
      const takeoverPubkey = new PublicKey(takeoverAddress);
      const vaultPubkey = new PublicKey(vault);
      const tokenMintPubkey = new PublicKey(v1TokenMint);
      
      // Get user's associated token account
      const userTokenAccount = getAssociatedTokenAddressSync(tokenMintPubkey, publicKey);
      
      // Create contributor account PDA
      const [contributorPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("contributor"),
          takeoverPubkey.toBuffer(),
          publicKey.toBuffer()
        ],
        PROGRAM_ID
      );

      // Create the transaction
      const transaction = new Transaction();
      
      // Check if ATA exists by trying to get account info
      try {
        await connection.getAccountInfo(userTokenAccount);
      } catch (error) {
        // Create ATA instruction if it doesn't exist
        const createATAInstruction = createAssociatedTokenAccountInstructionLegacy(
          publicKey,
          userTokenAccount,
          publicKey,
          tokenMintPubkey
        );
        transaction.add(createATAInstruction);
      }

      // Create contribute instruction data
      const instructionData = Buffer.alloc(9);
      instructionData.writeUInt8(1, 0); // contribute instruction discriminator
      instructionData.writeBigUInt64LE(contributionLamports, 1);

      // Create the contribute instruction
      const contributeInstruction = new TransactionInstruction({
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },        // contributor
          { pubkey: takeoverPubkey, isSigner: false, isWritable: true },  // takeover
          { pubkey: userTokenAccount, isSigner: false, isWritable: true }, // contributor_ata
          { pubkey: vaultPubkey, isSigner: false, isWritable: true },     // vault
          { pubkey: contributorPDA, isSigner: false, isWritable: true },  // contributor_account
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
        ],
        programId: PROGRAM_ID,
        data: instructionData
      });

      transaction.add(contributeInstruction);
      
      // Get recent blockhash and set fee payer
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // Send and confirm transaction
      console.log('🔄 Sending contribution transaction...');
      const signature = await sendTransaction(transaction, connection);
      
      console.log('⏳ Waiting for confirmation...', signature);
      await connection.confirmTransaction(signature, 'confirmed');
      
      console.log('✅ Transaction confirmed, recording contribution...');
      
      // Record the contribution in the database
      try {
        const response = await fetch('/api/contributions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            takeoverId: parseInt(takeoverAddress.slice(0, 8), 16), // Generate a numeric ID from address
            amount: contributionLamports.toString(),
            contributor: publicKey.toString(),
            transactionSignature: signature
          })
        });

        if (!response.ok) {
          console.warn('Failed to record contribution in database, but blockchain transaction succeeded');
        }
      } catch (dbError) {
        console.warn('Database recording failed:', dbError);
        // Don't fail the whole operation for database issues
      }

      toast({
        title: "Success! 🎉",
        description: `Contributed ${contributionAmount.toLocaleString()} tokens successfully`,
      });
      
      // Reset form
      setAmount('');
      setEstimatedRewards(null);
      
      // Refresh the page data
      setTimeout(() => {
        window.location.reload();
      }, 2000);
      
    } catch (error: any) {
      console.error("Contribution error:", error);
      toast({
        title: "Contribution Failed",
        description: error.message || "Failed to contribute. Please try again.",
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
            This takeover has {isFinalized ? 'been finalized' : 'expired'}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contribute to {tokenName} Takeover</CardTitle>
        <CardDescription>
          Help reach the goal of {formatAmount(actualMinAmount / 1_000_000)}M tokens
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Progress Section */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span>{formatAmount(totalContributedNum / 1_000_000)}M / {formatAmount(actualMinAmount / 1_000_000)}M tokens</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
          <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
            <span>{progressPercent.toFixed(1)}% complete</span>
            <span>{formatTimeLeft(timeLeft)} remaining</span>
          </div>
        </div>

        {/* Goal Status */}
        {isGoalMet && (
          <div className="p-3 bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-lg">
            <p className="text-green-800 dark:text-green-200 text-sm font-medium">
              🎯 Goal Reached! Takeover can be finalized.
            </p>
          </div>
        )}

        {/* User Balance */}
        {connected && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg">
            <p className="text-blue-800 dark:text-blue-200 text-sm">
              Your {tokenName} balance: {loading ? 'Loading...' : `${formatAmount(userTokenBalance)} tokens`}
            </p>
          </div>
        )}

        {/* Contribution Form */}
        {connected ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="amount">Contribution Amount (tokens)</Label>
              <Input
                id="amount"
                type="number"
                placeholder="Enter amount"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0"
                step="1"
                className="mt-1"
              />
            </div>

            {/* Estimated Rewards */}
            {estimatedRewards && (
              <div className="p-3 bg-purple-50 dark:bg-purple-900 border border-purple-200 dark:border-purple-700 rounded-lg">
                <h4 className="font-medium text-purple-800 dark:text-purple-200 mb-2">Estimated Rewards</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-purple-700 dark:text-purple-300">V1 Tokens Burned</p>
                    <p className="font-semibold text-purple-900 dark:text-purple-100">{formatAmount(estimatedRewards.v1Tokens)}</p>
                  </div>
                  <div>
                    <p className="text-purple-700 dark:text-purple-300">V2 Tokens Received</p>
                    <p className="font-semibold text-purple-900 dark:text-purple-100">{formatAmount(estimatedRewards.v2Tokens)}</p>
                  </div>
                  <div>
                    <p className="text-purple-700 dark:text-purple-300">Reward Multiplier</p>
                    <p className="font-semibold text-purple-900 dark:text-purple-100">{estimatedRewards.rewardMultiplier.toFixed(2)}x</p>
                  </div>
                </div>
              </div>
            )}

            {/* Safe Contribution Warning */}
            {maxSafeNum > 0 && (
              <div className="p-3 bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-lg">
                <p className="text-yellow-800 dark:text-yellow-200 text-sm">
                  ⚠️ Safe contribution limit: {formatAmount(remainingSafeSpace / 1_000_000)}M tokens remaining
                </p>
              </div>
            )}

            <Button
              onClick={handleContribute}
              disabled={
                contributing || 
                !amount || 
                parseFloat(amount) <= 0 || 
                parseFloat(amount) > userTokenBalance ||
                parseFloat(amount) > remainingSafeSpace / 1_000_000
              }
              className="w-full"
            >
              {contributing ? (
                <div className="flex items-center">
                  <LoadingSpinner />
                  <span className="ml-2">Contributing...</span>
                </div>
              ) : (
                `Contribute ${amount ? formatAmount(parseFloat(amount)) : '0'} Tokens`
              )}
            </Button>
          </div>
        ) : (
          <div className="text-center p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-gray-600 dark:text-gray-400 mb-2">Connect your wallet to contribute</p>
            <p className="text-sm text-gray-500 dark:text-gray-500">You'll need {tokenName} tokens in your wallet</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}