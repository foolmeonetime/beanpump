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
import { ImageUpload } from "@/components/image-upload";
import { PROGRAM_ID, TREASURY_ADDRESS } from "@/lib/constants";

// Helper functions for SOL <-> Lamports conversion
const solToLamports = (solAmount: string): string => {
  if (!solAmount || isNaN(parseFloat(solAmount))) {
    return "0";
  }
  const lamports = parseFloat(solAmount) * 1_000_000_000; // 1 SOL = 1B lamports
  return Math.floor(lamports).toString();
};

const lamportsToSol = (lamports: string): string => {
  if (!lamports || isNaN(parseFloat(lamports))) {
    return "0";
  }
  const sol = parseFloat(lamports) / 1_000_000_000;
  return sol.toString();
};

// Price validation helper
const validateSolPrice = (solPrice: string): string | null => {
  const price = parseFloat(solPrice);
  
  if (isNaN(price) || price <= 0) {
    return "Price must be greater than 0";
  }
  
  if (price < 0.000000001) {
    return "Price too small (minimum 0.000000001 SOL)";
  }
  
  if (price > 1000) {
    return "Price too large (maximum 1000 SOL)";
  }
  
  return null; // Valid
};

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
  const { publicKey, sendTransaction, signTransaction } = useWallet();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    v1TokenMint: "",
    duration: "7",
    rewardRateBp: "125",
    targetParticipationBp: "3000",
    v1TokenPriceSol: "0.001", // Changed from v1MarketPriceLamports to SOL
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
      
      // Convert SOL to lamports for the smart contract
      const v1MarketPriceLamports = solToLamports(formData.v1TokenPriceSol);
      
      // Validate price
      const priceError = validateSolPrice(formData.v1TokenPriceSol);
      if (priceError) {
        throw new Error(priceError);
      }
      
      if (parseFloat(v1MarketPriceLamports) < 1) {
        throw new Error("Price must be at least 1 lamport (0.000000001 SOL)");
      }
      
      // Parse form data
      const v1Mint = new PublicKey(formData.v1TokenMint);
      const duration = BigInt(Number(formData.duration));
      const rewardRateBp = Number(formData.rewardRateBp);
      const targetParticipationBp = Number(formData.targetParticipationBp);
      const v1MarketPriceLamportsBigInt = BigInt(v1MarketPriceLamports);
      
      console.log("📊 Billion-scale form data parsed:");
      console.log("   V1 Mint:", v1Mint.toString());
      console.log("   Duration:", duration.toString(), "days (", Number(duration) * 86400, "seconds)");
      console.log("   Reward Rate:", rewardRateBp, "bp (", rewardRateBp/100, "x)");
      console.log("   Target Participation:", targetParticipationBp, "bp (", targetParticipationBp/100, "%)");
      console.log("   V1 Market Price:", formData.v1TokenPriceSol, "SOL =", v1MarketPriceLamports, "lamports");
      
      // Validate parameters
      if (rewardRateBp < 100 || rewardRateBp > 200) {
        throw new Error("Reward rate must be between 100 (1.0x) and 200 (2.0x) basis points");
      }
      if (targetParticipationBp < 100 || targetParticipationBp > 10000) {
        throw new Error("Target participation must be between 100 (1%) and 10000 (100%) basis points");
      }
      if (Number(duration) < 1 || Number(duration) > 30) {
        throw new Error("Duration must be between 1 and 30 days");
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
        if (!mintInfo.value || !mintInfo.value.data || !('parsed' in mintInfo.value.data)) {
          throw new Error("Invalid V1 token mint - account not found or not a token mint");
        }
        
        const parsed = mintInfo.value.data.parsed;
        if (!parsed.info) {
          throw new Error("Invalid V1 token mint - missing mint info");
        }
        
        console.log("📊 V1 token info:");
        console.log("   Supply:", parsed.info.supply);
        console.log("   Decimals:", parsed.info.decimals);
        console.log("   Mint Authority:", parsed.info.mintAuthority);
        
      } catch (mintError) {
        console.error("❌ V1 mint validation failed:", mintError);
        throw new Error(`Invalid V1 token mint: ${mintError instanceof Error ? mintError.message : 'Unknown error'}`);
      }
      
      // Create the instruction
      const instruction = createInitializeBillionScaleInstruction(
        new PublicKey(PROGRAM_ID),
        publicKey,
        treasuryAddress,
        v1Mint,
        takeoverPDA,
        vault.publicKey,
        duration,
        rewardRateBp,
        targetParticipationBp,
        v1MarketPriceLamportsBigInt
      );
      
      // Build and send transaction
      const transaction = new Transaction().add(instruction);
      
      // Get recent blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      // Vault must sign the transaction
      transaction.partialSign(vault);
      
      console.log("📡 Sending billion-scale takeover creation transaction...");
      
      // Send transaction
      const signature = await sendTransaction(transaction, connection, {
        signers: [vault]
      });
      
      console.log("✅ Transaction sent:", signature);
      
      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${confirmation.value.err}`);
      }
      
      console.log("🎉 Billion-scale takeover created successfully!");
      
      // Store in database
      try {
        console.log("💾 Storing takeover in database...");
        
        const dbResponse = await fetch('/api/takeovers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address: takeoverPDA.toString(),
            authority: publicKey.toString(),
            v1TokenMint: v1Mint.toString(),
            vault: vault.publicKey.toString(),
            duration: Number(duration),
            rewardRateBp,
            targetParticipationBp,
            v1MarketPriceLamports: v1MarketPriceLamports,
            tokenName: formData.tokenName,
            imageUrl: formData.imageUrl,
            signature: signature
          })
        });
        
        if (!dbResponse.ok) {
          console.warn("⚠️ Database storage failed, but takeover was created on-chain");
        } else {
          console.log("✅ Takeover stored in database");
        }
        
      } catch (dbError) {
        console.warn("⚠️ Database error (takeover still created):", dbError);
      }
      
      toast({
        title: "🎉 Billion-Scale Takeover Created!",
        description: `Conservative takeover initialized with ${rewardRateBp/100}x reward rate and billion-scale safety features`,
        duration: 8000
      });
      
      // Reset form
      setFormData({
        v1TokenMint: "",
        duration: "7",
        rewardRateBp: "125",
        targetParticipationBp: "3000", 
        v1TokenPriceSol: "0.001", // Reset to SOL
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
              <h3 className="text-lg font-semibold">V1 Token Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tokenName">Token Name *</Label>
                  <Input
                    id="tokenName"
                    value={formData.tokenName}
                    onChange={(e) => setFormData(prev => ({ ...prev, tokenName: e.target.value }))}
                    placeholder="e.g., My Token"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="v1TokenMint">V1 Token Mint Address *</Label>
                  <Input
                    id="v1TokenMint"
                    value={formData.v1TokenMint}
                    onChange={(e) => setFormData(prev => ({ ...prev, v1TokenMint: e.target.value }))}
                    placeholder="Enter V1 token mint address"
                    required
                  />
                </div>
              </div>

              {/* Image Upload */}
              <div className="space-y-2">
                <Label>Token Image (Optional)</Label>
                <ImageUpload
                  onImageUploaded={(imageUrl) => setFormData(prev => ({ ...prev, imageUrl }))}
                  currentImageUrl={formData.imageUrl}
                  label="Token Image"
                />
              </div>
            </div>

            {/* Campaign Parameters */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Campaign Parameters</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="duration">Duration (Days) *</Label>
                  <Input
                    id="duration"
                    type="number"
                    min="1"
                    max="30"
                    value={formData.duration}
                    onChange={(e) => setFormData(prev => ({ ...prev, duration: e.target.value }))}
                    required
                  />
                  <p className="text-xs text-gray-500">1-30 days maximum</p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="rewardRateBp">Reward Rate (Basis Points) *</Label>
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
                    {(parseInt(formData.rewardRateBp || "100") / 100).toFixed(1)}x reward rate (1.0x - 2.0x for safety)
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="targetParticipationBp">Target Participation (Basis Points) *</Label>
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
                    {(parseInt(formData.targetParticipationBp || "100") / 100).toFixed(1)}% participation target
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="v1TokenPriceSol">V1 Token Price (SOL per token) *</Label>
                  <div className="relative">
                    <Input
                      id="v1TokenPriceSol"
                      type="number"
                      step="0.000000001"
                      min="0.000000001"
                      max="1000"
                      value={formData.v1TokenPriceSol}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        v1TokenPriceSol: e.target.value 
                      }))}
                      placeholder="0.001"
                      className={validateSolPrice(formData.v1TokenPriceSol) ? "border-red-300" : ""}
                      required
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <span className="text-gray-400 text-sm">SOL</span>
                    </div>
                  </div>
                  
                  {/* Validation Error */}
                  {validateSolPrice(formData.v1TokenPriceSol) && (
                    <p className="text-xs text-red-500">
                      {validateSolPrice(formData.v1TokenPriceSol)}
                    </p>
                  )}
                  
                  {/* Helper Text */}
                  <div className="text-xs text-gray-500 space-y-1">
                    <p>💡 Common values: 0.001 SOL, 0.0001 SOL, 0.00001 SOL</p>
                    <p>📊 Equivalent: {formData.v1TokenPriceSol} SOL = {
                      parseFloat(formData.v1TokenPriceSol || "0") > 0 ? 
                        `${(parseFloat(formData.v1TokenPriceSol) * 1_000_000_000).toLocaleString()} lamports` : 
                        "0 lamports"
                    }</p>
                  </div>
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
                <li>• Built-in 2% safety cushion prevents overflow</li>
              </ul>
            </div>

            <Button 
              type="submit" 
              disabled={loading || !!validateSolPrice(formData.v1TokenPriceSol)}
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