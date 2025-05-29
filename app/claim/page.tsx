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
  status: 'active' | 'ended' | 'successful' | 'failed' | 'goal_reached';
  progressPercentage: number;
  created_at: string;
  tokenName: string;
}

interface Contribution {
  id: number;
  takeoverId: number;
  amount: string;
  createdAt: string;
  contributor: string;
  transactionSignature: string;
}

// Helper function to get associated token address
function getAssociatedTokenAddressLegacy(mint: PublicKey, owner: PublicKey): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
  );
  return address;
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

// Function to create airdrop instruction from IDL
function createAirdropInstruction(
  programId: PublicKey,
  authority: PublicKey,
  contributor: PublicKey,
  takeover: PublicKey,
  contributorAccount: PublicKey,
  v2Mint: PublicKey,
  contributorAta: PublicKey,
  vault: PublicKey,
  amount: bigint
): TransactionInstruction {
  // Discriminator from IDL: [140, 11, 185, 155, 26, 142, 21, 45]
  const discriminator = Buffer.from([140, 11, 185, 155, 26, 142, 21, 45]);
  
  // Serialize the amount parameter
  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUInt64LE(amount, 0);
  
  const data = Buffer.concat([
    discriminator,
    amountBuffer
  ]);

  const keys = [
    { pubkey: authority, isSigner: true, isWritable: true },
    { pubkey: contributor, isSigner: true, isWritable: true },
    { pubkey: takeover, isSigner: false, isWritable: true },
    { pubkey: contributorAccount, isSigner: false, isWritable: true },
    { pubkey: v2Mint, isSigner: false, isWritable: true },
    { pubkey: contributorAta, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId,
    data,
  });
}

