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
import { Checkbox } from "@/components/ui/checkbox";

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

// Enhanced token supply formatting
const formatTokenSupply = (supply: string | number): string => {
  const num = typeof supply === 'string' ? parseFloat(supply) : supply;
  if (isNaN(num)) return "0";
  
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1)}B`;
  } else if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  } else if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toLocaleString();
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

// Enhanced supply validation
const validateTokenSupply = (supply: string): string | null => {
  const supplyNum = parseFloat(supply);
  
  if (isNaN(supplyNum) || supplyNum <= 0) {
    return "Supply must be greater than 0";
  }
  
  if (supplyNum < 1_000_000) {
    return "Supply must be at least 1M tokens for billion-scale operations";
  }
  
  if (supplyNum > 1_000_000_000_000) {
    return "Supply seems too large - please verify";
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
    { pubkey: authority, isSigner: true, isWritable: true },
    { pubkey: treasury, isSigner: false, isWritable: true },
    { pubkey: v1TokenMint, isSigner: false, isWritable: false },
    { pubkey: takeover, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: true, isWritable: true },
    { pubkey: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
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
  const [detectingToken, setDetectingToken] = useState(false);
  
  // Enhanced form data with supply management
  const [formData, setFormData] = useState({
    v1TokenMint: "",
    duration: "7",
    rewardRateBp: "125",
    targetParticipationBp: "3000",
    v1TokenPriceSol: "0.001",
    tokenName: "",
    imageUrl: "",
    // NEW: Supply management fields
    totalSupplyTokens: "",
    autoDetectedSupply: "",
    autoDetectedDecimals: 6,
    useAutoDetected: true
  });

  // Calculate goal preview
  const calculateGoalPreview = () => {
    const supply = formData.useAutoDetected 
      ? parseFloat(formData.autoDetectedSupply || "0")
      : parseFloat(formData.totalSupplyTokens || "0");
    const targetPercent = parseInt(formData.targetParticipationBp || "0") / 100;
    const goalTokens = supply * targetPercent / 100;
    
    if (goalTokens > 0) {
      return {
        supply,
        goalTokens,
        goalFormatted: formatTokenSupply(goalTokens),
        supplyFormatted: formatTokenSupply(supply),
        targetPercent: targetPercent.toFixed(1)
      };
    }
    return null;
  };

  // Enhanced token validation with auto-detection
  const validateAndDetectToken = async (mintAddress: string) => {
    if (!mintAddress || mintAddress.length < 32) {
      return;
    }

    setDetectingToken(true);
    
    try {
      const mintPubkey = new PublicKey(mintAddress);
      const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
      
      if (!mintInfo.value || !mintInfo.value.data || !('parsed' in mintInfo.value.data)) {
        throw new Error("Invalid token mint - account not found or not a token mint");
      }
      
      const parsed = mintInfo.value.data.parsed;
      if (!parsed.info) {
        throw new Error("Invalid token mint - missing mint info");
      }
      
      // Calculate actual circulating supply
      const rawSupply = parsed.info.supply;
      const decimals = parsed.info.decimals;
      const actualSupply = parseFloat(rawSupply) / Math.pow(10, decimals);
      
      console.log("🔍 Token Detection Results:");
      console.log("   Raw Supply:", rawSupply);
      console.log("   Decimals:", decimals);
      console.log("   Actual Supply:", actualSupply.toLocaleString(), "tokens");
      console.log("   Mint Authority:", parsed.info.mintAuthority);
      
      setFormData(prev => ({
        ...prev,
        autoDetectedSupply: actualSupply.toString(),
        autoDetectedDecimals: decimals,
        // Auto-fill manual supply if not set
        totalSupplyTokens: prev.totalSupplyTokens || actualSupply.toString()
      }));
      
      toast({
        title: "✅ Token Detected Successfully",
        description: `Found ${formatTokenSupply(actualSupply)} tokens with ${decimals} decimals`,
        duration: 4000
      });
      
    } catch (error: any) {
      console.error("Token detection failed:", error);
      setFormData(prev => ({
        ...prev,
        autoDetectedSupply: "",
        autoDetectedDecimals: 6
      }));
      
      toast({
        title: "❌ Token Detection Failed",
        description: error.message || "Please verify the mint address is correct",
        variant: "destructive",
        duration: 5000
      });
    } finally {
      setDetectingToken(false);
    }
  };

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
      console.log("🚀 Starting enhanced billion-scale takeover creation...");
      
      setLoading(true);
      
      // Validate total supply
      const finalTotalSupply = formData.useAutoDetected 
        ? formData.autoDetectedSupply 
        : formData.totalSupplyTokens;

      if (!finalTotalSupply || parseFloat(finalTotalSupply) <= 0) {
        throw new Error("Please provide a valid total supply");
      }

      const supplyError = validateTokenSupply(finalTotalSupply);
      if (supplyError) {
        throw new Error(supplyError);
      }
      
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
      
      // ENHANCED: Calculate correct token amounts
      const actualV1TotalSupply = parseFloat(finalTotalSupply);
      const targetParticipationDecimal = targetParticipationBp / 10000;
      const calculatedTokenTarget = Math.floor(actualV1TotalSupply * targetParticipationDecimal);
      const decimals = formData.useAutoDetected ? formData.autoDetectedDecimals : 6;
      
      console.log("📊 Enhanced billion-scale form data:");
      console.log("   V1 Mint:", v1Mint.toString());
      console.log("   Duration:", duration.toString(), "days (", Number(duration) * 86400, "seconds)");
      console.log("   Reward Rate:", rewardRateBp, "bp (", rewardRateBp/100, "x)");
      console.log("   Target Participation:", targetParticipationBp, "bp (", targetParticipationDecimal * 100, "%)");
      console.log("   V1 Market Price:", formData.v1TokenPriceSol, "SOL =", v1MarketPriceLamports, "lamports");
      console.log("🎯 CORRECTED Supply Calculations:");
      console.log("   Actual V1 Total Supply:", actualV1TotalSupply.toLocaleString(), "tokens");
      console.log("   Token Decimals:", decimals);
      console.log("   Calculated Token Target:", calculatedTokenTarget.toLocaleString(), "tokens");
      console.log("   Goal Display:", formatTokenSupply(calculatedTokenTarget));
      
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
        
        console.log("📊 V1 token info verification:");
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
      
      console.log("📡 Sending enhanced billion-scale takeover creation transaction...");
      
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
      
      console.log("🎉 Enhanced billion-scale takeover created successfully!");
      
      // Store in database with enhanced payload
      try {
        console.log("💾 Storing enhanced takeover in database...");
        
        // Calculate startTime and endTime from duration
        const startTime = Math.floor(Date.now() / 1000);
        const endTime = startTime + (Number(duration) * 24 * 60 * 60);
        
        // ENHANCED: Prepare payload with corrected calculations
        const rawV1Supply = Math.floor(actualV1TotalSupply * Math.pow(10, decimals));
        const rawTokenTarget = Math.floor(calculatedTokenTarget * Math.pow(10, decimals));
        const rawRewardPool = Math.floor(actualV1TotalSupply * Math.pow(10, decimals) * 0.80);
        const rawLiquidityPool = Math.floor(actualV1TotalSupply * Math.pow(10, decimals) * 0.20);
        const rawMaxSafe = Math.floor((rawRewardPool * 0.98) / (rewardRateBp / 10000));
        
        const payload = {
          // Required fields with correct names
          address: takeoverPDA.toString(),
          authority: publicKey.toString(),
          v1_token_mint: v1Mint.toString(),
          vault: vault.publicKey.toString(),
          
          // Time fields
          start_time: startTime.toString(),
          end_time: endTime.toString(),
          
          // ENHANCED: Corrected supply calculations
          v1_total_supply: rawV1Supply.toString(),
          token_amount_target: rawTokenTarget.toString(),
          v2_total_supply: rawV1Supply.toString(),
          
          // Numeric fields
          reward_rate_bp: parseInt(formData.rewardRateBp),
          target_participation_bp: parseInt(formData.targetParticipationBp),
          
          // Amount fields
          v1_market_price_lamports: v1MarketPriceLamports.toString(),
          min_amount: "1000000", // Default minimum amount
          
          // ENHANCED: Billion-scale calculations
          reward_pool_tokens: rawRewardPool.toString(),
          liquidity_pool_tokens: rawLiquidityPool.toString(),
          max_safe_total_contribution: rawMaxSafe.toString(),
          
          // Optional fields
          token_name: formData.tokenName || '',
          image_url: formData.imageUrl && formData.imageUrl.trim() ? formData.imageUrl : undefined,
          
          // Additional fields
          custom_reward_rate: rewardRateBp / 100,
          signature: signature || '',
          sol_for_liquidity: "0"
        };

        // Validation
        const required = ['address', 'authority', 'v1_token_mint', 'vault'] as const;
        const missing = required.filter(field => !payload[field as keyof typeof payload]);
        
        if (missing.length > 0) {
          throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }
        
        console.log("📝 Enhanced database payload:", JSON.stringify(payload, null, 2));
        
        const dbResponse = await fetch('/api/takeovers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        console.log("📊 Database response status:", dbResponse.status);
        
        if (!dbResponse.ok) {
          const errorText = await dbResponse.text();
          console.error("❌ Database storage failed:", errorText);
          
          let errorDetails;
          try {
            errorDetails = JSON.parse(errorText);
            console.error("📋 Validation details:", errorDetails.error?.details);
          } catch {
            errorDetails = { message: errorText };
          }
          
          toast({
            title: "⚠️ Partial Success",
            description: `Takeover created on blockchain but database storage failed. Transaction: ${signature}`,
            variant: "destructive",
            duration: 10000
          });
        } else {
          const successResponse = await dbResponse.json();
          console.log("✅ Enhanced database response:", successResponse);
          
          toast({
            title: "🎉 Enhanced Takeover Created!",
            description: `Billion-scale takeover created successfully! Goal: ${formatTokenSupply(calculatedTokenTarget)} tokens. Transaction: ${signature}`,
            duration: 8000
          });
        }
        
      } catch (dbError) {
        console.error("💥 Database storage failed:", dbError);
        
        toast({
          title: "⚠️ Partial Success",
          description: `Takeover created on blockchain but database error occurred. Transaction: ${signature}`,
          variant: "destructive",
          duration: 10000
        });
      }
      
      // Reset form on success
      setFormData({
        v1TokenMint: "",
        duration: "7",
        rewardRateBp: "125",
        targetParticipationBp: "3000",
        v1TokenPriceSol: "0.001",
        tokenName: "",
        imageUrl: "",
        totalSupplyTokens: "",
        autoDetectedSupply: "",
        autoDetectedDecimals: 6,
        useAutoDetected: true
      });

    } catch (error: any) {
      console.error("💥 Enhanced takeover creation failed:", error);
      
      toast({
        title: "❌ Creation Failed",
        description: error.message || "Unknown error occurred",
        variant: "destructive",
        duration: 8000
      });
    } finally {
      setLoading(false);
    }
  };

  if (!publicKey) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <h1 className="text-2xl font-bold">Create Enhanced Takeover Campaign</h1>
        <p className="text-muted-foreground">Connect your wallet to create a new billion-scale community takeover</p>
        <WalletMultiButton />
      </div>
    );
  }

  const goalPreview = calculateGoalPreview();

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>🚀 Create Enhanced Billion-Scale Takeover</CardTitle>
          <CardDescription>
            Initialize a precise takeover campaign with enhanced supply detection and billion-scale safety features
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Enhanced V1 Token Section */}
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
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, v1TokenMint: e.target.value }));
                      // Auto-detect on change with debounce
                      if (e.target.value.length >= 32) {
                        setTimeout(() => validateAndDetectToken(e.target.value), 800);
                      }
                    }}
                    placeholder="Enter V1 token mint address"
                    required
                  />
                  {detectingToken && (
                    <p className="text-xs text-blue-600 flex items-center">
                      <LoadingSpinner size="sm" className="mr-1" />
                      Detecting token...
                    </p>
                  )}
                  {formData.autoDetectedSupply && !detectingToken && (
                    <p className="text-xs text-green-600">
                      ✅ Auto-detected: {formatTokenSupply(formData.autoDetectedSupply)} tokens ({formData.autoDetectedDecimals} decimals)
                    </p>
                  )}
                </div>
              </div>

              {/* Enhanced Total Supply Configuration */}
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Total Supply Configuration</h4>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="useAutoDetected"
                      checked={formData.useAutoDetected}
                      onCheckedChange={(checked) => setFormData(prev => ({ 
                        ...prev, 
                        useAutoDetected: checked as boolean
                      }))}
                    />
                    <Label htmlFor="useAutoDetected" className="text-sm">Use auto-detected</Label>
                  </div>
                </div>
                
                {formData.useAutoDetected ? (
                  <div className="space-y-2">
                    <Label>Auto-Detected Total Supply</Label>
                    <div className={`p-3 border rounded ${
                      formData.autoDetectedSupply 
                        ? 'bg-green-50 dark:bg-green-900 border-green-200 dark:border-green-700' 
                        : 'bg-yellow-50 dark:bg-yellow-900 border-yellow-200 dark:border-yellow-700'
                    }`}>
                      {formData.autoDetectedSupply ? (
                        <>
                          <p className="text-green-800 dark:text-green-200 font-medium">
                            {formatTokenSupply(formData.autoDetectedSupply)} tokens
                          </p>
                          <p className="text-green-600 dark:text-green-400 text-sm mt-1">
                            Raw value: {parseFloat(formData.autoDetectedSupply).toLocaleString()} tokens
                          </p>
                          <p className="text-green-600 dark:text-green-400 text-sm">
                            Decimals: {formData.autoDetectedDecimals}
                          </p>
                        </>
                      ) : (
                        <p className="text-yellow-800 dark:text-yellow-200">
                          Enter mint address above to auto-detect supply
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label htmlFor="totalSupplyTokens">Manual Total Supply (actual tokens) *</Label>
                    <Input
                      id="totalSupplyTokens"
                      type="number"
                      value={formData.totalSupplyTokens}
                      onChange={(e) => setFormData(prev => ({ ...prev, totalSupplyTokens: e.target.value }))}
                      placeholder="e.g., 1000000000 (1 billion)"
                      min="1000000"
                      step="1000000"
                      required={!formData.useAutoDetected}
                    />
                    <p className="text-xs text-gray-500">
                      Enter the actual circulating supply (e.g., 1,000,000,000 for 1 billion tokens)
                    </p>
                    {formData.totalSupplyTokens && validateTokenSupply(formData.totalSupplyTokens) && (
                      <p className="text-xs text-red-500">
                        {validateTokenSupply(formData.totalSupplyTokens)}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Enhanced Goal Preview */}
              {goalPreview && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg">
                  <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">📊 Campaign Goal Preview</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-blue-700 dark:text-blue-300">Total Supply</p>
                      <p className="font-semibold text-blue-900 dark:text-blue-100">
                        {goalPreview.supplyFormatted} tokens
                      </p>
                    </div>
                    <div>
                      <p className="text-blue-700 dark:text-blue-300">Target Participation</p>
                      <p className="font-semibold text-blue-900 dark:text-blue-100">
                        {goalPreview.targetPercent}%
                      </p>
                    </div>
                    <div>
                      <p className="text-blue-700 dark:text-blue-300">Campaign Goal</p>
                      <p className="font-semibold text-blue-900 dark:text-blue-100">
                        {goalPreview.goalFormatted} tokens
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-blue-600 dark:text-blue-400">
                    This will be the target amount contributors need to reach for campaign success
                  </div>
                </div>
              )}

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
                  
                  {validateSolPrice(formData.v1TokenPriceSol) && (
                    <p className="text-xs text-red-500">
                      {validateSolPrice(formData.v1TokenPriceSol)}
                    </p>
                  )}
                  
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

            {/* Enhanced Safety Information */}
            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">🛡️ Enhanced Billion-Scale Safety Features</h4>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                <li>• ✅ Accurate supply detection with manual override capability</li>
                <li>• ✅ Real-time goal calculation and preview</li>
                <li>• ✅ Maximum reward rate capped at 2.0x for sustainability</li>
                <li>• ✅ Proportionate minimum amount calculation based on actual supply</li>
                <li>• ✅ Target participation controls campaign scope precisely</li>
                <li>• ✅ Automatic refunds if campaign fails</li>
                <li>• ✅ Built-in 2% safety cushion prevents overflow</li>
              </ul>
            </div>

            <Button 
              type="submit" 
              disabled={
                loading || 
                !!validateSolPrice(formData.v1TokenPriceSol) ||
                (!formData.useAutoDetected && !!validateTokenSupply(formData.totalSupplyTokens)) ||
                (formData.useAutoDetected && !formData.autoDetectedSupply)
              }
              className="w-full"
            >
              {loading ? (
                <>
                  <LoadingSpinner />
                  Creating Enhanced Takeover...
                </>
              ) : (
                "🚀 Create Enhanced Billion-Scale Takeover"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}