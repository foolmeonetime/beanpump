// hooks/use-manual-finalize.ts
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

interface FinalizableTakeover {
  id: number;
  address: string;
  authority: string;
  tokenName: string;
  totalContributed: string;
  minAmount: string;
  endTime: string;
  contributorCount: number;
  customRewardRate: number;
  readyToFinalize: boolean;
  isGoalMet: boolean;
  expectedOutcome: 'success' | 'failed' | 'active';
  progressPercentage: number;
}

// Constants for mint creation (compatible with older SPL token)
const MINT_SIZE = 82;

export function useManualFinalize() {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [loading, setLoading] = useState(false);
  const [finalizing, setFinalizing] = useState<string | null>(null);
  const { toast } = useToast();

  // Helper to create V2 mint
  const createV2TokenMint = async (
    mintKeypair: Keypair,
    authority: PublicKey,
    decimals: number = 6
  ) => {
    const rentExemptBalance = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
    
    // Create account instruction
    const createAccountIx = SystemProgram.createAccount({
      fromPubkey: authority,
      newAccountPubkey: mintKeypair.publicKey,
      space: MINT_SIZE,
      lamports: rentExemptBalance,
      programId: TOKEN_PROGRAM_ID,
    });

    // Initialize mint instruction data
    const initializeMintData = Buffer.alloc(67);
    initializeMintData.writeUInt8(0, 0); // Initialize mint instruction discriminator
    initializeMintData.writeUInt8(decimals, 1); // Decimals
    authority.toBuffer().copy(initializeMintData, 2); // Mint authority
    initializeMintData.writeUInt8(1, 34); // COption::Some for freeze authority
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

  // Helper to create finalize instruction
  const createFinalizeInstruction = (
    takeover: PublicKey,
    authority: PublicKey,
    v2Mint: PublicKey
  ) => {
    const programId = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID!);
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

  // Fetch takeovers ready for finalization by current user
  const fetchFinalizableTakeovers = useCallback(async (): Promise<FinalizableTakeover[]> => {
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

  // Finalize a specific takeover
  const finalizeTakeover = useCallback(async (takeover: FinalizableTakeover) => {
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
      
      console.log(`🎯 Finalizing takeover: ${takeover.address} (${isSuccessful ? 'Success' : 'Failed'})`);
      
      let transaction: Transaction;
      let v2MintKeypair: Keypair | null = null;
      let v2TokenMint: string | null = null;
      
      if (isSuccessful) {
        // Create V2 mint for successful takeovers
        console.log('💎 Creating V2 mint for successful takeover...');
        
        v2MintKeypair = Keypair.generate();
        v2TokenMint = v2MintKeypair.publicKey.toBase58();
        
        const [createAccountIx, initializeMintIx] = await createV2TokenMint(
          v2MintKeypair,
          publicKey,
          6
        );
        
        const finalizeIx = createFinalizeInstruction(
          takeoverPubkey,
          publicKey,
          v2MintKeypair.publicKey
        );
        
        transaction = new Transaction().add(createAccountIx, initializeMintIx, finalizeIx);
        
      } else {
        // For failed takeovers, use a dummy mint (the authority's pubkey)
        console.log('❌ Finalizing failed takeover...');
        
        const finalizeIx = createFinalizeInstruction(
          takeoverPubkey,
          publicKey,
          publicKey // Use authority as dummy v2_mint
        );
        
        transaction = new Transaction().add(finalizeIx);
      }
      
      // Set transaction details
      transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      transaction.feePayer = publicKey;
      
      // Sign transaction
      console.log('🔐 Signing transaction...');
      const signedTransaction = await signTransaction(transaction);
      
      // Add v2 mint signature if needed
      if (v2MintKeypair) {
        signedTransaction.partialSign(v2MintKeypair);
      }
      
      // Send transaction
      console.log('📤 Sending finalization transaction...');
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      
      // Wait for confirmation
      console.log('⏳ Waiting for confirmation...', signature);
      await connection.confirmTransaction(signature, 'confirmed');
      
      console.log('✅ Transaction confirmed, recording in database...');
      
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
        title: isSuccessful ? "🎉 Takeover Successful!" : "⏰ Takeover Finalized",
        description: isSuccessful 
          ? `${takeover.tokenName} takeover finalized! V2 tokens created for contributors.`
          : `${takeover.tokenName} takeover finalized. Contributors can claim refunds.`,
        duration: 8000
      });
      
      return true;
      
    } catch (error: any) {
      console.error('❌ Finalization error:', error);
      toast({
        title: "Finalization Failed",
        description: error.message || 'An error occurred during finalization',
        variant: "destructive"
      });
      return false;
    } finally {
      setFinalizing(null);
    }
  }, [publicKey, signTransaction, connection, toast]);

  return {
    loading,
    finalizing,
    fetchFinalizableTakeovers,
    finalizeTakeover
  };
}