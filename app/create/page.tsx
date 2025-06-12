"use client";

import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { PublicKey, Keypair, Transaction, TransactionInstruction, SystemProgram } from "@solana/web3.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { LoadingSpinner } from "@/components/loading-spinner";
import { PROGRAM_ID, TREASURY_ADDRESS } from "@/lib/constants";

// Fixed function to create initialize_billion_scale instruction (matches deployed IDL exactly)
function createInitializeBillionScaleInstruction(
  programId: PublicKey,
  authority: PublicKey,
  treasury: PublicKey,
  v1TokenMint: PublicKey,
  takeover: PublicKey,
  vault: PublicKey,
  duration: bigint,
  rewardRateBp: number,
  targetParticipationBp: number,
  v1MarketPriceLamports: bigint
): TransactionInstruction {
  // Exact discriminator from deployed IDL
  const discriminator = Buffer.from([10, 1, 51, 248, 146, 123, 209, 48]);
  
  // Serialize parameters exactly as in IDL args
  const durationBuffer = Buffer.alloc(8);
  durationBuffer.writeBigInt64LE(duration, 0);
  
  const rewardRateBpBuffer = Buffer.alloc(2);
  rewardRateBpBuffer.writeUInt16LE(rewardRateBp, 0);
  
  const targetParticipationBpBuffer = Buffer.alloc(2);
  targetParticipationBpBuffer.writeUInt16LE(targetParticipationBp, 0);
  
  const v1MarketPriceBuffer = Buffer.alloc(8);
  v1MarketPriceBuffer.writeBigUInt64LE(v1MarketPriceLamports, 0);
  
  const data = Buffer.concat([
    discriminator,
    durationBuffer,
    rewardRateBpBuffer,
    targetParticipationBpBuffer,
    v1MarketPriceBuffer
  ]);

  // Account order EXACTLY as specified in deployed IDL
  const keys = [
    { pubkey: authority, isSigner: true, isWritable: true },                                    // authority
    { pubkey: treasury, isSigner: false, isWritable: true },                                   // treasury  
    { pubkey: v1TokenMint, isSigner: false, isWritable: false },                              // v1_token_mint
    { pubkey: takeover, isSigner: false, isWritable: true },                                  // takeover
    { pubkey: vault, isSigner: true, isWritable: true },                                      // vault
    { pubkey: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), isSigner: false, isWritable: false }, // token_program
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },                  // system_program
    { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },   // rent
  ];

  return new TransactionInstruction({
    keys,
    programId,
    data,
  });
}

