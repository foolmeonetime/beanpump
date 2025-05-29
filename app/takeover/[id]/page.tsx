"use client";

import { useState, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { 
  PublicKey, 
  Transaction, 
  TransactionInstruction,
  SystemProgram
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/components/ui/use-toast";
import { LoadingSpinner } from "@/components/loading-spinner";
import { WalletMultiButton } from "@/components/wallet-multi-button";
import { PROGRAM_ID } from "@/lib/constants";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Takeover {
  id: number;
  address: string;
  authority: string;
  v1_token_mint: string;
  vault: string;
  minAmount: string;
  startTime: string;
  endTime: string;
  totalContributed: string;
  contributorCount: number;
  isFinalized: boolean;
  isSuccessful: boolean;
  hasV2Mint: boolean;
  v2TokenMint?: string;
  customRewardRate: number;
  status: 'active' | 'ended' | 'successful' | 'failed';
  progressPercentage: number;
  created_at: string;
  tokenName: string; // Add token name
}

// Helper function to create ATA instruction if needed
function createAssociatedTokenAccountInstructionLegacy(
  payer: PublicKey,
  associatedToken: PublicKey,
  owner: PublicKey,
  mint: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
    ],
    programId: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
    data: Buffer.from([]),
  });
}
// Helper function to get associated token address
function getAssociatedTokenAddressLegacy(mint: PublicKey, owner: PublicKey): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL") // Associated Token Program
  );
  return address;
}

// Function to create contribute instruction manually based on your Anchor program
function createContributeInstruction(
  programId: PublicKey,
  contributor: PublicKey,
  takeover: PublicKey,
  contributorAta: PublicKey,
  vault: PublicKey,
  contributorAccount: PublicKey,
  amount: bigint
): TransactionInstruction {
  // Create instruction data buffer
  // For Anchor "contribute" instruction from your IDL
  // Discriminator: [82, 33, 68, 131, 32, 0, 205, 95]
  const discriminator = Buffer.from([82, 33, 68, 131, 32, 0, 205, 95]);
  
  // Serialize the amount parameter as u64 little-endian
  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUInt64LE(amount, 0);
  
  const data = Buffer.concat([
    discriminator,
    amountBuffer
  ]);

  // Account order must match exactly what's in your Anchor program's #[derive(Accounts)]
  const keys = [
    { pubkey: contributor, isSigner: true, isWritable: true },        // contributor
    { pubkey: takeover, isSigner: false, isWritable: true },         // takeover
    { pubkey: contributorAta, isSigner: false, isWritable: true },   // contributor_ata
    { pubkey: vault, isSigner: false, isWritable: true },            // vault
    { pubkey: contributorAccount, isSigner: false, isWritable: true }, // contributor_account
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
  ];

  return new TransactionInstruction({
    keys,
    programId,
    data,
  });
}

