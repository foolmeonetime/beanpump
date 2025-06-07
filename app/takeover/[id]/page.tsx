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
import { FinalizeButton } from "@/components/finalize-button";
import { PROGRAM_ID } from "@/lib/constants";
import { useParams } from "next/navigation";
import Link from "next/link";

// Debug Timing Component
function DebugTiming({ takeoverAddress, frontendTakeover }: { takeoverAddress: string; frontendTakeover: any }) {
  const { connection } = useConnection();
  const [onChainData, setOnChainData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchOnChainData = async () => {
    try {
      setLoading(true);
      console.log("🔍 Fetching on-chain takeover data...");
      
      const programId = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID!);
      const takeoverPubkey = new PublicKey(takeoverAddress);
      
      // Get account info
      const accountInfo = await connection.getAccountInfo(takeoverPubkey);
      
      if (!accountInfo) {
        console.error("❌ Takeover account not found on-chain");
        return;
      }
      
      console.log("📊 Raw account data length:", accountInfo.data.length);
      
      // Parse the account data manually (simplified approach)
      const data = accountInfo.data;
      
      // Skip discriminator (first 8 bytes)
      let offset = 8;
      
      // Read various fields (adjust offsets based on your Rust struct)
      const authority = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      
      const v1TokenMint = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      
      const vault = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      
      // Read u64 values (8 bytes each, little endian)
      const minAmount = data.readBigUInt64LE(offset);
      offset += 8;
      
      const startTime = data.readBigInt64LE(offset);
      offset += 8;
      
      const endTime = data.readBigInt64LE(offset);
      offset += 8;
      
      const totalContributed = data.readBigUInt64LE(offset);
      offset += 8;
      
      const contributorCount = data.readBigUInt64LE(offset);
      offset += 8;
      
      // Read boolean flags
      const isFinalized = data[offset] === 1;
      offset += 1;
      
      const isSuccessful = data[offset] === 1;
      offset += 1;
      
      const hasV2Mint = data[offset] === 1;
      offset += 1;
      
      // Skip padding to align to 8 bytes
      offset = Math.ceil(offset / 8) * 8;
      
      const v2TokenMint = new PublicKey(data.slice(offset, offset + 32));
      offset += 32;
      
      const v2TotalSupply = data.readBigUInt64LE(offset);
      offset += 8;
      
      // Read f64 (8 bytes)
      const customRewardRate = data.readDoubleLE(offset);
      offset += 8;
      
      const bump = data[offset];
      
      const parsed = {
        authority: authority.toString(),
        v1TokenMint: v1TokenMint.toString(),
        vault: vault.toString(),
        minAmount: minAmount.toString(),
        startTime: Number(startTime),
        endTime: Number(endTime),
        totalContributed: totalContributed.toString(),
        contributorCount: Number(contributorCount),
        isFinalized,
        isSuccessful,
        hasV2Mint,
        v2TokenMint: v2TokenMint.toString(),
        v2TotalSupply: v2TotalSupply.toString(),
        customRewardRate,
        bump
      };
      
      setOnChainData(parsed);
      console.log("✅ Parsed on-chain data:", parsed);
      
    } catch (error) {
      console.error("❌ Error fetching on-chain data:", error);
    } finally {
      setLoading(false);
    }
  };

  const now = Math.floor(Date.now() / 1000);
  
  return (
    <Card className="mb-6 border-yellow-200 bg-yellow-50">
      <CardHeader>
        <CardTitle>🐛 Debug: Timing Mismatch</CardTitle>
        <CardDescription>
          The Rust program says "TooEarly" - let's compare frontend vs on-chain data
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={fetchOnChainData} disabled={loading}>
          {loading ? "Fetching..." : "Fetch On-Chain Data"}
        </Button>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Frontend Data */}
          <div className="p-4 border rounded-lg">
            <h4 className="font-semibold mb-2">📱 Frontend Data</h4>
            <div className="text-sm space-y-1">
              <div><strong>Current Time:</strong> {now} ({new Date(now * 1000).toLocaleString()})</div>
              <div><strong>End Time:</strong> {frontendTakeover.endTime} ({new Date(parseInt(frontendTakeover.endTime) * 1000).toLocaleString()})</div>
              <div><strong>Is Expired:</strong> {now >= parseInt(frontendTakeover.endTime) ? "✅ Yes" : "❌ No"}</div>
              <div><strong>Total Contributed:</strong> {(parseInt(frontendTakeover.totalContributed) / 1_000_000).toLocaleString()}</div>
              <div><strong>Min Amount:</strong> {(parseInt(frontendTakeover.minAmount) / 1_000_000).toLocaleString()}</div>
              <div><strong>Goal Met:</strong> {BigInt(frontendTakeover.totalContributed) >= BigInt(frontendTakeover.minAmount) ? "✅ Yes" : "❌ No"}</div>
              <div><strong>Is Finalized:</strong> {frontendTakeover.isFinalized ? "✅ Yes" : "❌ No"}</div>
            </div>
          </div>
          
          {/* On-Chain Data */}
          <div className="p-4 border rounded-lg">
            <h4 className="font-semibold mb-2">⛓️ On-Chain Data</h4>
            {onChainData ? (
              <div className="text-sm space-y-1">
                <div><strong>End Time:</strong> {onChainData.endTime} ({new Date(onChainData.endTime * 1000).toLocaleString()})</div>
                <div><strong>Is Expired:</strong> {now >= onChainData.endTime ? "✅ Yes" : "❌ No"}</div>
                <div><strong>Total Contributed:</strong> {(parseInt(onChainData.totalContributed) / 1_000_000).toLocaleString()}</div>
                <div><strong>Min Amount:</strong> {(parseInt(onChainData.minAmount) / 1_000_000).toLocaleString()}</div>
                <div><strong>Goal Met:</strong> {BigInt(onChainData.totalContributed) >= BigInt(onChainData.minAmount) ? "✅ Yes" : "❌ No"}</div>
                <div><strong>Is Finalized:</strong> {onChainData.isFinalized ? "✅ Yes" : "❌ No"}</div>
              </div>
            ) : (
              <div className="text-gray-500">Click "Fetch On-Chain Data" to load</div>
            )}
          </div>
        </div>
        
        {/* Analysis */}
        {onChainData && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-semibold text-blue-800 mb-2">📊 Analysis</h4>
            <div className="text-sm text-blue-700 space-y-1">
              <div><strong>Time Difference:</strong> {Math.abs(parseInt(frontendTakeover.endTime) - onChainData.endTime)} seconds</div>
              <div><strong>Contribution Difference:</strong> {Math.abs(parseInt(frontendTakeover.totalContributed) - parseInt(onChainData.totalContributed)) / 1_000_000} tokens</div>
              
              {/* Finalization Check */}
              <div className="mt-2 p-2 bg-white rounded border">
                <strong>Finalization Requirements (Rust Logic):</strong>
                <ul className="mt-1 space-y-1">
                  <li>• Not already finalized: {!onChainData.isFinalized ? "✅" : "❌"}</li>
                  <li>• Goal reached OR time expired: {
                    (BigInt(onChainData.totalContributed) >= BigInt(onChainData.minAmount) || now >= onChainData.endTime) ? "✅" : "❌"
                  }</li>
                  <li>• Current timestamp ≥ end time: {now >= onChainData.endTime ? "✅" : "❌"} (diff: {now - onChainData.endTime}s)</li>
                </ul>
              </div>
            </div>
          </div>
        )}
        
        <div className="text-xs text-gray-600">
          💡 If there are discrepancies, the database might be out of sync with blockchain state.
        </div>
      </CardContent>
    </Card>
  );
}

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
  tokenName: string;
  imageUrl?: string;
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
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
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
  const discriminator = Buffer.from([82, 33, 68, 131, 32, 0, 205, 95]);
  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUInt64LE(amount, 0);
  const data = Buffer.concat([discriminator, amountBuffer]);

  const keys = [
    { pubkey: contributor, isSigner: true, isWritable: true },
    { pubkey: takeover, isSigner: false, isWritable: true },
    { pubkey: contributorAta, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: contributorAccount, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId,
    data,
  });
}

