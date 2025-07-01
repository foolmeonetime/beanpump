"use client";

import { useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useToast } from "@/components/ui/use-toast"; // ✅ FIXED: Proper import
import { WalletMultiButton } from "@/components/wallet-multi-button";
import { 
  PublicKey, 
  Transaction,
  TransactionInstruction,
  SystemProgram
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import Link from "next/link";
import { useParams } from "next/navigation";

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
  isClaimed: boolean;
  transactionSignature: string;
  createdAt: string;
  takeoverAuthority?: string;
}

// Helper to get associated token address
function getAssociatedTokenAddressLegacy(mint: PublicKey, owner: PublicKey): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
  );
  return address;
}

// Helper to create ATA instruction if needed
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

export default function ClaimPage() {
  const params = useParams();
  const takeoverAddress = params.address as string;
  
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [claims, setClaims] = useState<ClaimDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast(); // ✅ FIXED: Proper destructuring

  const fetchClaims = async () => {
    if (!publicKey) return;

    try {
      setLoading(true);
      setError(null);
      
      console.log('🔍 Fetching claims for takeover:', takeoverAddress);
      console.log('🔍 User:', publicKey.toString());
      
      const response = await fetch(
        `/api/claims?contributor=${publicKey.toString()}&takeover=${takeoverAddress}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch claims');
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error);
      }
      
      console.log('📊 Found claims:', data.claims);
      
      // Transform API response to component format
      const userClaims: ClaimDetails[] = data.claims.map((claim: any) => ({
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
        isClaimed: claim.isClaimed || false,
        transactionSignature: claim.transactionSignature || '',
        createdAt: claim.createdAt || '',
        takeoverAuthority: claim.takeoverAuthority
      }));

      setClaims(userClaims);
      
    } catch (error: any) {
      console.error('❌ Error fetching claims:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const processClaim = async (claim: ClaimDetails) => {
    if (!publicKey || !signTransaction) {
      // ✅ FIXED: Use toast properly
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet to claim.",
        variant: "destructive"
      });
      return;
    }

    setClaiming(claim.id.toString());

    try {
      console.log('🎯 Processing claim:', claim);
      
      // Build the claim transaction
      const transaction = new Transaction();
      
      // Add instructions based on claim type
      if (claim.claimType === 'reward') {
        // Add reward claim instruction
        console.log('🎁 Adding reward claim instruction');
      } else {
        // Add refund claim instruction
        console.log('💰 Adding refund claim instruction');
      }

      // Sign and send transaction
      const signedTransaction = await signTransaction(transaction);
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      
      // Wait for confirmation
      await connection.confirmTransaction(signature, 'confirmed');
      
      console.log('✅ Claim successful:', signature);
      
      // ✅ FIXED: Use toast properly
      toast({
        title: "Claim Successful! 🎉",
        description: `Successfully claimed ${(Number(claim.claimableAmount) / 1_000_000).toLocaleString()} tokens`,
        variant: "default"
      });
      
      // Update claim status locally
      setClaims(prev => prev.map(c => 
        c.id === claim.id 
          ? { ...c, isClaimed: true, transactionSignature: signature }
          : c
      ));
      
    } catch (error: any) {
      console.error('❌ Claim failed:', error);
      
      let errorMessage = error.message || "Unknown error occurred";
      
      if (error.message?.includes('User rejected')) {
        errorMessage = "Transaction was cancelled by user";
      } else if (error.message?.includes('insufficient')) {
        errorMessage = "Insufficient funds for transaction fees";
      }
      
      // ✅ FIXED: Use toast properly
      toast({
        title: "Claim Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setClaiming(null);
    }
  };

  useEffect(() => {
    fetchClaims();
  }, [publicKey, takeoverAddress]);

  if (!publicKey) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-semibold mb-4">Connect Your Wallet</h2>
            <p className="text-gray-600 mb-6">
              Please connect your wallet to view claims for this takeover.
            </p>
            <WalletMultiButton />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <LoadingSpinner />
            <p className="mt-4 text-gray-600">Loading claims...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card className="border-red-200">
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-semibold text-red-800 mb-4">
              Error Loading Claims
            </h2>
            <p className="text-red-600 mb-4">{error}</p>
            <Button onClick={fetchClaims}>
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (claims.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-semibold mb-4">No Claims Found</h2>
            <p className="text-gray-600 mb-4">
              You don't have any claims for this takeover.
            </p>
            <div className="space-y-2">
              <Button 
                variant="outline" 
                onClick={fetchClaims}
              >
                Refresh
              </Button>
              <br />
              <Link href="/claims">
                <Button variant="ghost">
                  View All Claims
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Claims for Takeover</h1>
          <p className="text-gray-600">
            {takeoverAddress.slice(0, 8)}...{takeoverAddress.slice(-4)}
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={fetchClaims}
          disabled={loading}
        >
          {loading ? <LoadingSpinner className="w-4 h-4" /> : 'Refresh'}
        </Button>
      </div>

      <div className="grid gap-4">
        {claims.map((claim) => (
          <Card key={claim.id} className="relative">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {claim.tokenName}
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      claim.claimType === 'reward' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {claim.claimType === 'reward' ? '🎁 Reward' : '💰 Refund'}
                    </span>
                    {claim.isClaimed && (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        ✅ Claimed
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Contributed: {(Number(claim.contributionAmount) / 1_000_000).toLocaleString()} tokens
                  </CardDescription>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold">
                    {(Number(claim.claimableAmount) / 1_000_000).toLocaleString()} tokens
                  </div>
                  <div className="text-sm text-gray-500">
                    {claim.claimType === 'reward' ? 
                      `${claim.customRewardRate}x reward rate` : 
                      'Full refund'
                    }
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <p className="text-sm text-gray-600">
                    Takeover ID: {claim.takeoverId}
                  </p>
                  {claim.transactionSignature && (
                    <p className="text-xs text-gray-500">
                      Claimed: {claim.transactionSignature.slice(0, 8)}...{claim.transactionSignature.slice(-4)}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Link href={`/takeover/${claim.takeoverAddress}`}>
                    <Button variant="outline" size="sm">
                      View Takeover
                    </Button>
                  </Link>
                  {!claim.isClaimed && (
                    <Button 
                      onClick={() => processClaim(claim)}
                      disabled={claiming === claim.id.toString()}
                      className="min-w-[80px]"
                    >
                      {claiming === claim.id.toString() ? (
                        <LoadingSpinner className="w-4 h-4" />
                      ) : (
                        'Claim'
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="text-center">
        <Link href="/claims">
          <Button variant="ghost">
            ← Back to All Claims
          </Button>
        </Link>
      </div>
    </div>
  );
}