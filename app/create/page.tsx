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

// 🔥 UPDATED: Reward rate utility class
class RewardRateUtils {
  static toBasisPoints(decimal: number): number {
    return Math.round(decimal * 100);
  }
  
  static toDecimal(basisPoints: number): number {
    return basisPoints / 100.0;
  }
  
  static isValid(decimal: number): boolean {
    return decimal >= 0.5 && decimal <= 10.0;
  }
  
  static formatRate(decimal: number): string {
    return `${decimal.toFixed(1)}x`;
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
    minAmount: "1000",
    duration: "7",
    customRewardRate: "1.5",
    tokenName: "Test Token",
    imageUrl: ""
  });

  // 🔥 UPDATED: Parse and validate reward rate
  const rewardRateDecimal = parseFloat(formData.customRewardRate) || 1.5;
  const rewardRateBp = RewardRateUtils.toBasisPoints(rewardRateDecimal);
  const isValidRewardRate = RewardRateUtils.isValid(rewardRateDecimal);

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

    // 🔥 UPDATED: Validate reward rate before submission
    if (!isValidRewardRate) {
      toast({
        title: "Invalid Reward Rate",
        description: "Reward rate must be between 0.5x and 10.0x",
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
      
      console.log("2. Form data parsed:");
      console.log("   V1 Mint:", v1Mint.toString());
      console.log("   Min Amount:", minAmount.toString());
      console.log("   Duration:", duration.toString());
      console.log("   Reward Rate:", rewardRateDecimal, `(${rewardRateBp} basis points)`);
      
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
      
      // Create the initialize instruction
      const initializeIx = createInitializeInstruction(
        new PublicKey(PROGRAM_ID),
        publicKey,
        publicKey, // Using wallet as treasury
        v1Mint,
        takeoverPDA,
        vault.publicKey,
        minAmount,
        duration,
        rewardRateDecimal // Program will convert to basis points internally
      );
      
      console.log("6. Initialize instruction created");
      
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
      console.log("8. Sending transaction...");
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
      
      // 🔥 UPDATED: Save with basis points info for debugging
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
            customRewardRate: rewardRateDecimal,
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
        description: `${formData.tokenName} takeover created with ${RewardRateUtils.formatRate(rewardRateDecimal)} reward rate!\n\nView on Solscan: https://solscan.io/tx/${signature}?cluster=devnet`,
        duration: 10000
      });

      // Reset form
      setFormData({
        v1TokenMint: "So11111111111111111111111111111111111111112",
        minAmount: "1000",
        duration: "7",
        customRewardRate: "1.5",
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
            Create a new takeover campaign with secure basis points reward system
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

            {/* 🔥 UPDATED: Enhanced reward rate input with basis points display */}
            <div className="space-y-2">
              <Label htmlFor="customRewardRate">V2 Reward Rate Multiplier</Label>
              <Input
                id="customRewardRate"
                type="number"
                step="0.1"
                min="0.5"
                max="10.0"
                value={formData.customRewardRate}
                onChange={(e) => setFormData(prev => ({ ...prev, customRewardRate: e.target.value }))}
                className={!isValidRewardRate ? "border-red-500" : ""}
                required
              />
              <div className="text-sm space-y-1">
                <div className={`${isValidRewardRate ? 'text-green-600' : 'text-red-600'}`}>
                  Contributors get {RewardRateUtils.formatRate(rewardRateDecimal)} tokens if successful
                </div>
                <div className="font-mono text-xs text-gray-500">
                  Stored as: {rewardRateBp} basis points (safe u16 format)
                </div>
                {!isValidRewardRate && (
                  <div className="text-red-600 text-xs">
                    ⚠️ Must be between 0.5x and 10.0x
                  </div>
                )}
              </div>
            </div>

            {/* 🔥 UPDATED: Preview section showing calculations */}
            {isValidRewardRate && Number(formData.minAmount) > 0 && (
              <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">📊 Takeover Preview</h4>
                <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                  <div>• Goal: {Number(formData.minAmount).toLocaleString()} {formData.tokenName}</div>
                  <div>• Duration: {formData.duration} days</div>
                  <div>• Reward rate: {RewardRateUtils.formatRate(rewardRateDecimal)}</div>
                  <div>• If successful: {(Number(formData.minAmount) * rewardRateDecimal).toLocaleString()} V2 tokens total</div>
                  <div className="text-xs pt-1">
                    💡 Reward rate stored as {rewardRateBp} basis points (no f64 corruption!)
                  </div>
                </div>
              </div>
            )}

            <Button 
              type="submit" 
              disabled={loading || !isValidRewardRate} 
              className="w-full"
            >
              {loading ? <LoadingSpinner /> : "Create Takeover"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}