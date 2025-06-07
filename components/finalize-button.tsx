// components/finalize-button.tsx - Fixed version with PDA for V2 mint
"use client";

import { useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useToast } from "@/components/ui/use-toast";
import { 
  PublicKey, 
  Transaction, 
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

  // Function to derive V2 mint PDA (this should match your Rust program logic)
  const findV2MintPDA = (takeover: PublicKey, programId: PublicKey): PublicKey => {
    const [pda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("v2_mint"),
        takeover.toBuffer()
      ],
      programId
    );
    return pda;
  };

  const createFinalizeInstruction = (
    takeover: PublicKey, 
    authority: PublicKey, 
    v2Mint: PublicKey, 
    programId: PublicKey
  ) => {
    const discriminator = Buffer.from([237, 226, 215, 181, 203, 65, 244, 223]);
    
    return new TransactionInstruction({
      keys: [
        { pubkey: takeover, isSigner: false, isWritable: true },
        { pubkey: authority, isSigner: true, isWritable: true },
        { pubkey: v2Mint, isSigner: false, isWritable: true }, // Changed to NOT signer since it's a PDA
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false },
        { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
      ],
      programId,
      data: discriminator,
    });
  };

  const handleFinalize = async () => {
    console.log("🔍 FINALIZE DEBUG:");
    console.log("Environment PROGRAM_ID:", process.env.NEXT_PUBLIC_PROGRAM_ID);
    console.log("Takeover address:", takeoverAddress);
    console.log("Is goal met:", isGoalMet);
    
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
      const takeoverPubkey = new PublicKey(takeoverAddress);
      
      console.log(`🎯 Finalizing takeover: ${takeoverAddress} (${isGoalMet ? 'Success' : 'Failed'})`);
      
      let v2TokenMint: string;
      
      if (isGoalMet) {
        // For successful takeovers, derive V2 mint PDA
        console.log('💎 Deriving V2 mint PDA for successful takeover...');
        const v2MintPDA = findV2MintPDA(takeoverPubkey, programId);
        v2TokenMint = v2MintPDA.toBase58();
        
        console.log('📍 V2 Mint PDA:', v2TokenMint);
        
        // Create finalize instruction with PDA
        const finalizeIx = createFinalizeInstruction(
          takeoverPubkey, 
          publicKey, 
          v2MintPDA, 
          programId
        );
        
        const transaction = new Transaction().add(finalizeIx);
        transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        transaction.feePayer = publicKey;
        
        // Sign transaction (no need to sign with V2 mint since it's a PDA)
        console.log('🔐 Signing transaction...');
        const signedTransaction = await signTransaction(transaction);
        
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
            takeoverAddress,
            authority: publicKey.toString(),
            transactionSignature: signature,
            v2TokenMint,
            isSuccessful: true
          })
        });
        
        if (!recordResponse.ok) {
          throw new Error('Failed to record finalization in database');
        }
        
        const recordData = await recordResponse.json();
        
        if (!recordData.success) {
          throw new Error(recordData.error);
        }
        
      } else {
        // For failed takeovers, use authority as v2_mint (dummy value)
        console.log('❌ Finalizing failed takeover...');
        v2TokenMint = publicKey.toString(); // Using authority as dummy
        
        const finalizeIx = createFinalizeInstruction(
          takeoverPubkey, 
          publicKey, 
          publicKey, // Use authority as dummy v2_mint for failed takeovers
          programId
        );
        
        const transaction = new Transaction().add(finalizeIx);
        transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        transaction.feePayer = publicKey;
        
        // Sign and send transaction
        const signedTransaction = await signTransaction(transaction);
        const signature = await connection.sendRawTransaction(signedTransaction.serialize());
        await connection.confirmTransaction(signature, 'confirmed');
        
        // Record in database
        const recordResponse = await fetch('/api/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            takeoverAddress,
            authority: publicKey.toString(),
            transactionSignature: signature,
            v2TokenMint: null, // No V2 mint for failed takeovers
            isSuccessful: false
          })
        });
        
        if (!recordResponse.ok) {
          throw new Error('Failed to record finalization in database');
        }
      }
      
      toast({
        title: isGoalMet ? "🎉 Takeover Successful!" : "⏰ Takeover Finalized",
        description: isGoalMet 
          ? `${tokenName} takeover finalized! V2 tokens created for contributors.`
          : `${tokenName} takeover finalized. Contributors can claim refunds.`,
        duration: 8000
      });
      
      // Call the onFinalized callback to refresh the parent component
      if (onFinalized) {
        onFinalized();
      }
      
    } catch (error: any) {
      console.error('❌ Finalization error:', error);
      toast({
        title: "Finalization Failed",
        description: error.message || 'An error occurred during finalization',
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
          {isGoalMet ? "🎉 Finalize Success" : "⏰ Finalize Expired"}
        </span>
      )}
    </Button>
  );
}