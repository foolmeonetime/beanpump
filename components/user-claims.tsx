// components/user-claims.tsx - Compatible version without Badge component
"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useToast } from "@/components/ui/use-toast";
import Link from "next/link";

interface UserClaim {
  id: number;
  takeoverId: number;
  takeoverAddress: string;
  tokenName: string;
  contributionAmount: string;
  isFinalized: boolean;
  isSuccessful: boolean;
  customRewardRate: number;
  canClaim: boolean;
  isClaimed: boolean;
  claimAmount: string;
  refundAmount: string;
  rewardAmount: string;
  v2TokenMint?: string;
  v1TokenMint: string;
  claimType: 'refund' | 'reward';
  transactionSignature: string;
  createdAt: string;
}

export function UserClaims() {
  const { publicKey } = useWallet();
  const [claims, setClaims] = useState<UserClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchUserClaims = async () => {
    if (!publicKey) return;

    try {
      setLoading(true);
      setError(null);
      
      console.log('🔍 Fetching claims for:', publicKey.toString());
      
      // Fetch claims from the new API
      const response = await fetch(`/api/claims?contributor=${publicKey.toString()}`, {
        cache: 'no-store'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch claims: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch claims');
      }
      
      console.log('📊 Found claims:', data.claims);
      
      // Transform API response to component format
      const userClaims: UserClaim[] = data.claims.map((claim: any) => ({
        id: claim.id,
        takeoverId: claim.takeoverId,
        takeoverAddress: claim.takeoverAddress,
        tokenName: claim.tokenName,
        contributionAmount: claim.contributionAmount,
        isFinalized: true, // Only finalized claims are returned
        isSuccessful: claim.isSuccessful,
        customRewardRate: claim.customRewardRate,
        canClaim: !claim.isClaimed, // Can claim if not already claimed
        isClaimed: claim.isClaimed || false,
        claimAmount: claim.isSuccessful ? claim.rewardAmount : claim.refundAmount,
        refundAmount: claim.refundAmount,
        rewardAmount: claim.rewardAmount,
        v2TokenMint: claim.v2TokenMint,
        v1TokenMint: claim.v1TokenMint,
        claimType: claim.isSuccessful ? 'reward' : 'refund',
        transactionSignature: claim.transactionSignature || '',
        createdAt: claim.createdAt || ''
      }));

      setClaims(userClaims);
      
      // Show notification if there are claimable items
      const claimableCount = userClaims.filter(c => c.canClaim).length;
      if (claimableCount > 0) {
        toast({
          title: "🎁 Claims Available!",
          description: `You have ${claimableCount} claim${claimableCount !== 1 ? 's' : ''} ready to process.`,
          duration: 5000
        });
      }
      
    } catch (error: any) {
      console.error('❌ Error fetching user claims:', error);
      setError(error.message);
      toast({
        title: "Error Loading Claims",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshClaims = () => {
    fetchUserClaims();
  };

  useEffect(() => {
    if (publicKey) {
      fetchUserClaims();
    } else {
      setClaims([]);
      setError(null);
    }
  }, [publicKey]);

  // Don't render if wallet not connected
  if (!publicKey) {
    return null;
  }

  if (loading) {
    return (
      <Card className="w-full max-w-4xl mx-auto mb-8">
        <CardContent className="pt-6 text-center">
          <LoadingSpinner />
          <p className="text-sm text-gray-500 mt-2">Loading your claims...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full max-w-4xl mx-auto mb-8 border-red-200">
        <CardContent className="pt-6 text-center">
          <p className="text-red-600 mb-4">Error: {error}</p>
          <Button onClick={refreshClaims} variant="outline" size="sm">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Don't render if no claims
  if (claims.length === 0) {
    return null;
  }

  const claimableCount = claims.filter(c => c.canClaim).length;
  const claimedCount = claims.filter(c => c.isClaimed).length;

  return (
    <div className="w-full max-w-4xl mx-auto mb-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              🎁 Your Claims
            </span>
            <div className="flex items-center gap-2">
              {claimableCount > 0 && (
                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                  {claimableCount} Ready
                </span>
              )}
              <Button onClick={refreshClaims} variant="ghost" size="sm">
                Refresh
              </Button>
            </div>
          </CardTitle>
          <CardDescription>
            You have {claims.length} completed takeover{claims.length !== 1 ? 's' : ''} 
            {claimableCount > 0 && (
              <span className="text-green-600 font-medium">
                {' '}• {claimableCount} ready for claiming
              </span>
            )}
            {claimedCount > 0 && (
              <span className="text-gray-500">
                {' '}• {claimedCount} already claimed
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {claims.map((claim: UserClaim) => {
              const contributionTokens = Number(claim.contributionAmount) / 1_000_000;
              const claimTokens = Number(claim.claimAmount) / 1_000_000;
              
              return (
                <div 
                  key={`${claim.takeoverId}-${claim.id}`} 
                  className={`flex items-center justify-between p-4 border rounded-lg transition-colors ${
                    claim.canClaim ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold">{claim.tokenName} Takeover</h4>
                      <span 
                        className={`text-xs px-2 py-1 rounded-full ${
                          claim.isSuccessful 
                            ? "bg-green-100 text-green-800" 
                            : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {claim.isSuccessful ? "Success" : "Refund"}
                      </span>
                      {claim.isClaimed && (
                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                          Claimed
                        </span>
                      )}
                    </div>
                    
                    <div className="text-sm text-gray-600 space-y-1">
                      <div>
                        <span className="font-medium">Contributed:</span> {contributionTokens.toLocaleString()} {claim.tokenName}
                      </div>
                      <div>
                        <span className="font-medium">
                          {claim.isSuccessful ? 'Claimable Reward:' : 'Refund Amount:'}
                        </span>{' '}
                        {claimTokens.toLocaleString()}{' '}
                        {claim.isSuccessful 
                          ? `V2 tokens (${claim.customRewardRate}x reward)` 
                          : claim.tokenName
                        }
                      </div>
                      {claim.isSuccessful && claim.v2TokenMint && (
                        <div className="text-xs font-mono text-gray-500">
                          V2 Token: {claim.v2TokenMint.slice(0, 8)}...{claim.v2TokenMint.slice(-4)}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    {claim.canClaim ? (
                      <Link href={`/claim/${claim.takeoverAddress}`}>
                        <Button 
                          size="sm"
                          className={
                            claim.isSuccessful 
                              ? "bg-green-600 hover:bg-green-700" 
                              : "bg-yellow-600 hover:bg-yellow-700"
                          }
                        >
                          {claim.isSuccessful ? "🎉 Claim Tokens" : "💰 Claim Refund"}
                        </Button>
                      </Link>
                    ) : (
                      <Link href={`/claim/${claim.takeoverAddress}`}>
                        <Button variant="outline" size="sm" disabled>
                          Already Claimed
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          
          {claimableCount > 1 && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-blue-800">Bulk Claim Available</h4>
                  <p className="text-sm text-blue-600">
                    You have {claimableCount} claims ready. Consider processing them all at once.
                  </p>
                </div>
                <Button 
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={() => {
                    toast({
                      title: "Bulk Claim",
                      description: "Bulk claiming feature coming soon! For now, please claim individually.",
                      duration: 4000
                    });
                  }}
                >
                  Claim All
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}