export default function Page() {
  const params = useParams();
  const takeoverAddress = params.id as string; // Changed from params.address to params.id
  
  console.log("=== PAGE DEBUG INFO ===");
  console.log("Raw params:", params);
  console.log("Takeover address from URL:", takeoverAddress);
  console.log("Type of address:", typeof takeoverAddress);
  console.log("Address length:", takeoverAddress?.length);
  console.log("=======================");
  
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { toast } = useToast();
  
  const [takeover, setTakeover] = useState<Takeover | null>(null);
  const [loading, setLoading] = useState(true);
  const [contributing, setContributing] = useState(false);
  const [contributionAmount, setContributionAmount] = useState("");
  const [userTokenBalance, setUserTokenBalance] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // Fetch takeover details
  const fetchTakeoverDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log("Fetching takeover details for address:", takeoverAddress);
      
      const response = await fetch('/api/takeovers');
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log("API response:", data);
      
      // Check if data has the expected structure
      if (!data) {
        throw new Error('No data received from API');
      }
      
      // Handle different possible response structures
      let takeovers = data.takeovers || data || [];
      
      if (!Array.isArray(takeovers)) {
        console.error("Response is not an array:", takeovers);
        throw new Error('Invalid API response: expected array of takeovers');
      }
      
      console.log("Looking for takeover with address:", takeoverAddress);
      console.log("Available takeovers:", takeovers.map((t: any) => ({ id: t.id, address: t.address })));
      
      const foundTakeover = takeovers.find((t: Takeover) => t.address === takeoverAddress);
      
      if (!foundTakeover) {
        throw new Error(`Takeover not found with address: ${takeoverAddress}`);
      }
      
      console.log("Found takeover:", foundTakeover);
      setTakeover(foundTakeover);
    } catch (error: any) {
      console.error('Error fetching takeover:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch user's token balance
  const fetchUserBalance = async () => {
    if (!publicKey || !takeover) return;
    
    try {
      const tokenMint = new PublicKey(takeover.v1_token_mint);
      const userAta = getAssociatedTokenAddressLegacy(tokenMint, publicKey);
      
      const accountInfo = await connection.getAccountInfo(userAta);
      if (accountInfo) {
        const balance = await connection.getTokenAccountBalance(userAta);
        setUserTokenBalance(Number(balance.value.amount) / 1_000_000); // Assuming 6 decimals
      } else {
        setUserTokenBalance(0);
      }
    } catch (error) {
      console.log('Error fetching user balance:', error);
      setUserTokenBalance(0);
    }
  };

  useEffect(() => {
    if (takeoverAddress) {
      fetchTakeoverDetails();
    } else {
      console.error("No takeover address provided");
      setError("No takeover address provided");
      setLoading(false);
    }
  }, [takeoverAddress]);

  useEffect(() => {
    if (takeover && publicKey) {
      fetchUserBalance();
    }
  }, [takeover, publicKey]);

  const handleContribute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey || !takeover) return;

    try {
      setContributing(true);
      console.log("1. Starting contribution...");
      
      const amount = Number(contributionAmount);
      if (amount <= 0) {
        throw new Error("Please enter a valid contribution amount");
      }
      
      if (amount > userTokenBalance) {
        throw new Error(`Insufficient balance. You have ${userTokenBalance} tokens`);
      }
      
      // Convert to smallest units (6 decimals)
      const amountLamports = BigInt(amount * 1_000_000);
      
      console.log("2. Contribution amount:", amount, "tokens ->", amountLamports.toString(), "lamports");
      
      // Get required addresses
      const takeoverPubkey = new PublicKey(takeover.address);
      const tokenMint = new PublicKey(takeover.v1_token_mint);
      const vault = new PublicKey(takeover.vault);
      
      // Get user's associated token account
      const contributorAta = getAssociatedTokenAddressLegacy(tokenMint, publicKey);
      console.log("3. Contributor ATA:", contributorAta.toString());
      
      // Check if ATA exists, create if needed
      const ataAccountInfo = await connection.getAccountInfo(contributorAta);
      console.log("4. ATA exists:", !!ataAccountInfo);
      
      // Build transaction
      const transaction = new Transaction();
      
      // Add ATA creation instruction if needed
      if (!ataAccountInfo) {
        console.log("5. Adding ATA creation instruction");
        const createAtaIx = createAssociatedTokenAccountInstructionLegacy(
          publicKey,
          contributorAta,
          publicKey,
          tokenMint
        );
        transaction.add(createAtaIx);
      }
      
      // Find contributor PDA
      const [contributorAccount, contributorBump] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("contributor"),
          takeoverPubkey.toBuffer(),
          publicKey.toBuffer()
        ],
        new PublicKey(PROGRAM_ID)
      );
      
      console.log("6. Contributor PDA:", contributorAccount.toString(), "bump:", contributorBump);
      
      // Check if contributor account already exists
      const contributorAccountInfo = await connection.getAccountInfo(contributorAccount);
      if (contributorAccountInfo) {
        throw new Error("You have already contributed to this takeover. Multiple contributions are not currently supported.");
      }
      
      // Create contribute instruction
      const contributeIx = createContributeInstruction(
        new PublicKey(PROGRAM_ID),
        publicKey,
        takeoverPubkey,
        contributorAta,
        vault,
        contributorAccount,
        amountLamports
      );
      
      console.log("7. Contribute instruction created");
      console.log("8. Instruction details:", {
        programId: PROGRAM_ID,
        accounts: contributeIx.keys.map(k => ({
          pubkey: k.pubkey.toString(),
          isSigner: k.isSigner,
          isWritable: k.isWritable
        })),
        dataLength: contributeIx.data.length
      });
      
      // Add contribute instruction to transaction
      transaction.add(contributeIx);
      
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      console.log("9. Transaction built, simulating first...");
      
      // Simulate transaction first to catch errors early
      try {
        const simulation = await connection.simulateTransaction(transaction);
        console.log("10. Simulation result:", simulation);
        
        if (simulation.value.err) {
          console.error("11. Simulation failed:", simulation.value.err);
          console.error("12. Simulation logs:", simulation.value.logs);
          throw new Error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
        }
        
        console.log("13. Simulation successful, logs:", simulation.value.logs);
      } catch (simError) {
        console.error("14. Simulation error:", simError);
        throw simError;
      }
      
      console.log("15. Sending transaction...");
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
        maxRetries: 3
      });
      
      console.log("16. Transaction sent, signature:", signature);
      
      // Wait for confirmation
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      }, "confirmed");
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      console.log("17. Transaction confirmed!");
      
      // 🔥 Save contribution to database after successful blockchain transaction
      try {
        console.log("18. Saving contribution to database...");
        const dbResponse = await fetch('/api/contributions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            takeoverId: takeover.id, // Use the database ID
            amount: amountLamports.toString(),
            contributor: publicKey.toString(),
            transactionSignature: signature
          })
        });

        if (!dbResponse.ok) {
          const errorData = await dbResponse.json();
          throw new Error(`Database save failed: ${errorData.error || 'Unknown error'}`);
        }

        const dbResult = await dbResponse.json();
        console.log("19. Successfully saved contribution to database:", dbResult);
        
      } catch (dbError) {
        console.error("Database save error:", dbError);
        // Don't fail the entire operation for database errors
        // The blockchain transaction succeeded, which is most important
        toast({
          title: "Partial Success",
          description: "Contribution successful on blockchain but failed to save to database. Check console for details.",
          variant: "destructive"
        });
      }
      
      toast({
        title: "Contribution Successful! 🎉",
        description: `You contributed ${amount} tokens to the takeover. View on Solscan: https://solscan.io/tx/${signature}?cluster=devnet`,
        duration: 10000
      });

      // Refresh data
      setContributionAmount("");
      fetchTakeoverDetails();
      fetchUserBalance();

    } catch (error: any) {
      console.error("Contribution failed:", error);
      toast({
        title: "Contribution Failed",
        description: error.message || "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setContributing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-64 space-y-4">
        <LoadingSpinner />
        <span className="text-gray-600">Loading takeover details...</span>
      </div>
    );
  }

  if (error || !takeover) {
    return (
      <div className="text-center p-8 max-w-4xl mx-auto">
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-xl font-medium mb-2 text-red-600">Error Loading Takeover</h3>
            <p className="text-gray-500 mb-4">{error || "Takeover not found"}</p>
            <Link href="/">
              <Button>Back to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const endTime = parseInt(takeover.endTime);
  const isActive = takeover.status === 'active' && now < endTime;
  const canContribute = isActive && !takeover.isFinalized && publicKey;

  // Format time remaining
  let timeLeft = "";
  if (takeover.isFinalized) {
    timeLeft = takeover.isSuccessful ? "✅ Successful" : "❌ Failed";
  } else if (isActive) {
    const diff = endTime - now;
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    
    if (days > 0) {
      timeLeft = `${days}d ${hours}h remaining`;
    } else if (hours > 0) {
      timeLeft = `${hours}h ${minutes}m remaining`;
    } else {
      timeLeft = `${minutes}m remaining`;
    }
  } else {
    timeLeft = "⏰ Ended - Awaiting Finalization";
  }

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href="/">
          <Button variant="outline">← Back to Takeovers</Button>
        </Link>
        <div className="text-right">
          <h1 className="text-2xl font-bold">{takeover.tokenName} Takeover</h1>
          <p className="text-gray-500">Created by {takeover.authority.slice(0, 6)}...{takeover.authority.slice(-4)}</p>
        </div>
      </div>

      {/* Main Details Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            <span>Takeover Details</span>
            <span className={`text-sm px-3 py-1 rounded-full ${
              isActive ? "bg-green-100 text-green-800" : 
              takeover.isFinalized ? 
                (takeover.isSuccessful ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800") :
                "bg-yellow-100 text-yellow-800"
            }`}>
              {isActive ? "🟢 Active" : takeover.isFinalized ? timeLeft : "⏰ Ended"}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Progress Section */}
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Funding Progress</span>
              <span className="text-gray-600">
                {(parseInt(takeover.totalContributed) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} / {(parseInt(takeover.minAmount) / 1_000_000).toLocaleString()} {takeover.tokenName}
              </span>
            </div>
            <Progress value={takeover.progressPercentage} className="h-3" />
            <div className="flex justify-between text-xs text-gray-500">
              <span>{takeover.progressPercentage.toFixed(1)}% complete</span>
                              <span>Goal: {(parseInt(takeover.minAmount) / 1_000_000).toLocaleString()} {takeover.tokenName}</span>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-center">
              <div className="text-xs text-gray-500 mb-1">Time Remaining</div>
              <div className="text-sm font-medium">{timeLeft}</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-center">
              <div className="text-xs text-gray-500 mb-1">Contributors</div>
              <div className="text-sm font-medium">{takeover.contributorCount}</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-center">
              <div className="text-xs text-gray-500 mb-1">Reward Rate</div>
              <div className="text-sm font-medium">{takeover.customRewardRate}x</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-center">
              <div className="text-xs text-gray-500 mb-1">{takeover.tokenName}</div>
              <div className="text-xs font-mono">{takeover.v1_token_mint.slice(0, 8)}...</div>
            </div>
          </div>

          {/* Technical Details */}
          <div className="border-t pt-4">
            <h3 className="font-medium mb-2">Technical Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Takeover Address:</span>
                <div className="font-mono text-xs break-all">{takeover.address}</div>
              </div>
              <div>
                <span className="text-gray-500">Vault Address:</span>
                <div className="font-mono text-xs break-all">{takeover.vault}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contribution Section */}
      {!publicKey ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <h3 className="text-lg font-medium mb-2">Connect Wallet to Contribute</h3>
            <p className="text-gray-500 mb-4">Connect your wallet to participate in this takeover</p>
            <WalletMultiButton />
          </CardContent>
        </Card>
      ) : canContribute ? (
        <Card>
          <CardHeader>
            <CardTitle>Contribute to Takeover</CardTitle>
            <CardDescription>
              Help reach the funding goal and earn V2 tokens when successful
              {userTokenBalance > 0 && (
                <div className="mt-2 text-sm">
                  Your balance: <span className="font-medium">{userTokenBalance.toLocaleString()} {takeover.tokenName}</span>
                </div>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleContribute} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="amount">Contribution Amount ({takeover.tokenName})</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.000001"
                  value={contributionAmount}
                  onChange={(e) => setContributionAmount(e.target.value)}
                  placeholder="Enter amount to contribute"
                  required
                  max={userTokenBalance}
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Minimum: 0.000001 {takeover.tokenName}</span>
                  <span>Available: {userTokenBalance.toLocaleString()} {takeover.tokenName}</span>
                </div>
              </div>

              {Number(contributionAmount) > 0 && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <p className="text-sm text-blue-800 dark:text-blue-200">
                    💡 <strong>If successful:</strong> You'll receive {(Number(contributionAmount) * takeover.customRewardRate).toLocaleString()} V2 {takeover.tokenName}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">
                    If unsuccessful: You'll get your {contributionAmount} {takeover.tokenName} refunded
                  </p>
                </div>
              )}

              <Button type="submit" disabled={contributing || Number(contributionAmount) <= 0} className="w-full">
                {contributing ? <LoadingSpinner /> : `Contribute ${contributionAmount || '0'} ${takeover.tokenName}`}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6 text-center">
            <h3 className="text-lg font-medium mb-2">
              {takeover.isFinalized ? "Takeover Completed" : "Takeover Ended"}
            </h3>
            <p className="text-gray-500">
              {takeover.isFinalized 
                ? (takeover.isSuccessful ? "This takeover was successful! Contributors can now claim their V2 tokens." : "This takeover failed. Contributors can claim refunds.")
                : "This takeover has ended and is awaiting finalization."
              }
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}