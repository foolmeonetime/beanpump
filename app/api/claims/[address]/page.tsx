// app/claim/[address]/page.tsx - Updated for new airdrop_v2_liquidity instruction
"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useToast } from "@/components/ui/use-toast";
import { 
  PublicKey, 
  Transaction,
  TransactionInstruction,
  SystemProgram
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import Link from "next/link";
import { PROGRAM_ID } from "@/lib/constants";

interface ClaimDetails {
  id: number;
  takeoverId: number;
  takeoverAddress: string;
  tokenName: string;
  contributionAmount: string;
  isSuccessful: boolean;
  customRewardRate: number;
  claimableAmount: string;
  tokenMint: string;
  claimType: 'refund' | 'reward';
  vault: string;
  v1TokenMint: string;
  v2TokenMint?: string;
  refundAmount: string;
  rewardAmount: string;
  takeoverAuthority?: string;
}

interface ClaimPageProps {
  params: {
    address: string;
  };
}

// Helper function to get associated token address
function getAssociatedTokenAddressLegacy(mint: PublicKey, owner: PublicKey): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
  );
  return address;
}

// Helper function to create ATA instruction
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

// Function to create airdrop_v2_liquidity instruction manually
function createAirdropV2LiquidityInstruction(
  programId: PublicKey,
  authority: PublicKey,
  contributor: PublicKey,
  takeover: PublicKey,
  contributorAccount: PublicKey,
  v2Mint: PublicKey,
  contributorAta: PublicKey,
  vault: PublicKey
): TransactionInstruction {
  // New discriminator for airdrop_v2_liquidity from the updated IDL
  const discriminator = Buffer.from([245, 217, 224, 30, 170, 53, 154, 197]);

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
    data: discriminator, // No additional parameters for airdrop_v2_liquidity
  });
}

