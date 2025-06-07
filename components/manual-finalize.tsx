// components/manual-finalize.tsx
"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useToast } from "@/components/ui/use-toast";

interface FinalizableTakeover {
  id: number;
  address: string;
  authority: string;
  tokenName: string;
  totalContributed: string;
  minAmount: string;
  endTime: string;
  contributorCount: number;
  customRewardRate: number;
  readyToFinalize: boolean;
  isGoalMet: boolean;
  expectedOutcome: 'success' | 'failed' | 'active';
  progressPercentage: number;
}

export function ManualFinalize() {
  const { publicKey } = useWallet();
  const [takeovers, setTakeovers] = useState<FinalizableTakeover[]>([]);
  const [loading, setLoading] = useState(false);
  const [finalizing, setFinalizing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchFinalizableTakeovers = async () => {
    if (!publicKey) return;

    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/finalize?authority=${publicKey.toString()}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch takeovers');
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error);
      }
      
      setTakeovers(data.takeovers || []);
      
    } catch (error: any) {
      console.error('Error fetching finalizable takeovers:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const finalizeTakeover = async (takeover: FinalizableTakeover) => {
    // This would normally use the useManualFinalize hook
    // For now, let's show a placeholder
    toast({
      title: "Manual Finalization",
      description: "This feature requires the manual finalization hook implementation.",
      duration: 4000
    });
  };

  useEffect(() => {
    if (publicKey) {
      fetchFinalizableTakeovers();
    } else {
      setTakeovers([]);
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
          <p className="text-sm text-gray-500 mt-2">Loading your takeovers...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full max-w-4xl mx-auto mb-8 border-red-200">
        <CardContent className="pt-6 text-center">
          <p className="text-red-600 mb-4">Error: {error}</p>
          <Button onClick={fetchFinalizableTakeovers} variant="outline" size="sm">
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const readyToFinalize = takeovers.filter(t => t.readyToFinalize);
  const stillActive = takeovers.filter(t => !t.readyToFinalize);

  // Don't render if no takeovers
  if (takeovers.length === 0) {
    return null;
  }

  return (
    <div className="w-full max-w-4xl mx-auto mb-8 space-y-6">
      {/* Ready to Finalize Section */}
      {readyToFinalize.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                ⚡ Your Takeovers Ready to Finalize
              </span>
              <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                {readyToFinalize.length} Ready
              </span>
            </CardTitle>
            <CardDescription>
              These takeovers have either reached their goal or expired and can now be finalized.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {readyToFinalize.map((takeover) => {
                const contributedTokens = Number(takeover.totalContributed) / 1_000_000;
                const goalTokens = Number(takeover.minAmount) / 1_000_000;
                const isProcessing = finalizing === takeover.address;
                
                return (
                  <div 
                    key={takeover.id}
                    className="flex items-center justify-between p-4 border border-yellow-200 rounded-lg bg-white"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold">{takeover.tokenName} Takeover</h4>
                        <span 
                          className={`text-xs px-2 py-1 rounded-full ${
                            takeover.isGoalMet 
                              ? "bg-green-100 text-green-800" 
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {takeover.isGoalMet ? "Goal Reached" : "Expired"}
                        </span>
                      </div>
                      
                      <div className="text-sm text-gray-600 space-y-1">
                        <div>
                          <span className="font-medium">Progress:</span> {contributedTokens.toLocaleString()} / {goalTokens.toLocaleString()} {takeover.tokenName} ({takeover.progressPercentage.toFixed(1)}%)
                        </div>
                        <div>
                          <span className="font-medium">Contributors:</span> {takeover.contributorCount}
                        </div>
                        <div>
                          <span className="font-medium">Expected Outcome:</span>{' '}
                          {takeover.isGoalMet 
                            ? `🎉 Success (${takeover.customRewardRate}x rewards)`
                            : '💰 Refunds for contributors'
                          }
                        </div>
                        <div className="text-xs font-mono text-gray-500">
                          {takeover.address.slice(0, 8)}...{takeover.address.slice(-4)}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <Button 
                        onClick={() => finalizeTakeover(takeover)}
                        disabled={isProcessing}
                        className={
                          takeover.isGoalMet 
                            ? "bg-green-600 hover:bg-green-700" 
                            : "bg-yellow-600 hover:bg-yellow-700"
                        }
                      >
                        {isProcessing ? (
                          <div className="flex items-center">
                            <LoadingSpinner />
                            <span className="ml-2">Finalizing...</span>
                          </div>
                        ) : (
                          <span>
                            {takeover.isGoalMet ? "🎉 Finalize Success" : "⏰ Finalize Expired"}
                          </span>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {readyToFinalize.length > 1 && (
              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-blue-800">Batch Finalization</h4>
                    <p className="text-sm text-blue-600">
                      You have {readyToFinalize.length} takeovers ready. Consider finalizing them all.
                    </p>
                  </div>
                  <Button 
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={() => {
                      toast({
                        title: "Batch Finalization",
                        description: "Batch finalization feature coming soon! For now, please finalize individually.",
                        duration: 4000
                      });
                    }}
                  >
                    Finalize All
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      
      {/* Still Active Section */}
      {stillActive.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                🔄 Your Active Takeovers
              </span>
              <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                {stillActive.length} Active
              </span>
            </CardTitle>
            <CardDescription>
              These takeovers are still running and cannot be finalized yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stillActive.map((takeover) => {
                const contributedTokens = Number(takeover.totalContributed) / 1_000_000;
                const goalTokens = Number(takeover.minAmount) / 1_000_000;
                const now = Math.floor(Date.now() / 1000);
                const endTime = parseInt(takeover.endTime);
                const timeLeft = endTime - now;
                
                let timeDisplay = "";
                if (timeLeft > 0) {
                  const days = Math.floor(timeLeft / 86400);
                  const hours = Math.floor((timeLeft % 86400) / 3600);
                  const minutes = Math.floor((timeLeft % 3600) / 60);
                  
                  if (days > 0) {
                    timeDisplay = `${days}d ${hours}h remaining`;
                  } else if (hours > 0) {
                    timeDisplay = `${hours}h ${minutes}m remaining`;
                  } else {
                    timeDisplay = `${minutes}m remaining`;
                  }
                }
                
                return (
                  <div 
                    key={takeover.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{takeover.tokenName}</h4>
                        <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full">
                          Active
                        </span>
                      </div>
                      <div className="text-sm text-gray-600">
                        {contributedTokens.toLocaleString()} / {goalTokens.toLocaleString()} {takeover.tokenName} • {timeDisplay}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">
                      {takeover.progressPercentage.toFixed(1)}%
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}