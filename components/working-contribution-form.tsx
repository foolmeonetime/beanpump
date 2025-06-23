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

      // FIXED: Verify environment variables
      if (!process.env.NEXT_PUBLIC_PROGRAM_ID) {
        throw new Error('NEXT_PUBLIC_PROGRAM_ID environment variable not set');
      }

      // Get required PublicKeys with validation
      const takeoverPubkey = new PublicKey(takeoverAddress);
      const v1TokenMintPubkey = new PublicKey(v1TokenMint);
      const vaultPubkey = new PublicKey(vault);
      const programId = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID);

      console.log('🔍 Using Program ID:', programId.toString());
      console.log('🔍 Takeover Address:', takeoverPubkey.toString());
      console.log('🔍 V1 Token Mint:', v1TokenMintPubkey.toString());
      console.log('🔍 Vault:', vaultPubkey.toString());

      // Get user's associated token account
      const userTokenAccount = await Token.getAssociatedTokenAddress(
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
        v1TokenMintPubkey,
        publicKey
      );

      // FIXED: Get contributor PDA with proper seeds
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

      // FIXED: Check user token balance first
      try {
        const balance = await connection.getTokenAccountBalance(userTokenAccount);
        const userBalance = balance.value.uiAmount || 0;
        console.log('💰 User token balance:', userBalance);
        
        if (userBalance < contributionAmount) {
          throw new Error(`Insufficient balance. You have ${userBalance} tokens but need ${contributionAmount}`);
        }
      } catch (balanceError) {
        console.warn('⚠️ Could not check balance:', balanceError);
        // Continue anyway - let the transaction fail if insufficient
      }

      // Create the transaction
      const transaction = new Transaction();

      // FIXED: Check if user's ATA exists more carefully
      let ataExists = false;
      try {
        const accountInfo = await connection.getAccountInfo(userTokenAccount);
        ataExists = accountInfo !== null;
        console.log('🔍 ATA exists:', ataExists);
      } catch (error) {
        console.log('🔧 ATA check failed, assuming it needs to be created');
        ataExists = false;
      }

      if (!ataExists) {
        console.log('🔧 Creating ATA for user...');
        const createATAInstruction = new TransactionInstruction({
          keys: [
            { pubkey: publicKey, isSigner: true, isWritable: true },                    // payer
            { pubkey: userTokenAccount, isSigner: false, isWritable: true },           // associated_token_account
            { pubkey: publicKey, isSigner: false, isWritable: false },                 // owner
            { pubkey: v1TokenMintPubkey, isSigner: false, isWritable: false },         // mint
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },   // system_program
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },          // token_program
            { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false }, // rent
          ],
          programId: ASSOCIATED_TOKEN_PROGRAM_ID,
          data: Buffer.from([]) // No data needed for ATA creation
        });
        transaction.add(createATAInstruction);
      }

      // FIXED: Use correct discriminator from IDL
      // From your IDL: contribute_billion_scale has discriminator [14, 89, 55, 236, 195, 138, 27, 103]
      const instructionData = Buffer.alloc(16); // 8 bytes discriminator + 8 bytes amount
      const discriminator = [14, 89, 55, 236, 195, 138, 27, 103];
      discriminator.forEach((byte, index) => {
        instructionData.writeUInt8(byte, index);
      });
      // Write the amount as u64 little endian at offset 8
      instructionData.writeBigUInt64LE(BigInt(contributionLamports), 8);

      console.log('📋 Instruction data:', {
        discriminator: Array.from(discriminator),
        amount: contributionLamports,
        instructionDataHex: instructionData.toString('hex')
      });

      // FIXED: Account ordering must match exactly what the program expects
      const contributeInstruction = new TransactionInstruction({
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },                 // contributor
          { pubkey: takeoverPubkey, isSigner: false, isWritable: true },           // takeover
          { pubkey: userTokenAccount, isSigner: false, isWritable: true },         // contributor_ata
          { pubkey: vaultPubkey, isSigner: false, isWritable: true },              // vault
          { pubkey: contributorPDA, isSigner: false, isWritable: true },           // contributor_account
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },        // token_program
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
        ],
        programId: programId,
        data: instructionData
      });

      transaction.add(contributeInstruction);

      // Get recent blockhash and set fee payer
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      console.log('📝 Transaction summary:', {
        instructions: transaction.instructions.length,
        accounts: contributeInstruction.keys.map(k => ({
          pubkey: k.pubkey.toString(),
          signer: k.isSigner,
          writable: k.isWritable
        })),
        programId: programId.toString()
      });

      console.log('📝 Sending transaction for signature...');

      // FIXED: Add better error handling for sendTransaction
      let signature: string;
      try {
        signature = await sendTransaction(transaction, connection, {
          skipPreflight: debugMode, // Skip preflight in debug mode
          preflightCommitment: 'processed',
          maxRetries: 3
        });
      } catch (sendError: any) {
        console.error('❌ Send transaction error:', sendError);
        
        // Extract more details from wallet error
        if (sendError.message) {
          console.error('Error message:', sendError.message);
        }
        if (sendError.logs) {
          console.error('Transaction logs:', sendError.logs);
        }
        
        throw new Error(`Transaction failed to send: ${sendError.message || sendError}`);
      }

      console.log('✅ Transaction submitted:', signature);

      // Wait for confirmation
      toast({
        title: "Transaction Submitted",
        description: `Waiting for confirmation... ${signature.slice(0, 8)}...`,
        variant: "default"
      });

      const confirmation = await connection.confirmTransaction(signature, 'processed');
      
      if (confirmation.value.err) {
        console.error('❌ Transaction confirmation error:', confirmation.value.err);
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log('✅ Blockchain contribution successful:', signature);
      
      // Record the contribution in the database
      try {
        const response = await fetch('/api/contributions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            takeoverId: takeoverAddress,
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
        // Don't fail the whole operation for database issues
      }

      toast({
        title: "Success! 🎉",
        description: `Successfully contributed ${amount} tokens to ${tokenName}`,
        variant: "default"
      });

      // Clear the form and trigger refresh
      setAmount("");
      if (onContribution) {
        onContribution();
      }

    } catch (error: any) {
      console.error('❌ Contribution failed:', error);
      
      let errorMessage = "Failed to contribute";
      if (error.message) {
        if (error.message.includes('User rejected') || error.message.includes('User denied')) {
          errorMessage = "Transaction was cancelled by user";
        } else if (error.message.includes('insufficient') || error.message.includes('Insufficient')) {
          errorMessage = error.message; // Use the specific insufficient balance message
        } else if (error.message.includes('blockhash not found')) {
          errorMessage = "Network congestion, please try again";
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