"use client";

import { useState, useEffect, useCallback } from "react";
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
import { PoolAnalyticsComponent } from "@/components/pool-analytics";
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
  tokenName: string;
  imageUrl?: string;
  // Billion-scale fields (optional)
  rewardRateBp?: number;
  targetParticipationBp?: number;
  calculatedMinAmount?: string;
  maxSafeTotalContribution?: string;
  participationRateBp?: number;
  isBillionScale?: boolean; // Flag to determine takeover type
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

// Function to create regular contribute instruction
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

// Function to create billion-scale contribute instruction
function createContributeBillionScaleInstruction(
  programId: PublicKey,
  contributor: PublicKey,
  takeover: PublicKey,
  contributorAta: PublicKey,
  vault: PublicKey,
  contributorAccount: PublicKey,
  amount: bigint
): TransactionInstruction {
  // Billion-scale discriminator
  const discriminator = Buffer.from([14, 10, 23, 114, 130, 172, 248, 38]);
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
  
  console.log("=== UNIFIED TAKEOVER PAGE DEBUG ===");
  console.log("Takeover address from URL:", takeoverAddress);
  console.log("======================================");
  
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { toast } = useToast();
  
  const [takeover, setTakeover] = useState<Takeover | null>(null);
  const [loading, setLoading] = useState(true);
  const [contributing, setContributing] = useState(false);
  const [contributionAmount, setContributionAmount] = useState("");
  const [userTokenBalance, setUserTokenBalance] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // Detect if this is a billion-scale takeover
  const isBillionScale = takeover?.rewardRateBp !== undefined || takeover?.isBillionScale === true;

  // Helper functions for finalization logic
  const now = Math.floor(Date.now() / 1000);
  const endTime = takeover ? parseInt(takeover.endTime) : 0;
  const isActive = takeover?.status === 'active' && now < endTime;
  const minAmount = takeover?.calculatedMinAmount || takeover?.minAmount || "0";
  const isGoalMet = takeover ? BigInt(takeover.totalContributed) >= BigInt(minAmount) : false;
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
    
    // FIX: Access the nested takeovers array correctly
    let takeovers = data.data?.takeovers || data.takeovers || [];
    
    if (!Array.isArray(takeovers)) {
      console.error("Response is not an array:", takeovers);
      throw new Error('Invalid API response: expected array of takeovers');
    }
    
    console.log("Looking for takeover with address:", takeoverAddress);
    
    const foundTakeover = takeovers.find((t: Takeover) => t.address === takeoverAddress);
    
    if (!foundTakeover) {
      throw new Error(`Takeover not found with address: ${takeoverAddress}`);
    }
    
    // Auto-detect billion-scale based on presence of billion-scale fields
    if (foundTakeover.rewardRateBp !== undefined) {
      foundTakeover.isBillionScale = true;
    }
    
    console.log("Found takeover:", foundTakeover);
    console.log("Is billion-scale:", foundTakeover.isBillionScale || foundTakeover.rewardRateBp !== undefined);
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
      console.log(`1. Starting ${isBillionScale ? 'billion-scale' : 'regular'} contribution...`);
      
      const amount = Number(contributionAmount);
      if (amount <= 0) {
        throw new Error("Please enter a valid contribution amount");
      }
      
      if (amount > userTokenBalance) {
        throw new Error(`Insufficient balance. You have ${userTokenBalance} tokens`);
      }
      
      // Enhanced validation for billion-scale
      if (isBillionScale && amount > 100_000_000) {
        throw new Error("Maximum contribution is 100M tokens for billion-scale safety");
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
      
      // Use appropriate instruction based on takeover type
      const contributeIx = isBillionScale 
        ? createContributeBillionScaleInstruction(
            new PublicKey(PROGRAM_ID),
            publicKey,
            takeoverPubkey,
            contributorAta,
            vault,
            contributorAccount,
            amountLamports
          )
        : createContributeInstruction(
            new PublicKey(PROGRAM_ID),
            publicKey,
            takeoverPubkey,
            contributorAta,
            vault,
            contributorAccount,
            amountLamports
          );
      
      console.log(`7. ${isBillionScale ? 'Billion-scale' : 'Regular'} contribute instruction created`);
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
      
      console.log(`15. Sending ${isBillionScale ? 'billion-scale' : 'regular'} transaction...`);
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
        console.log(`18. Saving ${isBillionScale ? 'billion-scale' : 'regular'} contribution to database...`);
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
          description: `${isBillionScale ? 'Billion-scale c' : 'C'}ontribution successful on blockchain but failed to save to database. Check console for details.`,
          variant: "destructive"
        });
      }
      
      toast({
        title: `${isBillionScale ? 'Billion-Scale ' : ''}Contribution Successful! 🎉`,
        description: `You contributed ${amount} tokens${isBillionScale ? ' with conservative billion-scale protection!' : '!'} View on Solscan: https://solscan.io/tx/${signature}?cluster=devnet`,
        duration: 10000
      });

      setContributionAmount("");
      fetchTakeoverDetails();
      fetchUserBalance();

    } catch (error: any) {
      console.error(`${isBillionScale ? 'Billion-scale c' : 'C'}ontribution failed:`, error);
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

  const totalContributed = parseInt(takeover.totalContributed) / 1_000_000;
  const goalAmount = parseInt(minAmount) / 1_000_000;
  const rewardMultiplier = takeover.rewardRateBp ? takeover.rewardRateBp / 100 : takeover.customRewardRate;

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
              <h1 className="text-2xl font-bold">
                {takeover.tokenName} Takeover
                {isBillionScale && <span className="text-sm text-blue-600 ml-2">🛡️ Billion-Scale</span>}
              </h1>
              <p className="text-gray-500">Created by {takeover.authority.slice(0, 6)}...{takeover.authority.slice(-4)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Details Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex justify-between items-center">
            <span>{isBillionScale ? 'Billion-Scale ' : ''}Takeover Details</span>
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
              <span className="font-medium">Funding Progress {isBillionScale ? '(Conservative)' : ''}</span>
              <span className="text-gray-600">
                {totalContributed.toLocaleString(undefined, { maximumFractionDigits: 2 })} / {goalAmount.toLocaleString()} {takeover.tokenName}
              </span>
            </div>
            <Progress value={takeover.progressPercentage} className="h-3" />
            <div className="flex justify-between text-xs text-gray-500">
              <span>{takeover.progressPercentage.toFixed(1)}% complete</span>
              <span>Goal: {goalAmount.toLocaleString()} {takeover.tokenName}</span>
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
              <div className="text-sm font-medium">{rewardMultiplier}x</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-center">
              <div className="text-xs text-gray-500 mb-1">{takeover.tokenName}</div>
              <div className="text-xs font-mono">{takeover.v1_token_mint.slice(0, 8)}...</div>
            </div>
          </div>

          {/* Billion-Scale Features */}
          {isBillionScale && takeover.rewardRateBp && (
            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <h3 className="font-medium text-blue-800 dark:text-blue-200 mb-2">🛡️ Billion-Scale Safety Features</h3>
              <div className="grid grid-cols-2 gap-4 text-sm text-blue-700 dark:text-blue-300">
                <div>
                  <span className="font-medium">Conservative Rate:</span> {takeover.rewardRateBp}bp (max 200bp = 2.0x)
                </div>
                <div>
                  <span className="font-medium">Target Participation:</span> {takeover.targetParticipationBp}bp ({(takeover.targetParticipationBp || 0)/100}%)
                </div>
                <div>
                  <span className="font-medium">Current Participation:</span> {(takeover.participationRateBp || 0)/100}%
                </div>
                <div>
                  <span className="font-medium">Safety Margin:</span> 2% overflow cushion
                </div>
              </div>
            </div>
          )}

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
                  Your {isBillionScale ? 'billion-scale ' : ''}takeover is ready to be finalized! 
                  {isGoalMet 
                    ? ` 🎉 The funding goal has been reached - contributors will receive ${isBillionScale ? 'conservative ' : ''}V2 tokens.`
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
                    fetchTakeoverDetails();
                  }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pool Simulation Section for Successful Takeovers */}
      {takeover.isFinalized && takeover.isSuccessful && takeover.v2TokenMint && (
        <Card>
          <CardHeader>
            <CardTitle>🏊 V2 Token Pool Simulation</CardTitle>
            <CardDescription>
              Simulate trading mechanics for the new V2 token
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PoolAnalyticsComponent
              tokenMint={takeover.v2TokenMint}
              tokenSymbol={`${takeover.tokenName}-V2`}
              initialSolAmount={5 * 1e9} // 5 SOL initial liquidity
              initialTokenAmount={100000 * 1e6} // 100k tokens initial liquidity
            />
          </CardContent>
        </Card>
      )}

      {/* Contribution Section */}
      {!publicKey ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <h3 className="text-lg font-medium mb-2">Connect Wallet to Contribute</h3>
            <p className="text-gray-500 mb-4">Connect your wallet to participate in this {isBillionScale ? 'billion-scale ' : ''}takeover</p>
            <WalletMultiButton />
          </CardContent>
        </Card>
      ) : canContribute ? (
        <Card>
          <CardHeader>
            <CardTitle>Contribute to {isBillionScale ? 'Billion-Scale ' : ''}Takeover</CardTitle>
            <CardDescription>
              Help reach the funding goal{isBillionScale ? ' with conservative billion-scale protection' : ' and earn V2 tokens when successful'}
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
                <div className={`p-3 rounded-lg ${isBillionScale ? 'bg-blue-50 dark:bg-blue-950' : 'bg-blue-50 dark:bg-blue-950'}`}>
                  <p className={`text-sm ${isBillionScale ? 'text-blue-800 dark:text-blue-200' : 'text-blue-800 dark:text-blue-200'}`}>
                    {isBillionScale ? '🛡️' : '💡'} <strong>{isBillionScale ? 'Conservative billion-scale calculation:' : 'If successful:'}</strong> You'll receive {(Number(contributionAmount) * rewardMultiplier).toLocaleString()} V2 {takeover.tokenName}
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">
                    If unsuccessful: You'll get your {contributionAmount} {takeover.tokenName} refunded
                  </p>
                  {isBillionScale && (
                    <p className="text-xs text-blue-600 dark:text-blue-300">
                      Built-in 2% safety cushion prevents overflow
                    </p>
                  )}
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
              {takeover.isFinalized ? `${isBillionScale ? 'Billion-Scale ' : ''}Takeover Completed` : "Takeover Ended"}
            </h3>
            <p className="text-gray-500">
              {takeover.isFinalized 
                ? (takeover.isSuccessful ? `This ${isBillionScale ? 'billion-scale ' : ''}takeover was successful! Contributors can now claim their ${isBillionScale ? 'conservative ' : ''}V2 tokens.` : "This takeover failed. Contributors can claim refunds.")
                : "This takeover has ended and is awaiting finalization."
              }
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}