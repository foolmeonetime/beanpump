// app/create/page.tsx - Fixed version with proper treasury handling
"use client";
import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { 
  PublicKey, 
  Transaction, 
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Keypair
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { LoadingSpinner } from "@/components/loading-spinner";
import { PROGRAM_ID } from "@/lib/constants";
import { ImageUpload } from "@/components/image-upload";

// 🔥 UPDATED: Treasury address resolver
class TreasuryResolver {
  static getTreasuryAddress(): PublicKey {
    // Option 1: Use environment variable if set
    if (process.env.NEXT_PUBLIC_TREASURY_ADDRESS) {
      console.log('✅ Using treasury from env:', process.env.NEXT_PUBLIC_TREASURY_ADDRESS);
      return new PublicKey(process.env.NEXT_PUBLIC_TREASURY_ADDRESS);
    }
    
    // Option 2: Use known treasury addresses for different environments
    const knownTreasuries = {
      // Add known treasury addresses here - these would be from your program deployment
      devnet: "11111111111111111111111111111111", // Replace with actual devnet treasury
      mainnet: "11111111111111111111111111111111", // Replace with actual mainnet treasury
    };
    
    // Option 3: Derive treasury PDA if it's program-derived
    try {
      const [treasuryPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("treasury")],
        new PublicKey(PROGRAM_ID)
      );
      console.log('✅ Using derived treasury PDA:', treasuryPDA.toString());
      return treasuryPDA;
    } catch (error) {
      console.error('❌ Failed to derive treasury PDA:', error);
    }
    
    // Option 4: Fallback to a default (this might fail)
    console.warn('⚠️ Using fallback treasury - this might cause InvalidTreasury error');
    return new PublicKey("11111111111111111111111111111111");
  }
}

// Function to create initialize instruction manually
function createInitializeInstruction(
  programId: PublicKey,
  authority: PublicKey,
  treasury: PublicKey,
  v1TokenMint: PublicKey,
  takeover: PublicKey,
  vault: PublicKey,
  minAmount: bigint,
  duration: bigint,
  customRewardRate: number
): TransactionInstruction {
  // Create instruction data buffer
  // This is the discriminator for "initialize" method from your IDL
  const discriminator = Buffer.from([175, 175, 109, 31, 13, 152, 155, 237]);
  
  // Serialize the parameters
  const minAmountBuffer = Buffer.alloc(8);
  minAmountBuffer.writeBigUInt64LE(minAmount, 0);
  
  const durationBuffer = Buffer.alloc(8);
  durationBuffer.writeBigInt64LE(duration, 0);
  
  const rewardRateBuffer = Buffer.alloc(8);
  const view = new DataView(rewardRateBuffer.buffer);
  view.setFloat64(0, customRewardRate, true); // little endian
  
  const data = Buffer.concat([
    discriminator,
    minAmountBuffer,
    durationBuffer,
    rewardRateBuffer
  ]);

  const keys = [
    { pubkey: authority, isSigner: true, isWritable: true },
    { pubkey: treasury, isSigner: false, isWritable: true }, // 🔥 FIXED: Use proper treasury
    { pubkey: v1TokenMint, isSigner: false, isWritable: false },
    { pubkey: takeover, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: true, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId,
    data,
  });
}

