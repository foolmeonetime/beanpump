"use client";

import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useToast } from "@/components/ui/use-toast";
import { 
  PublicKey, 
  Transaction, 
  Keypair,
  SystemProgram,
  TransactionInstruction
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

interface FinalizeButtonProps {
  takeoverAddress: string;
  takeoverAuthority: string;
  tokenName: string;
  isGoalMet: boolean;
  isReadyToFinalize: boolean;
  onFinalized?: () => void;
}

// Constants for mint creation
const MINT_SIZE = 82;

export function FinalizeButton({ 
  takeoverAddress, 
  takeoverAuthority, 
  tokenName, 
  isGoalMet, 
  isReadyToFinalize,
  onFinalized 
}: FinalizeButtonProps) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [finalizing, setFinalizing] = useState(false);
  const { toast } = useToast();

  // Check if current user is the authority for this takeover
  const isAuthority = publicKey?.toString() === takeoverAuthority;

  // Don't show button if not ready to finalize or user is not the authority
  if (!isReadyToFinalize || !isAuthority) {
    return null;
  }

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
    const programId = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID!);
    // Updated discriminator for finalize_takeover from new IDL
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

  const handleFinalize = async () => {
    console.log("🔍 BILLION-SCALE FINALIZE DEBUG:");
    console.log("Environment PROGRAM_ID:", process.env.NEXT_PUBLIC_PROGRAM_ID);
    console.log("RPC URL:", process.env.NEXT_PUBLIC_SOLANA_RPC_URL);
    console.log("Takeover address:", takeoverAddress);
    console.log("Is goal met:", isGoalMet);
    console.log("Conservative billion-scale finalization");
    
    if (!process.env.NEXT_PUBLIC_PROGRAM_ID) {
      console.error("❌ NEXT_PUBLIC_PROGRAM_ID is undefined!");
      toast({
        title: "Configuration Error", 
        description: "Program ID not found in environment variables",
        variant: "destructive"
      });
      return;
    }

    if (!publicKey || !signTransaction) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet to finalize.",
        variant: "destructive"
      });
      return;
    }

    try {
      setFinalizing(true);
      
      const programId = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID);
      console.log("🔍 Program ID being used:", programId.toString());
      
      const takeoverPubkey = new PublicKey(takeoverAddress);
      console.log(`🎯 Finalizing billion-scale takeover: ${takeoverAddress} (${isGoalMet ? 'Success' : 'Failed'})`);
      
      let transaction: Transaction;
      let v2MintKeypair: Keypair | null = null;
      let v2TokenMint: string | null = null;
      
      if (isGoalMet) {
        // Create V2 mint for successful billion-scale takeovers
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
      
      console.log('✅ Transaction confirmed, recording billion-scale result in database...');
      
      // Record finalization in database
      const recordResponse = await fetch('/api/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          takeoverAddress,
          authority: publicKey.toString(),
          transactionSignature: signature,
          v2TokenMint,
          isSuccessful: isGoalMet
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
        title: isGoalMet ? "🎉 Billion-Scale Takeover Successful!" : "⏰ Takeover Finalized",
        description: isGoalMet 
          ? `${tokenName} billion-scale takeover finalized! Conservative V2 tokens created for contributors with 2% safety margin.`
          : `${tokenName} takeover finalized. Contributors can claim refunds.`,
        duration: 8000
      });
      
      // Call the onFinalized callback to refresh the parent component
      if (onFinalized) {
        onFinalized();
      }
      
    } catch (error: any) {
      console.error('❌ Billion-scale finalization error:', error);
      toast({
        title: "Finalization Failed",
        description: error.message || 'An error occurred during billion-scale finalization',
        variant: "destructive"
      });
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <Button 
      onClick={handleFinalize}
      disabled={finalizing}
      className={`${
        isGoalMet 
          ? "bg-green-600 hover:bg-green-700" 
          : "bg-yellow-600 hover:bg-yellow-700"
      }`}
    >
      {finalizing ? (
        <div className="flex items-center">
          <LoadingSpinner />
          <span className="ml-2">Finalizing...</span>
        </div>
      ) : (
        <span>
          {isGoalMet ? "🎉 Finalize Billion-Scale Success" : "⏰ Finalize Expired"}
        </span>
      )}
    </Button>
  );
}