export default function ClaimPage() {
  const params = useParams();
  const takeoverAddress = params.id as string;
  
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { toast } = useToast();
  
  const [takeover, setTakeover] = useState<Takeover | null>(null);
  const [userContribution, setUserContribution] = useState<Contribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch takeover and user contribution data
  const fetchData = async () => {
    if (!publicKey) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Fetch takeover details
      const takeoverResponse = await fetch('/api/takeovers');
      if (!takeoverResponse.ok) throw new Error('Failed to fetch takeovers');
      
      const takeoverData = await takeoverResponse.json();
      const foundTakeover = takeoverData.takeovers.find((t: Takeover) => t.address === takeoverAddress);
      
      if (!foundTakeover) {
        throw new Error('Takeover not found');
      }
      
      setTakeover(foundTakeover);
      
      // Fetch user's contribution
      const contributionsResponse = await fetch(`/api/contributions?takeover_id=${foundTakeover.id}`);
      if (!contributionsResponse.ok) throw new Error('Failed to fetch contributions');
      
      const contributionsData = await contributionsResponse.json();
      const userContrib = contributionsData.contributions.find((c: Contribution) => 
        c.contributor === publicKey.toString()
      );
      
      setUserContribution(userContrib || null);
      
    } catch (error: any) {
      console.error('Error fetching data:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (takeoverAddress && publicKey) {
      fetchData();
    }
  }, [takeoverAddress, publicKey]);

  const handleClaim = async () => {
    if (!publicKey || !takeover || !userContribution) return;

    try {
      setClaiming(true);
      console.log("1. Starting claim process...");
      
      const takeoverPubkey = new PublicKey(takeover.address);
      const contributionAmount = BigInt(userContribution.amount);
      
      // Calculate rewards based on takeover success
      let claimAmount: bigint;
      let tokenMint: PublicKey;
      
      if (takeover.isSuccessful && takeover.v2TokenMint) {
        // Successful takeover - claim V2 tokens
        const v2TotalSupply = BigInt(1000000 * 1_000_000); // 1M tokens with 6 decimals
        claimAmount = (contributionAmount * v2TotalSupply) / BigInt(takeover.totalContributed);
        tokenMint = new PublicKey(takeover.v2TokenMint);
      } else {
        // Failed takeover - refund V1 tokens
        claimAmount = contributionAmount;
        tokenMint = new PublicKey(takeover.v1_token_mint);
      }
      
      console.log("2. Claim amount:", claimAmount.toString());
      
      // Get required addresses
      const vault = new PublicKey(takeover.vault);
      const contributorAta = getAssociatedTokenAddressLegacy(tokenMint, publicKey);
      
      // Find contributor PDA
      const [contributorAccount] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("contributor"),
          takeoverPubkey.toBuffer(),
          publicKey.toBuffer()
        ],
        new PublicKey(PROGRAM_ID)
      );
      
      console.log("3. Contributor account:", contributorAccount.toString());
      
      // Build transaction
      const transaction = new Transaction();
      
      // Check if ATA exists, create if needed
      const ataAccountInfo = await connection.getAccountInfo(contributorAta);
      if (!ataAccountInfo) {
        console.log("4. Adding ATA creation instruction");
        const createAtaIx = createAssociatedTokenAccountInstructionLegacy(
          publicKey,
          contributorAta,
          publicKey,
          tokenMint
        );
        transaction.add(createAtaIx);
      }
      
      // Create airdrop instruction
      const airdropIx = createAirdropInstruction(
        new PublicKey(PROGRAM_ID),
        new PublicKey(takeover.authority), // Authority must sign
        publicKey, // Contributor must sign
        takeoverPubkey,
        contributorAccount,
        tokenMint,
        contributorAta,
        vault,
        claimAmount
      );
      
      transaction.add(airdropIx);
      
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;
      
      console.log("5. Sending transaction...");
      const signature = await sendTransaction(transaction, connection, {
        skipPreflight: false,
        preflightCommitment: "confirmed",
        maxRetries: 3
      });
      
      console.log("6. Transaction sent, signature:", signature);
      
      // Wait for confirmation
      const confirmation = await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      }, "confirmed");
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }
      
      console.log("7. Claim successful!");
      
      toast({
        title: takeover.isSuccessful ? "V2 Tokens Claimed! 🎉" : "Refund Claimed! 💰",
        description: `Transaction: ${signature}`,
        duration: 10000
      });

      // Refresh data
      fetchData();

    } catch (error: any) {
      console.error("Claim failed:", error);
      toast({
        title: "Claim Failed",
        description: error.message || "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setClaiming(false);
    }
  };

  if (!publicKey) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <h1 className="text-2xl font-bold">Connect Wallet to Claim</h1>
        <p className="text-muted-foreground">Connect your wallet to claim your rewards</p>
        <WalletMultiButton />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-64 space-y-4">
        <LoadingSpinner />
        <span className="text-gray-600">Loading claim details...</span>
      </div>
    );
  }

  if (error || !takeover) {
    return (
      <div className="text-center p-8 max-w-4xl mx-auto">
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-xl font-medium mb-2 text-red-600">Error Loading Claim</h3>
            <p className="text-gray-500 mb-4">{error || "Takeover not found"}</p>
            <Link href="/">
              <Button>Back to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!userContribution) {
    return (
      <div className="text-center p-8 max-w-4xl mx-auto">
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-xl font-medium mb-2">No Contribution Found</h3>
            <p className="text-gray-500 mb-4">You haven't contributed to this takeover</p>
            <Link href={`/takeover/${takeoverAddress}`}>
              <Button>View Takeover Details</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!takeover.isFinalized) {
    return (
      <div className="text-center p-8 max-w-4xl mx-auto">
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-xl font-medium mb-2">Takeover Not Finalized</h3>
            <p className="text-gray-500 mb-4">This takeover hasn't been finalized yet. Please wait for the authority to finalize it.</p>
            <Link href={`/takeover/${takeoverAddress}`}>
              <Button>View Takeover Details</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const contributionTokens = Number(userContribution.amount) / 1_000_000;
  const rewardTokens = contributionTokens * takeover.customRewardRate;

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">
          {takeover.isSuccessful ? "🎉 Claim Your V2 Tokens!" : "💰 Claim Your Refund"}
        </h1>
        <p className="text-gray-600">
          {takeover.tokenName} Takeover • {takeover.isSuccessful ? "Successful" : "Failed"}
        </p>
      </div>

      {/* Claim Details */}
      <Card>
        <CardHeader>
          <CardTitle>Your Claim Details</CardTitle>
          <CardDescription>
            Review your contribution and claim amount
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <div className="text-sm text-gray-500 mb-1">Your Contribution</div>
              <div className="text-lg font-semibold">{contributionTokens.toLocaleString()} {takeover.tokenName}</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
              <div className="text-sm text-gray-500 mb-1">You'll Receive</div>
              <div className="text-lg font-semibold">
                {takeover.isSuccessful 
                  ? `${rewardTokens.toLocaleString()} V2 ${takeover.tokenName}`
                  : `${contributionTokens.toLocaleString()} ${takeover.tokenName} (Refund)`
                }
              </div>
            </div>
          </div>

          {takeover.isSuccessful && (
            <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg">
              <p className="text-sm text-green-800 dark:text-green-200">
                🎉 <strong>Congratulations!</strong> This takeover was successful! You're claiming V2 tokens at a {takeover.customRewardRate}x rate.
              </p>
            </div>
          )}

          {!takeover.isSuccessful && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                💰 This takeover didn't reach its goal. You can claim a full refund of your original contribution.
              </p>
            </div>
          )}

          <Button 
            onClick={handleClaim} 
            disabled={claiming} 
            className="w-full"
            size="lg"
          >
            {claiming ? (
              <LoadingSpinner />
            ) : (
              `Claim ${takeover.isSuccessful ? 'V2 Tokens' : 'Refund'}`
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Transaction Details */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Contribution Date:</span>
            <span>{new Date(userContribution.createdAt).toLocaleDateString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Transaction:</span>
            <a 
              href={`https://solscan.io/tx/${userContribution.transactionSignature}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              View on Solscan
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}