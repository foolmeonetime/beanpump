"use client";

import { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, SystemProgram, TransactionInstruction, SendTransactionError } from '@solana/web3.js';
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
import { BN } from "@coral-xyz/anchor";
import { BillionScaleProgramInteractions } from "@/lib/program-interactions";

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

// Enhanced debugging class for transactions
class TransactionDebugger {
  private connection: any;
  private wallet: any;

  constructor(connection: any, wallet: any) {
    this.connection = connection;
    this.wallet = wallet;
  }

  async analyzeError(error: any, transaction?: Transaction) {
    console.log('🔍 Analyzing transaction error:', error);

    // Check wallet connection
    const walletStatus = {
      connected: this.wallet?.connected || false,
      publicKey: this.wallet?.publicKey?.toString() || null,
      adapter: this.wallet?.wallet?.adapter?.name || 'Unknown'
    };

    // Check SOL balance
    let solBalance = 0;
    if (this.wallet?.publicKey) {
      try {
        solBalance = await this.connection.getBalance(this.wallet.publicKey);
      } catch (balanceError) {
        console.warn('Could not get SOL balance:', balanceError);
      }
    }

    // Analyze error type
    let errorType = 'UNKNOWN_ERROR';
    let suggestion = 'Please try again';
    
    if (error.name === 'WalletSendTransactionError') {
      errorType = 'WALLET_ERROR';
      suggestion = 'Try disconnecting and reconnecting your wallet';
    } else if (error.message?.includes('429') || error.message?.includes('rate limit')) {
      errorType = 'RATE_LIMIT';
      suggestion = 'Network is busy. Please wait a few seconds and try again';
    } else if (error.message?.includes('insufficient')) {
      errorType = 'INSUFFICIENT_FUNDS';
      suggestion = solBalance < 5000 ? 'Add more SOL for transaction fees' : 'Insufficient token balance';
    } else if (error.message?.includes('blockhash')) {
      errorType = 'STALE_BLOCKHASH';
      suggestion = 'Network timing issue. Please try again';
    } else if (error instanceof SendTransactionError) {
      errorType = 'SEND_ERROR';
      suggestion = 'Transaction failed on-chain. Check transaction logs';
    } else if (error.message?.includes('InstructionError') && error.message?.includes('Custom":101')) {
      errorType = 'PROGRAM_ERROR';
      suggestion = 'Invalid account data or account not initialized. Check if the takeover is properly set up and your token account exists.';
    } else if (error.message?.includes('simulation failed')) {
      errorType = 'SIMULATION_ERROR';
      suggestion = 'Transaction would fail on-chain. Check account states and instruction parameters.';
    }

    return {
      errorType,
      suggestion,
      walletStatus,
      solBalance: solBalance / 1e9,
      details: {
        message: error.message,
        logs: error.logs || [],
        signature: error.signature || null
      }
    };
  }