export default function CreatePage() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    v1TokenMint: "",
    duration: "7",
    rewardRateBp: "125",
    targetParticipationBp: "3000",
    v1MarketPriceLamports: "1000000",
    tokenName: "",
    imageUrl: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!publicKey) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet to create a takeover",
        variant: "destructive"
      });
      return;
    }

    try {
      console.log("🚀 Starting billion-scale takeover creation with UPDATED IDL...");
      
      setLoading(true);
      
      // Check wallet balance
      const balance = await connection.getBalance(publicKey);
      console.log("💰 Wallet balance:", balance / 1_000_000_000, "SOL");
      
      if (balance < 10_000_000) { // 0.01 SOL minimum
        throw new Error(`Insufficient SOL balance. You have ${balance / 1_000_000_000} SOL, but need at least 0.01 SOL for transaction fees and account creation.`);
      }
      
      // Parse form data
      const v1Mint = new PublicKey(formData.v1TokenMint);
      const duration = BigInt(Number(formData.duration) * 86400); // days to seconds
      const rewardRateBp = Number(formData.rewardRateBp);
      const targetParticipationBp = Number(formData.targetParticipationBp);
      const v1MarketPriceLamports = BigInt(formData.v1MarketPriceLamports);
      
      console.log("📊 Billion-scale form data parsed:");
      console.log("   V1 Mint:", v1Mint.toString());
      console.log("   Duration:", duration.toString(), "seconds");
      console.log("   Reward Rate:", rewardRateBp, "bp (", rewardRateBp/100, "x)");
      console.log("   Target Participation:", targetParticipationBp, "bp (", targetParticipationBp/100, "%)");
      console.log("   V1 Market Price:", v1MarketPriceLamports.toString(), "lamports");
      
      // Validate parameters
      if (rewardRateBp < 100 || rewardRateBp > 200) {
        throw new Error("Reward rate must be between 100 (1.0x) and 200 (2.0x) basis points");
      }
      if (targetParticipationBp < 100 || targetParticipationBp > 10000) {
        throw new Error("Target participation must be between 100 (1%) and 10000 (100%) basis points");
      }
      
      // Find takeover PDA (exactly as in IDL)
      const [takeoverPDA, bump] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("takeover"),
          publicKey.toBuffer(),
          v1Mint.toBuffer()
        ],
        new PublicKey(PROGRAM_ID)
      );
      
      console.log("🎯 Takeover PDA:", takeoverPDA.toString(), "bump:", bump);
      
      // Create vault keypair (must be signer as per IDL)
      const vault = Keypair.generate();
      console.log("🏦 Vault created:", vault.publicKey.toString());
      
      // Use treasury address from constants
      const treasuryAddress = new PublicKey(TREASURY_ADDRESS);
      console.log("🏛️ Treasury address:", treasuryAddress.toString());
      
      // Validate V1 token mint
      console.log("✅ Validating V1 token mint...");
      let mintInfo;
      try {
        mintInfo = await connection.getParsedAccountInfo(v1Mint);
        if (!mintInfo.value || !('parsed' in mintInfo.value.data)) {
          throw new Error("V1 token mint not found or invalid");
        }
        
        const mintData = mintInfo.value.data.parsed.info;
        const supply = BigInt(mintData.supply);
        const decimals = mintData.decimals;
        
        console.log("   Supply:", supply.toString());
        console.log("   Decimals:", decimals);
        
        // Check billion-scale supply constraints
        const minSupply = BigInt(1_000_000) * BigInt(10 ** decimals); // 1M tokens
        const maxSupply = BigInt(10_000_000_000) * BigInt(10 ** decimals); // 10B tokens
        
        if (supply < minSupply) {
          throw new Error(`Token supply too small: ${supply} < ${minSupply} (minimum 1M tokens)`);
        }
        if (supply > maxSupply) {
          throw new Error(`Token supply too large: ${supply} > ${maxSupply} (maximum 10B tokens)`);
        }
        
        console.log("   ✅ Token validation passed");
      } catch (error: any) {
        throw new Error(`V1 token validation failed: ${error.message}`);
      }
      
      // Create the initialize_billion_scale instruction (FIXED with correct IDL)
      console.log("⚙️ Creating initialize_billion_scale instruction...");
      const initializeIx = createInitializeBillionScaleInstruction(
        new PublicKey(PROGRAM_ID),
        publicKey,
        treasuryAddress,
        v1Mint,
        takeoverPDA,
        vault.publicKey,
        duration,
        rewardRateBp,
        targetParticipationBp,
        v1MarketPriceLamports
      );
      
      console.log("📦 Instruction created successfully");
      
      // Build transaction
      const transaction = new Transaction();
      transaction.add(initializeIx);
      
      // Get recent blockhash and set fee payer
      console.log("🔗 Getting recent blockhash...");
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      // Sign with vault keypair (required by IDL)
      transaction.partialSign(vault);
      
      console.log("✍️ Transaction built and vault signed");
      
      // Send transaction
      console.log("📡 Sending transaction...");
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: false,  // Enable preflight to catch errors early
        preflightCommitment: "confirmed",
        maxRetries: 3
      });
      
      console.log("📝 Transaction sent, signature:", signature);
      
      // Confirm transaction
      console.log("⏳ Confirming transaction...");
      try {
        const confirmation = await connection.confirmTransaction(signature, "confirmed");
        
        if (confirmation.value.err) {
          console.error("❌ Transaction failed on-chain:", confirmation.value.err);
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }
        
        console.log("✅ Transaction confirmed successfully!");
      } catch (confirmError: any) {
        console.error("⚠️ Confirmation error:", confirmError);
        
        // Try to get transaction details for debugging
        try {
          const txDetails = await connection.getTransaction(signature, {
            commitment: "confirmed",
            maxSupportedTransactionVersion: 0
          });
          console.error("📋 Transaction details:", txDetails);
          
          if (txDetails?.meta?.err) {
            throw new Error(`On-chain error: ${JSON.stringify(txDetails.meta.err)}`);
          }
        } catch (detailError) {
          console.error("❌ Could not fetch transaction details:", detailError);
        }
        
        throw confirmError;
      }
      
      console.log("🎉 Billion-scale takeover created successfully!");
      
      // Save to database
      console.log("💾 Saving to database...");
      const startTime = Math.floor(Date.now() / 1000);
      const endTime = startTime + Number(duration);
      
      const dbPayload = {
        address: takeoverPDA.toString(),
        authority: publicKey.toString(),
        v1TokenMint: v1Mint.toString(),
        vault: vault.publicKey.toString(),
        
        // Billion-scale specific fields
        rewardRateBp,
        targetParticipationBp,
        v1MarketPriceLamports: v1MarketPriceLamports.toString(),
        
        // Legacy compatibility fields
        customRewardRate: rewardRateBp / 100,
        startTime: startTime.toString(),
        endTime: endTime.toString(),
        minAmount: "0", // Will be calculated by program
        
        // Metadata
        tokenName: formData.tokenName,
        imageUrl: formData.imageUrl,
        
        // Transaction info
        signature,
        created_at: new Date().toISOString(),
      };
      
      const dbResponse = await fetch('/api/takeovers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dbPayload)
      });
      
      if (!dbResponse.ok) {
        console.warn("⚠️ Database save failed, but takeover was created on-chain");
      } else {
        console.log("✅ Saved to database successfully");
      }
      
      toast({
        title: "🚀 Billion-Scale Takeover Created!",
        description: `Conservative takeover initialized with ${rewardRateBp/100}x reward rate and billion-scale safety features`,
        duration: 8000
      });
      
      // Reset form
      setFormData({
        v1TokenMint: "",
        duration: "7",
        rewardRateBp: "125",
        targetParticipationBp: "3000", 
        v1MarketPriceLamports: "1000000",
        tokenName: "",
        imageUrl: ""
      });
      
    } catch (error: any) {
      console.error("💥 Billion-scale creation failed:");
      console.error("Error message:", error.message);
      
      toast({
        title: "Creation Failed",
        description: error.message || "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (!publicKey) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <h1 className="text-2xl font-bold">Create Takeover Campaign</h1>
        <p className="text-muted-foreground">Connect your wallet to create a new community takeover</p>
        <WalletMultiButton />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>🚀 Create Billion-Scale Community Takeover</CardTitle>
          <CardDescription>
            Initialize a conservative takeover campaign with billion-scale safety features and overflow protection
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* V1 Token Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Token Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="v1TokenMint">V1 Token Mint Address *</Label>
                  <Input
                    id="v1TokenMint"
                    value={formData.v1TokenMint}
                    onChange={(e) => setFormData(prev => ({ ...prev, v1TokenMint: e.target.value }))}
                    placeholder="Token mint address"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tokenName">Token Name</Label>
                  <Input
                    id="tokenName"
                    value={formData.tokenName}
                    onChange={(e) => setFormData(prev => ({ ...prev, tokenName: e.target.value }))}
                    placeholder="My Awesome Token"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="imageUrl">Token Image URL (optional)</Label>
                <Input
                  id="imageUrl"
                  value={formData.imageUrl}
                  onChange={(e) => setFormData(prev => ({ ...prev, imageUrl: e.target.value }))}
                  placeholder="https://example.com/token-image.png"
                />
              </div>
            </div>

            {/* Campaign Parameters */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Campaign Parameters</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="duration">Duration (days) *</Label>
                  <Input
                    id="duration"
                    type="number"
                    min="1"
                    max="30"
                    value={formData.duration}
                    onChange={(e) => setFormData(prev => ({ ...prev, duration: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rewardRateBp">Reward Rate (basis points) *</Label>
                  <Input
                    id="rewardRateBp"
                    type="number"
                    min="100"
                    max="200"
                    value={formData.rewardRateBp}
                    onChange={(e) => setFormData(prev => ({ ...prev, rewardRateBp: e.target.value }))}
                    required
                  />
                  <p className="text-xs text-gray-500">
                    100 = 1.0x, 125 = 1.25x, 150 = 1.5x, 200 = 2.0x (max)
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="targetParticipationBp">Target Participation (basis points) *</Label>
                  <Input
                    id="targetParticipationBp"
                    type="number"
                    min="100"
                    max="10000"
                    value={formData.targetParticipationBp}
                    onChange={(e) => setFormData(prev => ({ ...prev, targetParticipationBp: e.target.value }))}
                    required
                  />
                  <p className="text-xs text-gray-500">
                    100 = 1%, 1000 = 10%, 3000 = 30%, 10000 = 100%
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="v1MarketPriceLamports">V1 Token Price (lamports) *</Label>
                  <Input
                    id="v1MarketPriceLamports"
                    type="number"
                    min="1"
                    value={formData.v1MarketPriceLamports}
                    onChange={(e) => setFormData(prev => ({ ...prev, v1MarketPriceLamports: e.target.value }))}
                    required
                  />
                  <p className="text-xs text-gray-500">
                    1000000 = 0.001 SOL per token
                  </p>
                </div>
              </div>
            </div>

            {/* Safety Information */}
            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">🛡️ Conservative Safety Features</h4>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                <li>• Maximum reward rate capped at 2.0x for sustainability</li>
                <li>• Conservative billion-scale token economics</li>
                <li>• Proportionate minimum amount calculation</li>
                <li>• Target participation controls campaign scope</li>
                <li>• Automatic refunds if campaign fails</li>
              </ul>
            </div>

            <Button 
              type="submit" 
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <LoadingSpinner />
                  Creating Billion-Scale Takeover...
                </>
              ) : (
                "🚀 Create Conservative Takeover"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}