export default function CreateTakeover() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    v1TokenMint: "So11111111111111111111111111111111111111112",
    minAmount: "1000",
    duration: "7",
    customRewardRate: "1.0",
    tokenName: "Test Token",
    imageUrl: ""
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey) {
      toast({
        title: "Wallet Error",
        description: "Please connect your wallet",
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);
      console.log("1. Starting takeover creation...");
      
      // Check wallet balance
      const balance = await connection.getBalance(publicKey);
      console.log("1.1. Wallet balance:", balance / 1_000_000_000, "SOL");
      
      if (balance < 10_000_000) { // Less than 0.01 SOL
        throw new Error(`Insufficient SOL balance. You have ${balance / 1_000_000_000} SOL, but need at least 0.01 SOL for transaction fees and account creation.`);
      }
      
      // Parse form data
      const v1Mint = new PublicKey(formData.v1TokenMint);
      const minAmount = BigInt(Number(formData.minAmount) * 1_000_000); // 6 decimals
      const duration = BigInt(Number(formData.duration) * 86400); // days to seconds
      const rewardRate = Number(formData.customRewardRate);
      
      console.log("2. Form data parsed:");
      console.log("   V1 Mint:", v1Mint.toString());
      console.log("   Min Amount:", minAmount.toString());
      console.log("   Duration:", duration.toString());
      console.log("   Reward Rate:", rewardRate);
      
      // 🔥 UPDATED: Get the correct treasury address
      const treasury = TreasuryResolver.getTreasuryAddress();
      console.log("2.1. Treasury address:", treasury.toString());
      
      // Find takeover PDA
      const [takeoverPDA, bump] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("takeover"),
          publicKey.toBuffer(),
          v1Mint.toBuffer()
        ],
        new PublicKey(PROGRAM_ID)
      );
      
      console.log("3. Takeover PDA found:", takeoverPDA.toString(), "bump:", bump);
      
      // Create vault keypair
      const vault = Keypair.generate();
      console.log("4. Vault created:", vault.publicKey.toString());
      
      // Calculate start and end times
      const startTime = Math.floor(Date.now() / 1000); // Current timestamp
      const endTime = startTime + Number(duration);
      
      console.log("5. Time calculations:");
      console.log("   Start time:", startTime);
      console.log("   End time:", endTime);
      console.log("   Duration (seconds):", Number(duration));
      
      // 🔥 UPDATED: Create the initialize instruction with proper treasury
      const initializeIx = createInitializeInstruction(
        new PublicKey(PROGRAM_ID),
        publicKey,        // authority (signer)
        treasury,         // treasury (from resolver)
        v1Mint,          // v1 token mint
        takeoverPDA,     // takeover PDA
        vault.publicKey, // vault (signer)
        minAmount,
        duration,
        rewardRate
      );
      
      console.log("6. Initialize instruction created with treasury:", treasury.toString());
      
      // Create and send transaction with legacy format
      const transaction = new Transaction();
      transaction.add(initializeIx);
      
      // Set recent blockhash and fee payer
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      // Sign with vault keypair
      transaction.partialSign(vault);
      
      console.log("7. Transaction built and signed by vault");
      
      // 🔥 IMPROVED: Simulate first to catch errors early
      try {
        console.log("7.1. Simulating transaction...");
        const simulation = await connection.simulateTransaction(transaction);
        
        if (simulation.value.err) {
          console.error("7.2. Simulation failed:", simulation.value.err);
          console.error("7.3. Simulation logs:", simulation.value.logs);
          
          // Parse the error for better user feedback
          const errorStr = JSON.stringify(simulation.value.err);
          if (errorStr.includes('"Custom":6013')) {
            throw new Error(`Invalid treasury address. Expected treasury: Please check your program configuration. Current treasury: ${treasury.toString()}`);
          } else {
            throw new Error(`Transaction simulation failed: ${errorStr}`);
          }
        }
        
        console.log("7.4. Simulation successful:", simulation.value.logs);
      } catch (simError: any) {
        console.error("7.5. Simulation error:", simError);
        throw simError;
      }
      
      // Send transaction
      console.log("8. Sending transaction...");
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
        maxRetries: 3
      });
      
      console.log("9. Transaction sent, signature:", signature);
      
      // Wait for confirmation
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      }, "confirmed");
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      console.log("10. Transaction confirmed! Now saving to database...");
      
      // Save to database after successful blockchain transaction
      try {
        const dbResponse = await fetch('/api/takeovers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            address: takeoverPDA.toString(),
            authority: publicKey.toString(),
            v1TokenMint: v1Mint.toString(),
            vault: vault.publicKey.toString(),
            minAmount: minAmount.toString(),
            startTime: startTime.toString(),
            endTime: endTime.toString(),
            customRewardRate: rewardRate,
            tokenName: formData.tokenName,
            imageUrl: formData.imageUrl
          })
        });

        if (!dbResponse.ok) {
          const errorData = await dbResponse.json();
          throw new Error(`Database save failed: ${errorData.error || 'Unknown error'}`);
        }

        const dbResult = await dbResponse.json();
        console.log("11. Successfully saved to database:", dbResult);
        
      } catch (dbError) {
        console.error("Database save error:", dbError);
        // Don't fail the entire operation for database errors
        // The blockchain transaction succeeded, which is most important
        toast({
          title: "Partial Success",
          description: "Takeover created on blockchain but failed to save to database. Check console for details.",
          variant: "destructive"
        });
      }
      
      toast({
        title: "Takeover Created Successfully! 🎉",
        description: `View on Solscan: https://solscan.io/tx/${signature}?cluster=devnet`,
        duration: 10000
      });

      // Reset form
      setFormData({
        v1TokenMint: "So11111111111111111111111111111111111111112",
        minAmount: "1000",
        duration: "7",
        customRewardRate: "1.0",
        tokenName: "Test Token",
        imageUrl: ""
      });

    } catch (error: any) {
      console.error("Creation failed:");
      console.error("Error:", error);
      console.error("Error message:", error.message);
      
      let errorMsg = "Transaction failed";
      if (error.message) {
        errorMsg = error.message;
      }
      
      toast({
        title: "Creation Failed",
        description: errorMsg,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle>Create Community Takeover</CardTitle>
          <CardDescription>
            Fixed treasury address handling to prevent InvalidTreasury errors
            <br />
            Program ID: {PROGRAM_ID}
            <br />
            Connected: {publicKey?.toString().slice(0, 8)}...{publicKey?.toString().slice(-4)}
            <br />
            Treasury: {(() => {
              try {
                return TreasuryResolver.getTreasuryAddress().toString().slice(0, 8) + '...' + TreasuryResolver.getTreasuryAddress().toString().slice(-4);
              } catch {
                return 'Error resolving treasury';
              }
            })()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="tokenName">Token Name</Label>
              <Input
                id="tokenName"
                value={formData.tokenName}
                onChange={(e) => setFormData(prev => ({ ...prev, tokenName: e.target.value }))}
                placeholder="My Awesome Token"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="v1TokenMint">V1 Token Mint Address</Label>
              <Input
                id="v1TokenMint"
                value={formData.v1TokenMint}
                onChange={(e) => setFormData(prev => ({ ...prev, v1TokenMint: e.target.value }))}
                placeholder="Token mint address"
                required
              />
              <p className="text-sm text-gray-500">
                Using Wrapped SOL for testing
              </p>
            </div>

            {/* Image Upload Section */}
            <ImageUpload
              onImageUploaded={(imageUrl) => setFormData(prev => ({ ...prev, imageUrl }))}
              currentImageUrl={formData.imageUrl}
              label="Takeover Image"
            />

            <div className="space-y-2">
              <Label htmlFor="minAmount">Minimum Amount Required (tokens)</Label>
              <Input
                id="minAmount"
                type="number"
                value={formData.minAmount}
                onChange={(e) => setFormData(prev => ({ ...prev, minAmount: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Duration (Days)</Label>
              <Input
                id="duration"
                type="number"
                value={formData.duration}
                onChange={(e) => setFormData(prev => ({ ...prev, duration: e.target.value }))}
                min="1"
                max="30"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customRewardRate">V2 Reward Rate Multiplier</Label>
              <Input
                id="customRewardRate"
                type="number"
                step="0.1"
                value={formData.customRewardRate}
                onChange={(e) => setFormData(prev => ({ ...prev, customRewardRate: e.target.value }))}
                required
              />
            </div>

            {/* 🔥 NEW: Treasury address info */}
            <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
              <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">Treasury Configuration</h4>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                Treasury address: {(() => {
                  try {
                    return TreasuryResolver.getTreasuryAddress().toString();
                  } catch {
                    return 'Error resolving treasury';
                  }
                })()}
              </p>
              <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                This address must match what your Solana program expects or you'll get an InvalidTreasury error.
              </p>
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? <LoadingSpinner /> : "Create Takeover"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}