export default function Page() {
  const params = useParams();
  const takeoverAddress = params.id as string;
  
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
  const [showDebug, setShowDebug] = useState(false);

  // Helper functions for finalization logic
  const now = Math.floor(Date.now() / 1000);
  const endTime = takeover ? parseInt(takeover.endTime) : 0;
  const isActive = takeover?.status === 'active' && now < endTime;
  const isGoalMet = takeover ? BigInt(takeover.totalContributed) >= BigInt(takeover.minAmount) : false;
  const isExpired = now >= endTime;
  const isReadyToFinalize = takeover && !takeover.isFinalized && (isGoalMet || isExpired);
  const isAuthority = takeover && publicKey && takeover.authority === publicKey.toString();
  const canContribute = isActive && !takeover?.isFinalized && publicKey;

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
      
      if (!data) {
        throw new Error('No data received from API');
      }
      
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
        setUserTokenBalance(Number(balance.value.amount) / 1_000_000);
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
      
      const amountLamports = BigInt(amount * 1_000_000);
      console.log("2. Contribution amount:", amount, "tokens ->", amountLamports.toString(), "lamports");
      
      const takeoverPubkey = new PublicKey(takeover.address);
      const tokenMint = new PublicKey(takeover.v1_token_mint);
      const vault = new PublicKey(takeover.vault);
      const contributorAta = getAssociatedTokenAddressLegacy(tokenMint, publicKey);
      
      console.log("3. Contributor ATA:", contributorAta.toString());
      
      const ataAccountInfo = await connection.getAccountInfo(contributorAta);
      console.log("4. ATA exists:", !!ataAccountInfo);
      
      const transaction = new Transaction();
      
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
      
      const [contributorAccount, contributorBump] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("contributor"),
          takeoverPubkey.toBuffer(),
          publicKey.toBuffer()
        ],
        new PublicKey(PROGRAM_ID)
      );
      
      console.log("6. Contributor PDA:", contributorAccount.toString(), "bump:", contributorBump);
      
      const contributorAccountInfo = await connection.getAccountInfo(contributorAccount);
      if (contributorAccountInfo) {
        throw new Error("You have already contributed to this takeover. Multiple contributions are not currently supported.");
      }
      
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
      transaction.add(contributeIx);
      
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      console.log("9. Transaction built, simulating first...");
      
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
      
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      }, "confirmed");
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      console.log("17. Transaction confirmed!");
      
      try {
        console.log("18. Saving contribution to database...");
        const dbResponse = await fetch('/api/contributions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            takeoverId: takeover.id,
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
          <div className="flex items-center justify-end gap-3 mb-2">
            {takeover.imageUrl && (
              <img 
                src={takeover.imageUrl} 
                alt={takeover.tokenName}
                className="w-16 h-16 rounded-full object-cover border-2 border-gray-200"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
            <div>
              <h1 className="text-2xl font-bold">{takeover.tokenName} Takeover</h1>
              <p className="text-gray-500">Created by {takeover.authority.slice(0, 6)}...{takeover.authority.slice(-4)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Debug Component - Show when there are finalization issues */}
      {isReadyToFinalize && isAuthority && (
        <div className="space-y-4">
          <Button 
            variant="outline" 
            onClick={() => setShowDebug(!showDebug)}
            className="mb-4"
          >
            {showDebug ? "Hide" : "Show"} Debug Info
          </Button>
          {showDebug && (
            <DebugTiming 
              takeoverAddress={takeover.address}
              frontendTakeover={takeover}
            />
          )}
        </div>
      )}

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

          {/* Finalization Section */}
          {isReadyToFinalize && isAuthority && (
            <div className="border-t pt-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h3 className="font-medium text-yellow-800 mb-2">⚡ Ready to Finalize</h3>
                <p className="text-sm text-yellow-700 mb-4">
                  Your takeover is ready to be finalized! 
                  {isGoalMet 
                    ? " 🎉 The funding goal has been reached - contributors will receive V2 tokens."
                    : " ⏰ The time limit has expired - contributors will receive refunds."
                  }
                </p>
                <FinalizeButton
                  takeoverAddress={takeover.address}
                  takeoverAuthority={takeover.authority}
                  tokenName={takeover.tokenName}
                  isGoalMet={isGoalMet}
                  isReadyToFinalize={true}
                  onFinalized={() => {
                    // Refresh the takeover data after finalization
                    fetchTakeoverDetails();
                  }}
                />
              </div>
            </div>
          )}
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