export default function ClaimPage({ params }: ClaimPageProps) {
  const { publicKey, signTransaction, sendTransaction } = useWallet();
  const { connection } = useConnection();
  const [claims, setClaims] = useState<ClaimDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchClaims = async () => {
    if (!publicKey) return;

    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(
        `/api/claims?contributor=${publicKey.toString()}&takeover=${params.address}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch claims');
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error);
      }
      
      // Transform the claims data
      const transformedClaims = data.claims.map((claim: any) => ({
        id: claim.id,
        takeoverId: claim.takeoverId,
        takeoverAddress: claim.takeoverAddress,
        tokenName: claim.tokenName,
        contributionAmount: claim.contributionAmount,
        isSuccessful: claim.isSuccessful,
        customRewardRate: claim.customRewardRate,
        claimableAmount: claim.isSuccessful ? claim.rewardAmount : claim.refundAmount,
        tokenMint: claim.isSuccessful ? claim.v2TokenMint : claim.v1TokenMint,
        claimType: claim.isSuccessful ? 'reward' : 'refund',
        vault: claim.vault,
        v1TokenMint: claim.v1TokenMint,
        v2TokenMint: claim.v2TokenMint,
        refundAmount: claim.refundAmount,
        rewardAmount: claim.rewardAmount,
        takeoverAuthority: claim.takeoverAuthority
      }));
      
      setClaims(transformedClaims);
      
    } catch (error: any) {
      console.error('Error fetching claims:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const processClaim = async (claim: ClaimDetails) => {
    if (!publicKey || !signTransaction) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet to claim.",
        variant: "destructive"
      });
      return;
    }

    try {
      setClaiming(claim.id.toString());
      
      console.log("🎁 Starting billion-scale claim with conservative liquidity mode...");
      
      const takeoverPubkey = new PublicKey(claim.takeoverAddress);
      const vaultPubkey = new PublicKey(claim.vault);
      const mintPubkey = new PublicKey(claim.tokenMint);
      const authorityPubkey = new PublicKey(claim.takeoverAuthority || claim.takeoverAddress); // Fallback if no authority
      
      console.log("💰 Billion-scale claim details:");
      console.log("   Is successful:", claim.isSuccessful);
      console.log("   Using mint:", mintPubkey.toString());
      console.log("   Original contribution:", Number(claim.contributionAmount) / 1_000_000, "tokens");
      console.log("   Conservative billion-scale mode with 2% safety cushion");

      // Create contributor PDA
      const [contributorPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("contributor"),
          takeoverPubkey.toBuffer(),
          publicKey.toBuffer()
        ],
        new PublicKey(PROGRAM_ID)
      );

      const userTokenAccount = getAssociatedTokenAddressLegacy(mintPubkey, publicKey);
      let tx = new Transaction();
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      // Create ATA if it doesn't exist
      try {
        await connection.getAccountInfo(userTokenAccount);
      } catch {
        tx.add(createAssociatedTokenAccountInstructionLegacy(
          publicKey,
          userTokenAccount,
          publicKey,
          mintPubkey
        ));
      }

      // Use the new airdrop_v2_liquidity instruction
      const airdropIx = createAirdropV2LiquidityInstruction(
        new PublicKey(PROGRAM_ID),
        authorityPubkey, // authority (must be takeover authority)
        publicKey, // contributor
        takeoverPubkey, // takeover
        contributorPDA, // contributor_account
        mintPubkey, // v2_mint (or v1_mint for refunds)
        userTokenAccount, // contributor_ata
        vaultPubkey // vault
      );

      tx.add(airdropIx);
      
      console.log("🔐 Signing billion-scale liquidity transaction...");
      const signature = await sendTransaction(tx, connection);
      
      console.log("⏳ Waiting for confirmation...", signature);
      await connection.confirmTransaction(signature, "confirmed");

      // Calculate the actual amount the user will receive
      const expectedAmount = claim.isSuccessful 
        ? Number(claim.contributionAmount) * claim.customRewardRate
        : Number(claim.contributionAmount);

      console.log("✅ Billion-scale claim successful!");
      console.log("   Expected amount:", expectedAmount / 1_000_000, claim.isSuccessful ? 'V2' : 'V1', "tokens");
      console.log("   Conservative allocation with safety margin applied");

      toast({
        title: "🎉 Billion-Scale Claim Successful!",
        description: `Conservative liquidity claim completed! Expected: ${(expectedAmount / 1_000_000).toLocaleString()} ${claim.isSuccessful ? 'V2' : 'V1'} tokens`,
        duration: 8000
      });
      
      // Refresh claims to show updated status
      setTimeout(() => {
        fetchClaims();
      }, 2000);
      
    } catch (error: any) {
      console.error("❌ Billion-scale claim error:", error);
      toast({
        title: "Claim Failed",
        description: error.message || 'An error occurred during billion-scale claim',
        variant: "destructive"
      });
    } finally {
      setClaiming(null);
    }
  };

  useEffect(() => {
    if (publicKey) {
      fetchClaims();
    }
  }, [publicKey, params.address]);

  if (!publicKey) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-semibold mb-4">Wallet Required</h2>
            <p className="text-gray-600 mb-4">Please connect your wallet to view and process billion-scale claims.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <LoadingSpinner />
            <p className="text-sm text-gray-500 mt-2">Loading billion-scale claims...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Error</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button onClick={fetchClaims}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (claims.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-semibold mb-4">No Claims Found</h2>
            <p className="text-gray-600 mb-4">
              You don&apos;t have any claimable contributions for this billion-scale takeover.
            </p>
            <Link href="/">
              <Button>Back to Takeovers</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalClaimable = claims.reduce((sum, claim) => sum + Number(claim.claimableAmount), 0);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Claim Your Billion-Scale Tokens</h1>
        <p className="text-gray-600">
          Process your claims for the {claims[0]?.tokenName} billion-scale takeover with conservative safety features
        </p>
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Billion-Scale Claim Summary</span>
            <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
              {claims.length} Claim{claims.length !== 1 ? 's' : ''}
            </span>
          </CardTitle>
          <CardDescription>
            Takeover Address: {params.address.slice(0, 8)}...{params.address.slice(-4)}
            <br />
            Conservative billion-scale mode with 2% safety cushion
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Total Claimable:</span><br />
              {(totalClaimable / 1_000_000).toLocaleString()} tokens
            </div>
            <div>
              <span className="font-medium">Claim Type:</span><br />
              {claims[0]?.claimType === 'reward' ? '🎉 Conservative Reward Tokens' : '💰 Refund'}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Individual Claims */}
      <div className="space-y-4">
        {claims.map((claim) => {
          const contributionTokens = Number(claim.contributionAmount) / 1_000_000;
          const claimableTokens = Number(claim.claimableAmount) / 1_000_000;
          const isProcessing = claiming === claim.id.toString();
          
          return (
            <Card key={claim.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-lg">
                  <span>Billion-Scale Contribution #{claim.id}</span>
                  <span 
                    className={`text-xs px-2 py-1 rounded-full ${
                      claim.isSuccessful 
                        ? "bg-green-100 text-green-800" 
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {claim.isSuccessful ? "Success" : "Refund"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Original Contribution:</span><br />
                    {contributionTokens.toLocaleString()} {claim.tokenName}
                  </div>
                  <div>
                    <span className="font-medium">
                      {claim.isSuccessful ? 'Conservative Reward Amount:' : 'Refund Amount:'}
                    </span><br />
                    {claimableTokens.toLocaleString()}{' '}
                    {claim.isSuccessful 
                      ? `V2 tokens (${claim.customRewardRate}x conservative rate)` 
                      : claim.tokenName
                    }
                  </div>
                </div>
                
                {claim.isSuccessful && claim.v2TokenMint && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <h4 className="font-medium text-green-800 mb-1">🛡️ Conservative V2 Token Details</h4>
                    <div className="text-xs font-mono text-green-600">
                      {claim.v2TokenMint}
                    </div>
                    <div className="text-xs text-green-600 mt-1">
                      Allocated with 2% safety cushion and billion-scale overflow protection
                    </div>
                  </div>
                )}
                
                <Button 
                  onClick={() => processClaim(claim)}
                  disabled={isProcessing}
                  className={`w-full ${
                    claim.isSuccessful 
                      ? 'bg-green-600 hover:bg-green-700' 
                      : 'bg-yellow-600 hover:bg-yellow-700'
                  }`}
                >
                  {isProcessing ? (
                    <div className="flex items-center justify-center">
                      <LoadingSpinner />
                      <span className="ml-2">Processing...</span>
                    </div>
                  ) : (
                    <>
                      {claim.isSuccessful ? '🎉 Claim Conservative Reward' : '💰 Claim Refund'}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <h3 className="font-medium text-blue-800 mb-2">🛡️ Billion-Scale Safety Features</h3>
          <div className="text-sm text-blue-700 space-y-1">
            <p>• Conservative reward calculations with 2% safety cushion</p>
            <p>• Maximum 2.0x reward rate for sustainability</p>
            <p>• Overflow protection for billion-token economies</p>
            <p>• Proportionate allocation based on total supply</p>
          </div>
        </CardContent>
      </Card>

      {/* Back Link */}
      <div className="text-center">
        <Link href="/">
          <Button variant="outline">Back to Takeovers</Button>
        </Link>
      </div>
    </div>
  );
}