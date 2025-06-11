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

// Function to create initialize_billion_scale instruction manually
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
  // Create instruction data buffer
  // This is the discriminator for "initialize_billion_scale" method from your new IDL
  const discriminator = Buffer.from([10, 1, 51, 248, 146, 123, 209, 48]);
  
  // Serialize the parameters
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

  const keys = [
    { pubkey: authority, isSigner: true, isWritable: true },
    { pubkey: treasury, isSigner: false, isWritable: true },
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
    duration: "7",
    rewardRateBp: "150", // 1.5x in basis points (150/100 = 1.5x)
    targetParticipationBp: "1000", // 10% in basis points (1000/100 = 10%)
    v1MarketPriceLamports: "1000000", // 0.001 SOL per token
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
      console.log("1. Starting billion-scale takeover creation...");
      
      // Check wallet balance
      const balance = await connection.getBalance(publicKey);
      console.log("1.1. Wallet balance:", balance / 1_000_000_000, "SOL");
      
      if (balance < 10_000_000) { // Less than 0.01 SOL
        throw new Error(`Insufficient SOL balance. You have ${balance / 1_000_000_000} SOL, but need at least 0.01 SOL for transaction fees and account creation.`);
      }
      
      // Parse form data
      const v1Mint = new PublicKey(formData.v1TokenMint);
      const duration = BigInt(Number(formData.duration) * 86400); // days to seconds
      const rewardRateBp = Number(formData.rewardRateBp);
      const targetParticipationBp = Number(formData.targetParticipationBp);
      const v1MarketPriceLamports = BigInt(formData.v1MarketPriceLamports);
      
      console.log("2. Billion-scale form data parsed:");
      console.log("   V1 Mint:", v1Mint.toString());
      console.log("   Duration:", duration.toString(), "seconds");
      console.log("   Reward Rate:", rewardRateBp, "basis points (", rewardRateBp/100, "x)");
      console.log("   Target Participation:", targetParticipationBp, "basis points (", targetParticipationBp/100, "%)");
      console.log("   V1 Market Price:", v1MarketPriceLamports.toString(), "lamports");
      
      // Validate new parameters
      if (rewardRateBp < 100 || rewardRateBp > 200) {
        throw new Error("Reward rate must be between 100 (1.0x) and 200 (2.0x) basis points");
      }
      if (targetParticipationBp < 100 || targetParticipationBp > 10000) {
        throw new Error("Target participation must be between 100 (1%) and 10000 (100%) basis points");
      }
      
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
      
      // Create the initialize_billion_scale instruction
      const initializeIx = createInitializeBillionScaleInstruction(
        new PublicKey(PROGRAM_ID),
        publicKey,
        publicKey, // Using wallet as treasury
        v1Mint,
        takeoverPDA,
        vault.publicKey,
        duration,
        rewardRateBp,
        targetParticipationBp,
        v1MarketPriceLamports
      );
      
      console.log("6. Initialize billion-scale instruction created");
      
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
      
      // Send transaction
      console.log("8. Sending billion-scale transaction...");
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: true,
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
            // NOTE: The backend will need to be updated to handle the new billion-scale fields
            minAmount: "0", // Will be calculated by the program
            startTime: startTime.toString(),
            endTime: endTime.toString(),
            customRewardRate: rewardRateBp / 100, // Convert basis points to decimal
            tokenName: formData.tokenName,
            imageUrl: formData.imageUrl,
            // New fields for billion-scale
            rewardRateBp: rewardRateBp,
            targetParticipationBp: targetParticipationBp,
            v1MarketPriceLamports: v1MarketPriceLamports.toString()
          })
        });

        if (!dbResponse.ok) {
          const errorData = await dbResponse.json();
          throw new Error(`Database save failed: ${errorData.error || 'Unknown error'}`);
        }

        const dbResult = await dbResponse.json();
        console.log("11. Successfully saved billion-scale takeover to database:", dbResult);
        
      } catch (dbError) {
        console.error("Database save error:", dbError);
        // Don't fail the entire operation for database errors
        // The blockchain transaction succeeded, which is most important
        toast({
          title: "Partial Success",
          description: "Billion-scale takeover created on blockchain but failed to save to database. Check console for details.",
          variant: "destructive"
        });
      }
      
      toast({
        title: "Billion-Scale Takeover Created Successfully! 🎉",
        description: `Conservative billion-scale takeover created! View on Solscan: https://solscan.io/tx/${signature}?cluster=devnet`,
        duration: 10000
      });

      // Reset form
      setFormData({
        v1TokenMint: "So11111111111111111111111111111111111111112",
        duration: "7",
        rewardRateBp: "150",
        targetParticipationBp: "1000",
        v1MarketPriceLamports: "1000000",
        tokenName: "Test Token",
        imageUrl: ""
      });

    } catch (error: any) {
      console.error("Billion-scale creation failed:");
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
          <CardTitle>Create Billion-Scale Community Takeover</CardTitle>
          <CardDescription>
            Conservative billion-token takeover with 2% safety cushion and 2.0x max rewards
            <br />
            Program ID: {PROGRAM_ID}
            <br />
            Connected: {publicKey?.toString().slice(0, 8)}...{publicKey?.toString().slice(-4)}
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
                placeholder="My Billion Token"
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
                Must have supply between 1M - 10B tokens for safety
              </p>
            </div>

            {/* Image Upload Section */}
            <ImageUpload
              onImageUploaded={(imageUrl) => setFormData(prev => ({ ...prev, imageUrl }))}
              currentImageUrl={formData.imageUrl}
              label="Takeover Image"
            />

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
              <Label htmlFor="rewardRateBp">Reward Rate (Basis Points)</Label>
              <Input
                id="rewardRateBp"
                type="number"
                value={formData.rewardRateBp}
                onChange={(e) => setFormData(prev => ({ ...prev, rewardRateBp: e.target.value }))}
                min="100"
                max="200"
                required
              />
              <p className="text-sm text-gray-500">
                100 = 1.0x, 150 = 1.5x, 200 = 2.0x (conservative max)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="targetParticipationBp">Target Participation (Basis Points)</Label>
              <Input
                id="targetParticipationBp"
                type="number"
                value={formData.targetParticipationBp}
                onChange={(e) => setFormData(prev => ({ ...prev, targetParticipationBp: e.target.value }))}
                min="100"
                max="10000"
                required
              />
              <p className="text-sm text-gray-500">
                1000 = 10%, 2000 = 20%, etc. (determines minimum goal)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="v1MarketPriceLamports">V1 Market Price (Lamports)</Label>
              <Input
                id="v1MarketPriceLamports"
                type="number"
                value={formData.v1MarketPriceLamports}
                onChange={(e) => setFormData(prev => ({ ...prev, v1MarketPriceLamports: e.target.value }))}
                min="1"
                required
              />
              <p className="text-sm text-gray-500">
                1,000,000 = 0.001 SOL per token (for liquidity calculations)
              </p>
            </div>

            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                🛡️ <strong>Conservative Safety Features:</strong>
                <br />• Maximum 2.0x reward rate for sustainability
                <br />• Built-in 2% safety cushion to prevent overflow
                <br />• Proportionate goals based on billion-token scale
                <br />• Automatic overflow protection
              </p>
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? <LoadingSpinner /> : "Create Billion-Scale Takeover"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}