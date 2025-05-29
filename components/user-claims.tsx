"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/loading-spinner";
import Link from "next/link";

interface UserClaim {
  takeoverId: number;
  takeoverAddress: string;
  tokenName: string;
  contributionAmount: string;
  isFinalized: boolean;
  isSuccessful: boolean;
  customRewardRate: number;
  canClaim: boolean;
}

export function UserClaims() {
  const { publicKey } = useWallet();
  const [claims, setClaims] = useState<UserClaim[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchUserClaims = async () => {
    if (!publicKey) return;

    try {
      setLoading(true);
      
      // Fetch all contributions by this user
      const contributionsResponse = await fetch('/api/contributions');
      if (!contributionsResponse.ok) return;
      
      const contributionsData = await contributionsResponse.json();
      const userContributions = contributionsData.contributions.filter(
        (c: any) => c.contributor === publicKey.toString()
      );

      // Fetch takeover details
      const takeoversResponse = await fetch('/api/takeovers');
      if (!takeoversResponse.ok) return;
      
      const takeoversData = await takeoversResponse.json();
      
      // Match contributions with takeovers
      const userClaims: UserClaim[] = userContributions.map((contribution: any) => {
        const takeover = takeoversData.takeovers.find((t: any) => t.id === contribution.takeoverId);
        return {
          takeoverId: contribution.takeoverId,
          takeoverAddress: takeover?.address || '',
          tokenName: takeover?.tokenName || 'Unknown Token',
          contributionAmount: contribution.amount,
          isFinalized: takeover?.isFinalized || false,
          isSuccessful: takeover?.isSuccessful || false,
          customRewardRate: takeover?.customRewardRate || 1,
          canClaim: takeover?.isFinalized && !contribution.claimed // You'd need to track claimed status
        };
      });

      setClaims(userClaims.filter(claim => claim.isFinalized));
      
    } catch (error) {
      console.error('Error fetching user claims:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserClaims();
  }, [publicKey]);

  if (!publicKey) {
    return null; // Don't show if wallet not connected
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <LoadingSpinner />
          <p className="text-sm text-gray-500 mt-2">Loading your claims...</p>
        </CardContent>
      </Card>
    );
  }

  if (claims.length === 0) {
    return null; // Don't show if no claims
  }

  return (
    <div className="w-full max-w-4xl mx-auto mb-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🎁 Your Claims
          </CardTitle>
          <CardDescription>
            You have {claims.length} completed takeover{claims.length !== 1 ? 's' : ''} ready for claiming
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {claims.map((claim: UserClaim) => {
              const contributionTokens = Number(claim.contributionAmount) / 1_000_000;
              const rewardTokens = contributionTokens * claim.customRewardRate;
              
              return (
                <div key={claim.takeoverId} className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <h4 className="font-semibold">{claim.tokenName} Takeover</h4>
                    <p className="text-sm text-gray-500">
                      {claim.isSuccessful 
                        ? `Claim ${rewardTokens.toLocaleString()} V2 tokens (${claim.customRewardRate}x reward)`
                        : `Claim ${contributionTokens.toLocaleString()} ${claim.tokenName} refund`
                      }
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      claim.isSuccessful 
                        ? "bg-green-100 text-green-800" 
                        : "bg-yellow-100 text-yellow-800"
                    }`}>
                      {claim.isSuccessful ? "Success" : "Refund"}
                    </span>
                    <Link href={`/claim/${claim.takeoverAddress}`}>
                      <Button size="sm">
                        {claim.isSuccessful ? "Claim Tokens" : "Claim Refund"}
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}