  async validateTransaction(transaction: Transaction) {
    const issues: string[] = [];

    if (!this.wallet?.connected || !this.wallet?.publicKey) {
      issues.push('Wallet not connected');
    }

    if (!transaction.instructions || transaction.instructions.length === 0) {
      issues.push('Transaction has no instructions');
    }

    if (!transaction.feePayer) {
      issues.push('Transaction fee payer not set');
    }

    if (!transaction.recentBlockhash) {
      issues.push('Transaction missing recent blockhash');
    }

    // Check SOL balance
    if (this.wallet?.publicKey) {
      try {
        const balance = await this.connection.getBalance(this.wallet.publicKey);
        if (balance < 5000) {
          issues.push('Insufficient SOL balance for transaction fees (need at least 0.000005 SOL)');
        }
      } catch (balanceError) {
        issues.push('Could not check SOL balance');
      }
    }

    // Simulate transaction
    try {
      const simulation = await this.connection.simulateTransaction(transaction);
      if (simulation.value.err) {
        issues.push(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
      }
    } catch (simError) {
      issues.push(`Simulation error: ${simError}`);
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
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

// Helper function to get takeover database ID
const getTakeoverDatabaseId = async (takeoverAddress: string): Promise<number> => {
  try {
    console.log("🔍 Looking up takeover database ID for:", takeoverAddress);
    
    const response = await fetch(`/api/takeovers?address=${takeoverAddress}`);
    
    if (!response.ok) {
      throw new Error(`Takeover lookup failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.success || !data.data?.takeovers?.[0]?.id) {
      throw new Error("Takeover not found in database");
    }
    
    const databaseId = data.data.takeovers[0].id;
    console.log("✅ Found takeover database ID:", databaseId);
    
    return databaseId;
    
  } catch (error) {
    console.error("❌ Failed to lookup takeover database ID:", error);
    throw error;
  }
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
  const wallet = useWallet(); // Get full wallet object for debugger
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
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);

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
      
      console.log("🔧 Building billion-scale contribution transaction...");
      
      // Convert to program units (6 decimals)
      const contributionLamports = Math.floor(contributionAmount * 1_000_000);
      const contributionBN = new BN(contributionLamports);
      
      console.log("💰 Contribution details:");
      console.log("  Amount (tokens):", contributionAmount);
      console.log("  Amount (lamports):", contributionLamports);
      console.log("  Takeover:", takeoverAddress);
      console.log("  Vault:", vault);
      console.log("  Token Mint:", v1TokenMint);
      
      const takeoverPubkey = new PublicKey(takeoverAddress);
      const vaultPubkey = new PublicKey(vault);  
      const v1TokenMintPubkey = new PublicKey(v1TokenMint);
      
      console.log("🔑 Account addresses:");
      console.log("  Contributor:", publicKey.toString());
      console.log("  Takeover PDA:", takeoverPubkey.toString());
      
      // Create program interactions instance with proper wallet interface
      const programInteractions = new BillionScaleProgramInteractions(connection, {
        publicKey,
        signTransaction: wallet.signTransaction,
        signAllTransactions: wallet.signAllTransactions,
      });
      
      // FIXED: Use your existing helper function
      const userTokenAccount = getAssociatedTokenAddressSync(v1TokenMintPubkey, publicKey);
      
      console.log("  User Token Account:", userTokenAccount.toString());
      console.log("  Vault:", vaultPubkey.toString());
      
      // Derive contributor PDA for logging
      const [contributorPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("contributor"),
          takeoverPubkey.toBuffer(),
          publicKey.toBuffer()
        ],
        new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID || "CJxUrvjAXL2PR2bK8vANxLJiWWRXbyaFvzzF9cMgYmfJ")
      );
      console.log("  Contributor PDA:", contributorPDA.toString());
      console.log("  Program ID:", process.env.NEXT_PUBLIC_PROGRAM_ID);
      
      // Create transaction
      const transaction = new Transaction();
      
      // Check if user token account exists, create if needed
      try {
        const accountInfo = await connection.getAccountInfo(userTokenAccount);
        if (!accountInfo) {
          console.log("📝 Creating associated token account...");
          // FIXED: Use your existing helper function
          const createATAInstruction = createAssociatedTokenAccountInstructionLegacy(
            publicKey, // payer
            userTokenAccount, // ata
            publicKey, // owner
            v1TokenMintPubkey // mint
          );
          transaction.add(createATAInstruction);
        }
      } catch (error) {
        // FIXED: Proper error typing
        console.log("⚠️ Could not check ATA, will attempt to create:", (error as Error).message);
        // FIXED: Use your existing helper function
        const createATAInstruction = createAssociatedTokenAccountInstructionLegacy(
          publicKey,
          userTokenAccount,
          publicKey,
          v1TokenMintPubkey
        );
        transaction.add(createATAInstruction);
      }
      
      // Use the Anchor method for contribute_billion_scale
      console.log("🎯 Creating contribute_billion_scale instruction with Anchor...");
      const contributeInstruction = await programInteractions.contributeBillionScale(
        publicKey,        // contributor
        takeoverPubkey,   // takeover  
        userTokenAccount, // contributorAta
        vaultPubkey,      // vault
        contributionBN    // amount as BN
      );
      
      transaction.add(contributeInstruction);
      
      // Get fresh blockhash and set fee payer
      console.log("🔗 Getting fresh blockhash...");
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      // Validate transaction before sending
      console.log("🧪 Validating transaction...");
      const simulation = await connection.simulateTransaction(transaction);
      
      if (simulation.value.err) {
        const errorMsg = `Transaction validation failed: ${JSON.stringify(simulation.value.err)}`;
        console.log("❌ Validation failed:", simulation.value.err);
        throw new Error(errorMsg);
      }
      
      console.log("✅ Validation successful!");
      if (simulation.value.logs) {
        console.log("📋 Simulation logs:", simulation.value.logs);
      }
      
      // Send and confirm transaction
      console.log("🔄 Sending contribution transaction...");
      const signature = await sendTransaction(transaction, connection);
      
      console.log("⏳ Waiting for confirmation...", signature);
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err}`);
      }
      
      console.log("✅ Transaction confirmed, recording contribution...");
      
      // Record the contribution in the database
      try {
        console.log("🔍 Getting takeover database ID...");
        
        // Get the actual database ID using our helper function
        const actualTakeoverId = await getTakeoverDatabaseId(takeoverAddress);
        
        console.log("💾 Recording contribution in database...");
        const response = await fetch('/api/contributions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            takeoverId: actualTakeoverId, // Use the actual database ID
            amount: contributionLamports.toString(),
            contributor: publicKey.toString(),
            transactionSignature: signature
          })
        });

        console.log("📊 Database response status:", response.status);

        if (!response.ok) {
          const errorText = await response.text();
          console.error("❌ Database recording failed:", errorText);
          
          try {
            const errorData = JSON.parse(errorText);
            console.error("📋 Detailed error:", errorData);
          } catch {
            console.error("📋 Raw error response:", errorText);
          }
          
          console.warn("⚠️ Database recording failed, but blockchain transaction succeeded");
        } else {
          const responseData = await response.json();
          console.log("✅ Database recording successful:", responseData);
          
          if (responseData.success) {
            console.log("🎯 Contribution recorded with ID:", responseData.data?.contribution?.id);
          }
        }
        
      } catch (dbError) {
        console.error("💥 Database recording error:", dbError);
        console.warn("⚠️ Database recording failed, but blockchain transaction succeeded");
        // Don't fail the whole operation for database issues
      }

      toast({
        title: "Success! 🎉",
        description: `Contributed ${contributionAmount.toLocaleString()} tokens successfully with billion-scale protection`,
      });
      
      // Reset form
      setAmount('');
      setEstimatedRewards(null);
      
      // Refresh the page data
      setTimeout(() => {
        window.location.reload();
      }, 2000);
      
    } catch (error) {
      // FIXED: Proper error handling
      console.error("❌ Contribution error:", error);
      console.log("🔍 Analyzing transaction error:", error);
      
      // Enhanced error handling for billion-scale specific errors
      let errorMessage = "Failed to contribute. Please try again.";
      const errorStr = (error as Error).message || String(error);
      
      if (errorStr.includes("InsufficientFunds") || errorStr.includes("Custom\":101")) {
        errorMessage = "Insufficient token balance. Please check your token balance and try again.";
      } else if (errorStr.includes("WouldCauseOverflow")) {
        errorMessage = "This contribution would exceed safe limits. Try a smaller amount.";
      } else if (errorStr.includes("TakeoverExpired")) {
        errorMessage = "This takeover has expired and no longer accepts contributions.";
      } else if (errorStr.includes("AlreadyFinalized")) {
        errorMessage = "This takeover has already been finalized.";
      } else if (errorStr.includes("InvalidAmount")) {
        errorMessage = "Invalid contribution amount. Please check the amount and try again.";
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
            This takeover has {isFinalized ? 'been finalized' : 'expired'}
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
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
              <p className="text-sm text-gray-500 dark:text-gray-500">You&apos;ll need {tokenName} tokens in your wallet</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Debug Panel */}
      {showDebug && debugInfo && (
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800 flex items-center justify-between">
              🚨 Transaction Debug Information
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowDebug(false)}
                className="text-red-600 hover:text-red-800"
              >
                ×
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium">Error Type:</span> {debugInfo.errorType}
              </div>
              <div>
                <span className="font-medium">SOL Balance:</span> {debugInfo.solBalance.toFixed(6)} SOL
              </div>
              <div>
                <span className="font-medium">Wallet:</span> {debugInfo.walletStatus.adapter}
              </div>
              <div>
                <span className="font-medium">Connected:</span> {debugInfo.walletStatus.connected ? 'Yes' : 'No'}
              </div>
            </div>
            
            <div className="p-3 bg-red-100 rounded">
              <p className="text-red-800 font-medium">Suggestion:</p>
              <p className="text-red-700 text-sm">{debugInfo.suggestion}</p>
            </div>

            {debugInfo.details.message && (
              <details className="text-xs">
                <summary className="cursor-pointer font-medium text-red-800">Technical Details</summary>
                <pre className="mt-2 bg-red-100 p-2 rounded overflow-auto">
                  {JSON.stringify(debugInfo.details, null, 2)}
                </pre>
              </details>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}