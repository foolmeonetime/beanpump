// components/finalize-button.tsx - Improved version with better error handling
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
      
      let transaction: Transaction;
      let v2MintKeypair: Keypair | null = null;
      let v2TokenMint: string | null = null;
      
      if (isGoalMet) {
        // Create V2 mint for successful takeovers
        console.log('💎 Generating V2 mint keypair for successful takeover...');
        
        v2MintKeypair = Keypair.generate();
        v2TokenMint = v2MintKeypair.publicKey.toBase58();
        console.log('📍 Generated V2 Mint:', v2TokenMint);
        console.log('⚠️  Note: Rust program will create the mint account internally');
        
        // For successful takeovers, just call finalize - the Rust program handles mint creation
        const finalizeIx = createFinalizeInstruction(takeoverPubkey, publicKey, v2MintKeypair.publicKey);
        transaction = new Transaction().add(finalizeIx);
        
      } else {
        // For failed takeovers, use authority as dummy v2_mint
        console.log('❌ Finalizing failed takeover...');
        
        const finalizeIx = createFinalizeInstruction(takeoverPubkey, publicKey, publicKey);
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
      
      // 🔥 IMPROVED: Better payload construction and error handling
      const payload = {
        takeoverAddress: takeoverAddress,
        authority: publicKey.toString(),
        transactionSignature: signature,
        isSuccessful: isGoalMet,
        ...(v2TokenMint && { v2TokenMint }) // Only include v2TokenMint if it exists
      };
      
      console.log('📤 Sending payload to database:', payload);
      
      // Record finalization in database
      const recordResponse = await fetch('/api/finalize', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      console.log('🔍 Database response status:', recordResponse.status);
      console.log('🔍 Database response headers:', Object.fromEntries(recordResponse.headers.entries()));
      
      // Get response text first to see what we're dealing with
      const responseText = await recordResponse.text();
      console.log('🔍 Raw response:', responseText);
      
      if (!recordResponse.ok) {
        let errorMessage = `HTTP ${recordResponse.status}`;
        
        try {
          const errorData = JSON.parse(responseText);
          errorMessage = errorData.error || errorData.message || errorMessage;
          console.error('🔍 Parsed error data:', errorData);
        } catch (parseError) {
          console.error('🔍 Failed to parse error response:', parseError);
          errorMessage = `${errorMessage}: ${responseText}`;
        }
        
        throw new Error(`Database API error: ${errorMessage}`);
      }
      
      let recordData;
      try {
        recordData = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error(`Invalid JSON response from database: ${responseText}`);
      }
      
      if (!recordData.success) {
        throw new Error(recordData.error || 'Database operation failed');
      }
      
      console.log('✅ Successfully recorded in database:', recordData);
      
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
      
      // Provide more specific error messages
      let errorMessage = error.message || 'An error occurred during finalization';
      
      if (error.message?.includes('Database API error')) {
        errorMessage = error.message;
      } else if (error.message?.includes('Transaction failed')) {
        errorMessage = 'Blockchain transaction failed: ' + error.message;
      } else if (error.message?.includes('Invalid JSON')) {
        errorMessage = 'Database communication error: ' + error.message;
      }
      
      toast({
        title: "Finalization Failed",
        description: errorMessage,
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