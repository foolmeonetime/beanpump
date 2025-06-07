// app/claim/[address]/page.tsx - Compatible version without Badge/Alert components
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
  TransactionInstruction
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import Link from "next/link";

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
}

interface ClaimPageProps {
  params: {
    address: string;
  };
}

export default function ClaimPage({ params }: ClaimPageProps) {
  const { publicKey, signTransaction } = useWallet();
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
        rewardAmount: claim.rewardAmount
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
      
      // Create claim instruction
      const programId = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID!);
      const takeoverPubkey = new PublicKey(claim.takeoverAddress);
      const vaultPubkey = new PublicKey(claim.vault);
      
      // Create the claim instruction based on your program's airdrop_v2 instruction
      const claimInstruction = new TransactionInstruction({
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },        // authority (contributor)
          { pubkey: publicKey, isSigner: true, isWritable: true },        // contributor
          { pubkey: takeoverPubkey, isSigner: false, isWritable: true },  // takeover
          // contributor_account PDA would need to be calculated here
          // v2_mint, contributor_ata, vault would need the actual addresses
          { pubkey: vaultPubkey, isSigner: false, isWritable: true },     // vault
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
        ],
        programId,
        data: Buffer.from([140, 11, 185, 155, 26, 142, 21, 45]) // airdrop_v2 discriminator from IDL
      });

      const transaction = new Transaction().add(claimInstruction);
      transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      transaction.feePayer = publicKey;

      console.log('🔐 Signing transaction...');
      const signedTransaction = await signTransaction(transaction);
      
      console.log('📤 Sending transaction...');
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      
      console.log('⏳ Waiting for confirmation...', signature);
      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');
      
      console.log('✅ Transaction confirmed, recording claim...');
      
      // Record the claim in the database
      const recordResponse = await fetch('/api/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contributionId: claim.id,
          contributor: publicKey.toString(),
          takeoverAddress: claim.takeoverAddress,
          transactionSignature: signature
        })
      });
      
      if (!recordResponse.ok) {
        throw new Error('Failed to record claim in database');
      }
      
      const recordData = await recordResponse.json();
      
      if (!recordData.success) {
        throw new Error(recordData.error);
      }
      
      toast({
        title: "🎉 Claim Successful!",
        description: `Successfully claimed ${Number(claim.claimableAmount) / 1_000_000} ${
          claim.claimType === 'reward' ? 'V2 tokens' : claim.tokenName
        }`,
        duration: 8000
      });
      
      // Refresh claims to show updated status
      setTimeout(() => {
        fetchClaims();
      }, 2000);
      
    } catch (error: any) {
      console.error('❌ Claim error:', error);
      toast({
        title: "Claim Failed",
        description: error.message || 'An error occurred while processing your claim',
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
            <p className="text-gray-600 mb-4">Please connect your wallet to view and process claims.</p>
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
            <p className="text-sm text-gray-500 mt-2">Loading claims...</p>
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
              You don't have any claimable contributions for this takeover.
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
        <h1 className="text-3xl font-bold mb-2">Claim Your Tokens</h1>
        <p className="text-gray-600">
          Process your claims for the {claims[0]?.tokenName} takeover
        </p>
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Claim Summary</span>
            <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
              {claims.length} Claim{claims.length !== 1 ? 's' : ''}
            </span>
          </CardTitle>
          <CardDescription>
            Takeover Address: {params.address.slice(0, 8)}...{params.address.slice(-4)}
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
              {claims[0]?.claimType === 'reward' ? '🎉 Reward Tokens' : '💰 Refund'}
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
                  <span>Contribution #{claim.id}</span>
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
                      {claim.isSuccessful ? 'Reward Amount:' : 'Refund Amount:'}
                    </span><br />
                    {claimableTokens.toLocaleString()}{' '}
                    {claim.isSuccessful 
                      ? `V2 tokens (${claim.customRewardRate}x)` 
                      : claim.tokenName
                    }
                  </div>
                </div>
                
                {claim.isSuccessful && claim.v2TokenMint && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <h4 className="font-medium text-green-800 mb-1">V2 Token Details</h4>
                    <div className="text-xs font-mono text-green-600">
                      {claim.v2TokenMint}
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
                      {claim.isSuccessful ? '🎉 Claim Reward' : '💰 Claim Refund'}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Back Link */}
      <div className="text-center">
        <Link href="/">
          <Button variant="outline">Back to Takeovers</Button>
        </Link>
      </div>
    </div>
  );
}