// hooks/use-billion-scale-finalize.ts
"use client";

import { useState, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { 
  PublicKey, 
  Transaction, 
  Keypair,
  SystemProgram,
  TransactionInstruction
} from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { useToast } from '@/components/ui/use-toast';

interface FinalizableBillionScaleTakeover {
  id: number;
  address: string;
  authority: string;
  tokenName: string;
  totalContributed: string;
  calculatedMinAmount?: string;
  minAmount: string;
  maxSafeTotalContribution: string;
  endTime: string;
  contributorCount: number;
  rewardRateBp?: number;
  customRewardRate: number;
  targetParticipationBp: number;
  participationRateBp: number;
  readyToFinalize: boolean;
  isGoalMet: boolean;
  expectedOutcome: 'success' | 'failed' | 'active';
  progressPercentage: number;
  safetyUtilization?: number;
  v1SupplyBillions?: number;
}

// Constants for mint creation
const MINT_SIZE = 82;

export function useBillionScaleFinalize() {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [loading, setLoading] = useState(false);
  const [finalizing, setFinalizing] = useState<string | null>(null);
  const { toast } = useToast();

  const createV2TokenMint = async (mintKeypair: Keypair, authority: PublicKey) => {
    const rentExemptBalance = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
    
    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: authority,
      newAccountPubkey: mintKeypair.publicKey,
      space: MINT_SIZE,
      lamports: rentExemptBalance,
      programId: TOKEN_PROGRAM_ID,
    });

    const initializeMintData = Buffer.alloc(67);
    initializeMintData.writeUInt8(0, 0); // Initialize mint instruction
    initializeMintData.writeUInt8(6, 1); // 6 decimals
    authority.toBuffer().copy(initializeMintData, 2); // Mint authority
    initializeMintData.writeUInt8(1, 34); // Has freeze authority
    authority.toBuffer().copy(initializeMintData, 35); // Freeze authority

    const initializeMintIx = new TransactionInstruction({
      keys: [
        { pubkey: mintKeypair.publicKey, isSigner: false, isWritable: true },
        { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
      ],
      programId: TOKEN_PROGRAM_ID,
      data: initializeMintData,
    });

    return [createAccountIx, initializeMintIx];
  };

  const createFinalizeInstruction = (takeover: PublicKey, authority: PublicKey, v2Mint: PublicKey) => {
    const programId = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID || "CJxUrvjAXL2PR2bK8vANxLJiWWRXbyaFvzzF9cMgYmfJ");
    const discriminator = Buffer.from([237, 226, 215, 181, 203, 65, 244, 223]);
    
    return new TransactionInstruction({
      keys: [
        { pubkey: takeover, isSigner: false, isWritable: true },
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: v2Mint, isSigner: true, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
      ],
      programId,
      data: discriminator,
    });
  };

  const fetchFinalizableTakeovers = useCallback(async (): Promise<FinalizableBillionScaleTakeover[]> => {
    if (!publicKey) return [];

    try {
      setLoading(true);
      
      const response = await fetch(`/api/finalize?authority=${publicKey.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch finalizable takeovers');
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error);
      }
      
      return data.takeovers || [];
      
    } catch (error: any) {
      console.error('Error fetching finalizable takeovers:', error);
      toast({
        title: "Error Loading Takeovers",
        description: error.message,
        variant: "destructive"
      });
      return [];
    } finally {
      setLoading(false);
    }
  }, [publicKey, toast]);

  const finalizeBillionScaleTakeover = useCallback(async (takeover: FinalizableBillionScaleTakeover): Promise<boolean> => {
    if (!publicKey || !signTransaction) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet to finalize.",
        variant: "destructive"
      });
      return false;
    }

    // Check if this user is the authority for this takeover
    if (takeover.authority !== publicKey.toString()) {
      toast({
        title: "Not Authorized",
        description: "You can only finalize takeovers you created.",
        variant: "destructive"
      });
      return false;
    }

    try {
      setFinalizing(takeover.address);
      
      const takeoverPubkey = new PublicKey(takeover.address);
      const isSuccessful = takeover.isGoalMet;
      
      console.log(`🎯 Finalizing billion-scale takeover: ${takeover.address} (${isSuccessful ? 'Success' : 'Failed'})`);
      
      let transaction: Transaction;
      let v2MintKeypair: Keypair | null = null;
      let v2TokenMint: string | null = null;
      
      if (isSuccessful) {
        // Create V2 mint for successful takeovers
        console.log('💎 Creating V2 mint for successful billion-scale takeover...');
        
        v2MintKeypair = Keypair.generate();
        v2TokenMint = v2MintKeypair.publicKey.toBase58();
        
        const [createAccountIx, initializeMintIx] = await createV2TokenMint(v2MintKeypair, publicKey);
        const finalizeIx = createFinalizeInstruction(takeoverPubkey, publicKey, v2MintKeypair.publicKey);
        
        transaction = new Transaction().add(createAccountIx, initializeMintIx, finalizeIx);
        
      } else {
        // For failed takeovers, use authority as dummy v2_mint
        console.log('❌ Finalizing failed billion-scale takeover...');
        
        const finalizeIx = createFinalizeInstruction(takeoverPubkey, publicKey, publicKey);
        transaction = new Transaction().add(finalizeIx);
      }
      
      // Set transaction details
      transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      transaction.feePayer = publicKey;
      
      // Sign transaction
      console.log('🔐 Signing billion-scale transaction...');
      const signedTransaction = await signTransaction(transaction);
      
      // Add v2 mint signature if needed
      if (v2MintKeypair) {
        signedTransaction.partialSign(v2MintKeypair);
      }
      
      // Send transaction
      console.log('📤 Sending billion-scale finalization transaction...');
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      
      // Wait for confirmation
      console.log('⏳ Waiting for confirmation...', signature);
      await connection.confirmTransaction(signature, 'confirmed');
      
      console.log('✅ Billion-scale transaction confirmed, recording in database...');
      
      // Record finalization in database
      const recordResponse = await fetch('/api/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          takeoverAddress: takeover.address,
          authority: publicKey.toString(),
          transactionSignature: signature,
          v2TokenMint,
          isSuccessful
        })
      });
      
      if (!recordResponse.ok) {
        throw new Error('Failed to record finalization in database');
      }
      
      const recordData = await recordResponse.json();
      
      if (!recordData.success) {
        throw new Error(recordData.error);
      }
      
      toast({
        title: isSuccessful ? "🎉 Billion-Scale Takeover Successful!" : "⏰ Billion-Scale Takeover Finalized",
        description: isSuccessful 
          ? `${takeover.tokenName} billion-scale takeover finalized with conservative safety features! V2 tokens created for contributors.`
          : `${takeover.tokenName} billion-scale takeover finalized. Contributors can claim refunds with safety protections.`,
        duration: 8000
      });
      
      return true;
      
    } catch (error: any) {
      console.error('❌ Billion-scale finalization error:', error);
      toast({
        title: "Billion-Scale Finalization Failed",
        description: error.message || 'An error occurred during billion-scale finalization',
        variant: "destructive"
      });
      return false;
    } finally {
      setFinalizing(null);
    }
  }, [publicKey, signTransaction, connection, toast]);

  const batchFinalizeTakeovers = useCallback(async (takeovers: FinalizableBillionScaleTakeover[]): Promise<void> => {
    toast({
      title: "Batch Finalization",
      description: "Enhanced batch finalization for billion-scale takeovers is coming soon! For now, please finalize individually.",
      duration: 6000
    });
  }, [toast]);

  const getBillionScaleStatus = useCallback((takeover: FinalizableBillionScaleTakeover) => {
    const rewardRate = takeover.rewardRateBp ? takeover.rewardRateBp / 100 : takeover.customRewardRate;
    return {
      rewardRateMultiplier: rewardRate / 100,
      participationPercentage: (takeover.safetyUtilization || 0),
      overflowRiskLevel: (takeover.safetyUtilization || 0) < 80 ? 'Low' : 'Medium'
    };
  }, []);

  return {
    loading,
    finalizing,
    fetchFinalizableTakeovers,
    finalizeBillionScaleTakeover,
    batchFinalizeTakeovers,
    getBillionScaleStatus
  };
}