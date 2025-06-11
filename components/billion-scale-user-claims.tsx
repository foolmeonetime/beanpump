// components/billion-scale-user-claims.tsx - Enhanced claims for billion-scale operations
"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useToast } from "@/components/ui/use-toast";
import { formatLargeNumber } from "@/lib/constants";
import Link from "next/link";

interface BillionScaleUserClaim {
  id: number;
  takeoverId: number;
  takeoverAddress: string;
  tokenName: string;
  contributionAmount: string;
  isFinalized: boolean;
  isSuccessful: boolean;
  rewardRateBp: number;
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
  // Billion-scale specific fields
  v1SupplyBillions: number;
  participationRateBp: number;
  safetyUtilization: number;
  conservativeFeatures: string[];
}

export function BillionScaleUserClaims() {
  const { publicKey } = useWallet();
  const [claims, setClaims] = useState<BillionScaleUserClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchUserClaims = async () => {
    if (!publicKey) return;

    try {
      setLoading(true);
      setError(null);
      
      console.log('🔍 Fetching billion-scale claims for:', publicKey.toString());
      
      // Fetch claims from the billion-scale API
      const response = await fetch(`/api/billion-scale-claims?contributor=${publicKey.toString()}`, {
        cache: 'no-store'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch billion-scale claims: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch billion-scale claims');
      }
      
      console.log('📊 Found billion-scale claims:', data.claims);
      
      // Transform API response to component format
      const userClaims: BillionScaleUserClaim[] = data.claims.map((claim: any) => ({
        id: claim.id,
        takeoverId: claim.takeoverId,
        takeoverAddress: claim.takeoverAddress,
        tokenName: claim.tokenName,
        contributionAmount: claim.contributionAmount,
        isFinalized: true, // Only finalized claims are returned
        isSuccessful: claim.isSuccessful,
        rewardRateBp: claim.rewardRateBp,
        canClaim: !claim.isClaimed, // Can claim if not already claimed
        isClaimed: claim.isClaimed || false,
        claimAmount: claim.isSuccessful ? claim.rewardAmount : claim.refundAmount,
        refundAmount: claim.refundAmount,
        rewardAmount: claim.rewardAmount,
        v2TokenMint: claim.v2TokenMint,
        v1TokenMint: claim.v1TokenMint,
        claimType: claim.isSuccessful ? 'reward' : 'refund',
        transactionSignature: claim.transactionSignature || '',
        createdAt: claim.createdAt || '',
        // Billion-scale specific data
        v1SupplyBillions: claim.v1SupplyBillions || 0,
        participationRateBp: claim.participationRateBp || 0,
        safetyUtilization: claim.safetyUtilization || 0,
        conservativeFeatures: claim.conservativeFeatures || [
          "2% overflow safety cushion",
          "2.0x maximum reward rate",
          "Proportionate goal calculation"
        ]
      }));

      setClaims(userClaims);
      
      // Show notification if there are claimable items
      const claimableCount = userClaims.filter(c => c.canClaim).length;
      if (claimableCount > 0) {
        toast({
          title: "🎁 Billion-Scale Claims Available!",
          description: `You have ${claimableCount} conservative claim${claimableCount !== 1 ? 's' : ''} ready to process with enhanced safety features.`,
          duration: 6000
        });
      }
      
    } catch (error: any) {
      console.error('❌ Error fetching billion-scale user claims:', error);
      setError(error.message);
      toast({
        title: "Error Loading Billion-Scale Claims",
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
      <Card className="w-full max-w-5xl mx-auto mb-8">
        <CardContent className="pt-6 text-center">
          <LoadingSpinner />
          <p className="text-sm text-gray-500 mt-2">Loading your billion-scale claims...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full max-w-5xl mx-auto mb-8 border-red-200">
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
  const totalValue = claims.reduce((sum, claim) => {
    const amount = Number(claim.claimAmount) / 1_000_000;
    return sum + amount;
  }, 0);

  // Calculate aggregate billion-scale metrics
  const aggregateMetrics = {
    totalSupplyBillions: claims.reduce((sum, c) => sum + c.v1SupplyBillions, 0),
    averageParticipation: claims.length > 0 
      ? claims.reduce((sum, c) => sum + (c.participationRateBp / 100), 0) / claims.length 
      : 0,
    conservativeOperations: claims.filter(c => c.safetyUtilization < 80).length,
    highRewardClaims: claims.filter(c => c.rewardRateBp >= 180).length, // 1.8x and above
  };

  return (
    <div className="w-full max-w-5xl mx-auto mb-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              🎁 Your Billion-Scale Claims
            </span>
            <div className="flex items-center gap-2">
              {claimableCount > 0 && (
                <span className="px-3 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                  {claimableCount} Ready
                </span>
              )}
              <Button onClick={refreshClaims} variant="ghost" size="sm">
                Refresh
              </Button>
            </div>
          </CardTitle>
          <CardDescription>
            You have {claims.length} completed billion-scale takeover{claims.length !== 1 ? 's' : ''} 
            {claimableCount > 0 && (
              <span className="text-green-600 font-medium">
                {' '}• {claimableCount} ready for claiming with conservative safety features
              </span>
            )}
            {claimedCount > 0 && (
              <span className="text-gray-500">
                {' '}• {claimedCount} already claimed
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Billion-Scale Summary Metrics */}
          <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 rounded-lg">
            <h3 className="font-medium text-blue-800 dark:text-blue-200 mb-3">🌍 Your Billion-Scale Portfolio</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="text-center">
                <div className="font-bold text-lg text-blue-700 dark:text-blue-300">
                  {formatLargeNumber(totalValue)}
                </div>
                <div className="text-gray-600 dark:text-gray-400">Total Claimable</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-lg text-purple-700 dark:text-purple-300">
                  {aggregateMetrics.totalSupplyBillions.toFixed(1)}B
                </div>
                <div className="text-gray-600 dark:text-gray-400">Total Supply</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-lg text-green-700 dark:text-green-300">
                  {aggregateMetrics.averageParticipation.toFixed(2)}%
                </div>
                <div className="text-gray-600 dark:text-gray-400">Avg Participation</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-lg text-orange-700 dark:text-orange-300">
                  {aggregateMetrics.conservativeOperations}
                </div>
                <div className="text-gray-600 dark:text-gray-400">Conservative Ops</div>
              </div>
            </div>
          </div>

          {/* Individual Claims */}
          <div className="space-y-4">
            {claims.map((claim: BillionScaleUserClaim) => {
              const contributionTokens = Number(claim.contributionAmount) / 1_000_000;
              const claimTokens = Number(claim.claimAmount) / 1_000_000;
              const rewardRate = claim.rewardRateBp / 100;
              const participationRate = claim.participationRateBp / 100;
              
              return (
                <div 
                  key={`${claim.takeoverId}-${claim.id}`} 
                  className={`p-6 border rounded-lg transition-colors ${
                    claim.canClaim 
                      ? 'border-green-200 bg-green-50 dark:bg-green-950' 
                      : 'border-gray-200 bg-gray-50 dark:bg-gray-950'
                  }`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold text-lg">{claim.tokenName} Billion-Scale Takeover</h4>
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
                      
                      {/* Billion-Scale Metrics */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                        <div>
                          <span className="text-gray-500">V1 Supply:</span><br />
                          <span className="font-medium">{claim.v1SupplyBillions.toFixed(1)}B tokens</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Your Participation:</span><br />
                          <span className="font-medium">{participationRate.toFixed(3)}%</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Safety Utilization:</span><br />
                          <span className="font-medium">{claim.safetyUtilization.toFixed(1)}%</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Reward Rate:</span><br />
                          <span className="font-medium">{(rewardRate/100).toFixed(1)}x (conservative)</span>
                        </div>
                      </div>
                      
                      {/* Contribution and Claim Details */}
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Contributed:</span><br />
                          <span className="font-medium">{formatLargeNumber(contributionTokens)} {claim.tokenName}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">
                            {claim.isSuccessful ? 'Claimable Reward:' : 'Refund Amount:'}
                          </span><br />
                          <span className="font-medium">
                            {formatLargeNumber(claimTokens)}{' '}
                            {claim.isSuccessful 
                              ? `V2 tokens (${(rewardRate/100).toFixed(1)}x conservative reward)` 
                              : claim.tokenName
                            }
                          </span>
                        </div>
                      </div>

                      {/* Conservative Features */}
                      {claim.conservativeFeatures && claim.conservativeFeatures.length > 0 && (
                        <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                          <div className="text-xs text-blue-800 dark:text-blue-200 font-medium mb-1">
                            🛡️ Conservative Safety Features:
                          </div>
                          <div className="text-xs text-blue-600 dark:text-blue-300">
                            {claim.conservativeFeatures.join(' • ')}
                          </div>
                        </div>
                      )}

                      {/* V2 Token Details for Successful Claims */}
                      {claim.isSuccessful && claim.v2TokenMint && (
                        <div className="mt-3 p-3 bg-green-50 dark:bg-green-950 border border-green-200 rounded-lg">
                          <h5 className="font-medium text-green-800 dark:text-green-200 mb-1">V2 Token Details (1:1 Supply Ratio)</h5>
                          <div className="text-xs font-mono text-green-600 dark:text-green-400">
                            {claim.v2TokenMint}
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3 ml-4">
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
                            {claim.isSuccessful ? "🎉 Claim V2 Tokens" : "💰 Claim Refund"}
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
                </div>
              );
            })}
          </div>
          
          {/* Bulk Actions for Multiple Claims */}
          {claimableCount > 1 && (
            <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-blue-800 dark:text-blue-200">Bulk Billion-Scale Claim Available</h4>
                  <p className="text-sm text-blue-600 dark:text-blue-300">
                    You have {claimableCount} billion-scale claims ready. Enhanced batch processing coming soon with conservative safety features.
                  </p>
                </div>
                <Button 
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={() => {
                    toast({
                      title: "Bulk Billion-Scale Claim",
                      description: "Bulk claiming for billion-scale takeovers with enhanced safety features is coming soon! For now, please claim individually.",
                      duration: 6000
                    });
                  }}
                >
                  Claim All (Coming Soon)
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}