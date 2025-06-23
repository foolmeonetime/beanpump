"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { Token, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';

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
    contributorCount,
    onContribution
  } = props;

  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const { toast } = useToast();

  const [amount, setAmount] = useState("");
  const [contributing, setContributing] = useState(false);
  const [debugMode, setDebugMode] = useState(false);

  // Calculate progress and goals
  const totalContributedRaw = parseInt(totalContributed) || 0;
  const actualGoal = parseFloat(calculatedMinAmount || minAmount) || 0;
  const maxSafe = parseFloat(maxSafeTotalContribution || "0") || actualGoal * 2;
  const remainingSafeSpace = Math.max(0, maxSafe - totalContributedRaw);
  const progressPercent = actualGoal > 0 ? Math.min(100, (totalContributedRaw / actualGoal) * 100) : 0;

  // Format amounts for display
  const formatGoalDisplay = (rawAmount: number): string => {
    const tokens = rawAmount / 1_000_000;
    if (tokens >= 1_000_000_000) return `${(tokens / 1_000_000_000).toFixed(1)}B`;
    if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
    if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`;
    return tokens.toFixed(1);
  };

  // MAIN CONTRIBUTION HANDLER - Fixed for proper transaction structure
 const handleContribute = async () => {
  if (!connected || !publicKey || !sendTransaction) {
    toast({
      title: "Wallet Not Connected",
      description: "Please connect your wallet to contribute.",
      variant: "destructive"
    });
    return;
  }

  if (!amount || parseFloat(amount) <= 0) {
    toast({
      title: "Invalid Amount",
      description: "Please enter a valid contribution amount.",
      variant: "destructive"
    });
    return;
  }

  try {
    setContributing(true);
    
    const contributionAmount = parseFloat(amount);
    const contributionLamports = Math.floor(contributionAmount * 1_000_000);
    
    console.log('🔄 Starting contribution:', {
      amount: contributionAmount,
      lamports: contributionLamports,
      takeover_address: takeoverAddress
    });

    // Environment validation
    if (!process.env.NEXT_PUBLIC_PROGRAM_ID) {
      throw new Error('NEXT_PUBLIC_PROGRAM_ID environment variable not set');
    }

    // Get required PublicKeys
    const takeoverPubkey = new PublicKey(takeoverAddress);
    const v1TokenMintPubkey = new PublicKey(v1TokenMint);
    const vaultPubkey = new PublicKey(vault);
    const programId = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID);

    console.log('🔍 Using Program ID:', programId.toString());
    console.log('🔍 Takeover Address:', takeoverPubkey.toString());
    console.log('🔍 V1 Token Mint:', v1TokenMintPubkey.toString());
    console.log('🔍 Vault:', vaultPubkey.toString());

    // STEP 1: Verify all accounts exist and are valid
    console.log('🔍 Step 1: Verifying account states...');
    
    // Check takeover account
    const takeoverAccountInfo = await connection.getAccountInfo(takeoverPubkey);
    if (!takeoverAccountInfo) {
      throw new Error(`Takeover account does not exist: ${takeoverPubkey.toString()}`);
    }
    console.log('✅ Takeover account exists, owner:', takeoverAccountInfo.owner.toString());
    console.log('📊 Takeover account data length:', takeoverAccountInfo.data.length);
    
    // Check vault account
    const vaultAccountInfo = await connection.getAccountInfo(vaultPubkey);
    if (!vaultAccountInfo) {
      throw new Error(`Vault account does not exist: ${vaultPubkey.toString()}`);
    }
    console.log('✅ Vault account exists, owner:', vaultAccountInfo.owner.toString());
    console.log('📊 Vault account data length:', vaultAccountInfo.data.length);
    
    // Check if program account exists
    const programAccountInfo = await connection.getAccountInfo(programId);
    if (!programAccountInfo) {
      throw new Error(`Program account does not exist: ${programId.toString()}`);
    }
    console.log('✅ Program account exists, executable:', programAccountInfo.executable);

    // Get user's associated token account
    const userTokenAccount = await Token.getAssociatedTokenAddress(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      v1TokenMintPubkey,
      publicKey
    );

    // Get contributor PDA
    const [contributorPDA, contributorBump] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("contributor"),
        takeoverPubkey.toBuffer(),
        publicKey.toBuffer(),
      ],
      programId
    );

    console.log('📋 Account addresses:', {
      userTokenAccount: userTokenAccount.toString(),
      contributorPDA: contributorPDA.toString(),
      contributorBump: contributorBump,
      contributor: publicKey.toString()
    });

    // STEP 2: Check user balance and account state
    console.log('🔍 Step 2: Checking user account state...');
    
    try {
      const balance = await connection.getTokenAccountBalance(userTokenAccount);
      const userBalance = balance.value.uiAmount || 0;
      console.log('💰 User token balance:', userBalance);
      
      if (userBalance < contributionAmount) {
        throw new Error(`Insufficient balance. You have ${userBalance} tokens but need ${contributionAmount}`);
      }
    } catch (balanceError: any) {
      console.error('❌ Balance check failed:', balanceError);
      throw new Error(`Cannot verify token balance: ${balanceError.message || balanceError}`);
    }

    // Check if ATA exists
    const ataAccountInfo = await connection.getAccountInfo(userTokenAccount);
    const ataExists = ataAccountInfo !== null;
    console.log('🔍 ATA exists:', ataExists);
    if (ataAccountInfo) {
      console.log('📊 ATA data length:', ataAccountInfo.data.length);
      console.log('📊 ATA owner:', ataAccountInfo.owner.toString());
    }

    // STEP 3: Check contributor PDA state
    console.log('🔍 Step 3: Checking contributor PDA state...');
    const contributorAccountInfo = await connection.getAccountInfo(contributorPDA);
    if (contributorAccountInfo) {
      console.log('📋 Contributor account exists, data length:', contributorAccountInfo.data.length);
      console.log('📋 Contributor account owner:', contributorAccountInfo.owner.toString());
    } else {
      console.log('📋 Contributor account does not exist (will be created)');
    }

    // STEP 4: Build transaction with enhanced validation
    console.log('🔍 Step 4: Building transaction...');
    const transaction = new Transaction();

    // Add ATA creation if needed
    if (!ataExists) {
      console.log('🔧 Adding ATA creation instruction...');
      const createATAInstruction = new TransactionInstruction({
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },
          { pubkey: userTokenAccount, isSigner: false, isWritable: true },
          { pubkey: publicKey, isSigner: false, isWritable: false },
          { pubkey: v1TokenMintPubkey, isSigner: false, isWritable: false },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
        ],
        programId: ASSOCIATED_TOKEN_PROGRAM_ID,
        data: Buffer.from([])
      });
      transaction.add(createATAInstruction);
    }

    // Create contribution instruction with exact discriminator from IDL
    const instructionData = Buffer.alloc(16);
    const discriminator = [14, 10, 23, 114, 130, 172, 248, 38];
    discriminator.forEach((byte, index) => {
      instructionData.writeUInt8(byte, index);
    });
    instructionData.writeBigUInt64LE(BigInt(contributionLamports), 8);

    console.log('📋 Instruction data:', {
      discriminator: Array.from(discriminator),
      amount: contributionLamports,
      instructionDataHex: instructionData.toString('hex')
    });

    const contributeInstruction = new TransactionInstruction({
      keys: [
        { pubkey: publicKey, isSigner: true, isWritable: true },
        { pubkey: takeoverPubkey, isSigner: false, isWritable: true },
        { pubkey: userTokenAccount, isSigner: false, isWritable: true },
        { pubkey: vaultPubkey, isSigner: false, isWritable: true },
        { pubkey: contributorPDA, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId: programId,
      data: instructionData
    });

    transaction.add(contributeInstruction);

    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = publicKey;

    console.log('📝 Transaction summary:', {
      instructions: transaction.instructions.length,
      feePayer: transaction.feePayer?.toString(),
      recentBlockhash: transaction.recentBlockhash,
      accounts: contributeInstruction.keys.map(k => ({
        pubkey: k.pubkey.toString(),
        signer: k.isSigner,
        writable: k.isWritable
      })),
      programId: programId.toString()
    });

    // STEP 5: Simulate transaction (compatible with older versions)
    console.log('🔍 Step 5: Simulating transaction...');
    try {
      // For older versions of @solana/web3.js, use the simpler signature
      const simulationResult = await connection.simulateTransaction(transaction);
      
      console.log('📊 Simulation result:', simulationResult);
      
      if (simulationResult.value.err) {
        console.error('❌ Simulation failed:', simulationResult.value.err);
        console.error('📋 Simulation logs:', simulationResult.value.logs);
        
        // Extract more meaningful error message
        let errorMessage = 'Unknown simulation error';
        if (simulationResult.value.logs && simulationResult.value.logs.length > 0) {
          const errorLog = simulationResult.value.logs.find(log => 
            log.includes('Error') || log.includes('failed') || log.includes('invalid')
          );
          if (errorLog) {
            errorMessage = errorLog;
          }
        }
        
        throw new Error(`Transaction simulation failed: ${errorMessage}`);
      } else {
        console.log('✅ Simulation successful!');
        console.log('📋 Simulation logs:', simulationResult.value.logs);
        console.log('🔍 Units consumed:', simulationResult.value.unitsConsumed);
      }
    } catch (simError: any) {
      console.error('❌ Simulation error:', simError);
      throw new Error(`Cannot simulate transaction: ${simError.message || simError}`);
    }

    // STEP 6: Send transaction with retries
    console.log('🔍 Step 6: Sending transaction...');
    
    let signature: string;
    let attempt = 0;
    const maxAttempts = 3;
    
    while (attempt < maxAttempts) {
      try {
        console.log(`📤 Attempt ${attempt + 1} of ${maxAttempts}...`);
        
        signature = await sendTransaction(transaction, connection, {
          skipPreflight: false, // We already simulated, so keep preflight
          preflightCommitment: 'processed',
          maxRetries: 1
        });
        
        console.log('✅ Transaction sent successfully:', signature);
        break;
        
      } catch (sendError: any) {
        attempt++;
        console.error(`❌ Send attempt ${attempt} failed:`, sendError);
        
        if (attempt >= maxAttempts) {
          // Final attempt failed
          console.error('❌ All send attempts failed');
          throw new Error(`Transaction failed after ${maxAttempts} attempts: ${sendError.message || sendError}`);
        } else {
          // Wait before retry
          console.log(`⏳ Waiting 2 seconds before retry...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Get fresh blockhash for retry
          const { blockhash: newBlockhash } = await connection.getLatestBlockhash('finalized');
          transaction.recentBlockhash = newBlockhash;
        }
      }
    }

    console.log('✅ Transaction submitted:', signature!);

    // Wait for confirmation
    toast({
      title: "Transaction Submitted",
      description: `Waiting for confirmation... ${signature!.slice(0, 8)}...`,
      variant: "default"
    });

    const confirmation = await connection.confirmTransaction(signature!, 'processed');
    
    if (confirmation.value.err) {
      console.error('❌ Transaction confirmation error:', confirmation.value.err);
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log('✅ Blockchain contribution successful:', signature!);
    
    // Record in database
    try {
      const response = await fetch('/api/contributions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          takeoverId: takeoverAddress,
          amount: contributionLamports.toString(),
          contributor: publicKey.toString(),
          transactionSignature: signature!
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn('❌ Database recording failed:', errorText);
        
        // Try sync fallback
        try {
          const newTotalContributed = totalContributedRaw + contributionLamports;
          await fetch('/api/sync-takeover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              takeoverAddress: takeoverAddress,
              onChainTotalContributed: newTotalContributed.toString(),
              onChainContributorCount: (contributorCount || 0) + 1
            })
          });
          console.log('✅ Database synced successfully');
        } catch (syncError) {
          console.warn('⚠️ Sync also failed:', syncError);
        }
      } else {
        const dbResult = await response.json();
        console.log('✅ Database recording successful:', dbResult);
      }
    } catch (dbError) {
      console.warn('❌ Database error:', dbError);
    }

    toast({
      title: "Success! 🎉",
      description: `Successfully contributed ${amount} tokens to ${tokenName}`,
      variant: "default"
    });

    // Clear form
    setAmount("");
    if (onContribution) {
      onContribution();
    }

  } catch (error: any) {
    console.error('❌ Contribution failed:', error);
    
    let errorMessage = "Failed to contribute";
    if (error && error.message) {
      if (error.message.includes('User rejected') || error.message.includes('User denied')) {
        errorMessage = "Transaction was cancelled by user";
      } else if (error.message.includes('insufficient') || error.message.includes('Insufficient')) {
        errorMessage = error.message;
      } else if (error.message.includes('simulation failed') || error.message.includes('simulate')) {
        errorMessage = `Transaction validation failed: ${error.message}`;
      } else if (error.message.includes('does not exist')) {
        errorMessage = `Account validation failed: ${error.message}`;
      } else {
        errorMessage = error.message;
      }
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

  // Check if takeover is expired
  const now = Math.floor(Date.now() / 1000);
  const isExpired = now >= endTime;
  const canContribute = connected && !isFinalized && !isExpired && remainingSafeSpace > 0;

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Contribute to {tokenName}</CardTitle>
        <CardDescription>
          {isFinalized ? "This takeover is finalized" : 
           isExpired ? "This takeover has expired" :
           "Enter the amount of tokens you want to contribute"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Debug Toggle */}
        {process.env.NODE_ENV === 'development' && (
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="debug"
              checked={debugMode}
              onChange={(e) => setDebugMode(e.target.checked)}
            />
            <label htmlFor="debug" className="text-sm">Debug Mode (Skip Preflight)</label>
          </div>
        )}

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Progress</span>
            <span>{progressPercent.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, progressPercent)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-600">
            <span>Contributed: {formatGoalDisplay(totalContributedRaw)}</span>
            <span>Goal: {formatGoalDisplay(actualGoal)}</span>
          </div>
        </div>

        {/* Contribution Input */}
        {canContribute && (
          <div className="space-y-2">
            <label htmlFor="amount" className="text-sm font-medium">
              Contribution Amount ({tokenName} tokens)
            </label>
            <Input
              id="amount"
              type="number"
              placeholder="Enter token amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={contributing}
              min="0"
              step="0.000001"
            />
            {amount && parseFloat(amount) > 0 && (
              <div className="text-xs text-gray-500">
                ≈ {(parseFloat(amount) * 1_000_000).toLocaleString()} lamports
              </div>
            )}
          </div>
        )}

        {/* Status Messages */}
        {!connected && (
          <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
            <div className="text-sm font-medium text-yellow-800">
              Please connect your wallet to contribute
            </div>
          </div>
        )}

        {isExpired && (
          <div className="bg-red-50 p-3 rounded-lg border border-red-200">
            <div className="text-sm font-medium text-red-800">
              This takeover has expired
            </div>
          </div>
        )}

        {isFinalized && (
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
            <div className="text-sm font-medium text-blue-800">
              This takeover has been finalized
            </div>
          </div>
        )}

        {/* Safe Space Warning */}
        {remainingSafeSpace < actualGoal * 0.1 && remainingSafeSpace > 0 && (
          <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
            <div className="text-sm font-medium text-yellow-800">
              ⚠️ Limited space remaining
            </div>
            <div className="text-xs text-yellow-600">
              Only {formatGoalDisplay(remainingSafeSpace)} tokens of safe contribution space left
            </div>
          </div>
        )}

        {/* Contribute Button */}
        {canContribute && (
          <Button
            onClick={handleContribute}
            disabled={contributing || !amount || parseFloat(amount) <= 0}
            className="w-full"
          >
            {contributing ? (
              <span className="flex items-center">
                <span className="animate-spin mr-2">⏳</span>
                Contributing...
              </span>
            ) : (
              `Contribute ${amount || '0'} Tokens`
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}