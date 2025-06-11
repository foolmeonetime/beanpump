// components/billion-scale-manual-finalize.tsx - Enhanced manual finalization
"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useToast } from "@/components/ui/use-toast";
import { useBillionScaleFinalize } from "@/hooks/use-billion-scale-finalize";
import { formatLargeNumber, getSafetyLevel } from "@/lib/constants";

interface FinalizableBillionScaleTakeover {
  id: number;
  address: string;
  authority: string;
  tokenName: string;
  totalContributed: string;
  calculatedMinAmount: string;
  maxSafeTotalContribution: string;
  endTime: string;
  contributorCount: number;
  rewardRateBp: number;
  targetParticipationBp: number;
  participationRateBp: number;
  readyToFinalize: boolean;
  isGoalMet: boolean;
  expectedOutcome: 'success' | 'failed' | 'active';
  progressPercentage: number;
  safetyUtilization: number;
  v1SupplyBillions: number;
}

export function BillionScaleManualFinalize() {
  const { publicKey } = useWallet();
  const [takeovers, setTakeovers] = useState<FinalizableBillionScaleTakeover[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  
  const {
    loading,
    finalizing,
    fetchFinalizableTakeovers,
    finalizeBillionScaleTakeover,
    batchFinalizeTakeovers,
    getBillionScaleStatus
  } = useBillionScaleFinalize();

  const loadTakeovers = async () => {
    try {
      setError(null);
      const fetchedTakeovers = await fetchFinalizableTakeovers();
      setTakeovers(fetchedTakeovers);
    } catch (error: any) {
      setError(error.message);
    }
  };

  useEffect(() => {
    if (publicKey) {
      loadTakeovers();
    } else {
      setTakeovers([]);
      setError(null);
    }
  }, [publicKey]);

  const handleFinalize = async (takeover: FinalizableBillionScaleTakeover) => {
    const success = await finalizeBillionScaleTakeover(takeover);
    if (success) {
      // Refresh the list after successful finalization
      setTimeout(() => {
        loadTakeovers();
      }, 2000);
    }
  };

  const handleBatchFinalize = async () => {
    const readyTakeovers = takeovers.filter(t => t.readyToFinalize);
    await batchFinalizeTakeovers(readyTakeovers);
  };

  // Don't render if wallet not connected
  if (!publicKey) {
    return null;
  }

  if (loading) {
    return (
      <Card className="w-full max-w-5xl mx-auto mb-8">
        <CardContent className="pt-6 text-center">
          <LoadingSpinner />
          <p className="text-sm text-gray-500 mt-2">Loading your billion-scale takeovers...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full max-w-5xl mx-auto mb-8 border-red-200">
        <CardContent className="pt-6 text-center">
          <p className="text-red-600 mb-4">Error: {error}</p>
          <Button onClick={loadTakeovers} variant="outline" size="sm">
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

  // Calculate aggregate metrics for ready takeovers
  const aggregateMetrics = {
    totalSupplyBillions: readyToFinalize.reduce((sum, t) => sum + t.v1SupplyBillions, 0),
    averageSafetyUtilization: readyToFinalize.length > 0 
      ? readyToFinalize.reduce((sum, t) => sum + t.safetyUtilization, 0) / readyToFinalize.length 
      : 0,
    conservativeOperations: readyToFinalize.filter(t => t.safetyUtilization < 80).length,
    successfulCount: readyToFinalize.filter(t => t.isGoalMet).length,
    totalContributors: readyToFinalize.reduce((sum, t) => sum + t.contributorCount, 0),
  };

  return (
    <div className="w-full max-w-5xl mx-auto mb-8 space-y-6">
      {/* Ready to Finalize Section */}
      {readyToFinalize.length > 0 && (
        <Card className="border-yellow-200 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-950 dark:to-orange-950">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                ⚡ Your Billion-Scale Takeovers Ready to Finalize
              </span>
              <span className="px-3 py-1 text-xs bg-yellow-100 dark:bg-yellow-800 text-yellow-800 dark:text-yellow-200 rounded-full">
                {readyToFinalize.length} Ready
              </span>
            </CardTitle>
            <CardDescription>
              These billion-scale takeovers have either reached their conservative goals or expired and can now be finalized with enhanced safety features.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Aggregate Metrics for Ready Takeovers */}
            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <h3 className="font-medium text-blue-800 dark:text-blue-200 mb-3">🌍 Ready Takeovers Ecosystem Metrics</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                <div className="text-center">
                  <div className="font-bold text-lg text-blue-700 dark:text-blue-300">
                    {aggregateMetrics.totalSupplyBillions.toFixed(1)}B
                  </div>
                  <div className="text-gray-600 dark:text-gray-400">Total Supply</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-lg text-green-700 dark:text-green-300">
                    {aggregateMetrics.successfulCount}
                  </div>
                  <div className="text-gray-600 dark:text-gray-400">Successful</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-lg text-purple-700 dark:text-purple-300">
                    {aggregateMetrics.conservativeOperations}
                  </div>
                  <div className="text-gray-600 dark:text-gray-400">Conservative</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-lg text-orange-700 dark:text-orange-300">
                    {aggregateMetrics.averageSafetyUtilization.toFixed(1)}%
                  </div>
                  <div className="text-gray-600 dark:text-gray-400">Avg Safety</div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-lg text-indigo-700 dark:text-indigo-300">
                    {aggregateMetrics.totalContributors}
                  </div>
                  <div className="text-gray-600 dark:text-gray-400">Contributors</div>
                </div>
              </div>
            </div>

            {/* Individual Ready Takeovers */}
            <div className="space-y-4">
              {readyToFinalize.map((takeover) => {
                const contributedMillions = Number(takeover.totalContributed) / 1_000_000;
                const goalMillions = Number(takeover.calculatedMinAmount) / 1_000_000;
                const isProcessing = finalizing === takeover.address;
                const status = getBillionScaleStatus(takeover);
                const safetyLevel = getSafetyLevel(takeover.safetyUtilization);
                const rewardRate = takeover.rewardRateBp / 100;
                const participationRate = takeover.participationRateBp / 100;
                
                return (
                  <div 
                    key={takeover.id}
                    className="flex items-start justify-between p-6 border border-yellow-200 rounded-lg bg-white dark:bg-gray-800"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-3">
                        <h4 className="font-semibold text-lg">{takeover.tokenName} Billion-Scale Takeover</h4>
                        <span 
                          className={`text-xs px-3 py-1 rounded-full ${
                            takeover.isGoalMet 
                              ? "bg-green-100 text-green-800" 
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {takeover.isGoalMet ? "🎯 Goal Reached" : "⏰ Expired"}
                        </span>
                        <span 
                          className={`text-xs px-2 py-1 rounded-full ${
                            safetyLevel === 'safe' ? 'bg-green-100 text-green-700' :
                            safetyLevel === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}
                        >
                          🛡️ {safetyLevel.toUpperCase()}
                        </span>
                      </div>
                      
                      {/* Billion-Scale Metrics Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                        <div>
                          <span className="text-gray-500">Supply:</span><br />
                          <span className="font-medium">{takeover.v1SupplyBillions.toFixed(1)}B tokens</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Progress:</span><br />
                          <span className="font-medium">
                            {formatLargeNumber(contributedMillions)}M / {formatLargeNumber(goalMillions)}M
                            ({takeover.progressPercentage.toFixed(1)}%)
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Participation:</span><br />
                          <span className="font-medium">{participationRate.toFixed(3)}%</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Contributors:</span><br />
                          <span className="font-medium">{takeover.contributorCount}</span>
                        </div>
                      </div>

                      {/* Conservative Details */}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mb-4">
                        <div>
                          <span className="text-gray-500">Reward Rate:</span><br />
                          <span className="font-medium">{(rewardRate/100).toFixed(1)}x (conservative)</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Safety Utilization:</span><br />
                          <span className="font-medium">{takeover.safetyUtilization.toFixed(1)}%</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Expected Outcome:</span><br />
                          <span className="font-medium">
                            {takeover.isGoalMet 
                              ? `🎉 Success (${(rewardRate/100).toFixed(1)}x rewards)`
                              : '💰 Conservative refunds'
                            }
                          </span>
                        </div>
                      </div>

                      {/* Safety Features */}
                      <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                        <div className="text-xs text-blue-800 dark:text-blue-200 font-medium mb-1">
                          🛡️ Conservative Safety Features Active:
                        </div>
                        <div className="text-xs text-blue-600 dark:text-blue-300">
                          2% overflow safety cushion • 2.0x maximum reward rate • Proportionate goal calculation • Billion-scale overflow protection
                        </div>
                      </div>

                      <div className="text-xs font-mono text-gray-500 mt-2">
                        {takeover.address.slice(0, 8)}...{takeover.address.slice(-4)}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3 ml-6">
                      <Button 
                        onClick={() => handleFinalize(takeover)}
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
            
            {/* Batch Finalization for Multiple Takeovers */}
            {readyToFinalize.length > 1 && (
              <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-blue-800 dark:text-blue-200">Batch Billion-Scale Finalization</h4>
                    <p className="text-sm text-blue-600 dark:text-blue-300">
                      You have {readyToFinalize.length} billion-scale takeovers ready. Enhanced batch processing with conservative safety features.
                    </p>
                    <div className="text-xs text-blue-500 dark:text-blue-400 mt-1">
                      Total ecosystem value: {aggregateMetrics.totalSupplyBillions.toFixed(1)}B tokens • 
                      {aggregateMetrics.conservativeOperations} conservative operations • 
                      {aggregateMetrics.successfulCount} successful
                    </div>
                  </div>
                  <Button 
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={handleBatchFinalize}
                  >
                    Finalize All Billion-Scale
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
                🔄 Your Active Billion-Scale Takeovers
              </span>
              <span className="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                {stillActive.length} Active
              </span>
            </CardTitle>
            <CardDescription>
              These billion-scale takeovers are still running with conservative safety features and cannot be finalized yet.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stillActive.map((takeover) => {
                const contributedMillions = Number(takeover.totalContributed) / 1_000_000;
                const goalMillions = Number(takeover.calculatedMinAmount) / 1_000_000;
                const rewardRate = takeover.rewardRateBp / 100;
                const participationRate = takeover.participationRateBp / 100;
                const safetyLevel = getSafetyLevel(takeover.safetyUtilization);
                
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
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-medium">{takeover.tokenName} Billion-Scale</h4>
                        <span className="text-xs px-2 py-1 bg-green-100 text-green-800 rounded-full">
                          Active
                        </span>
                        <span 
                          className={`text-xs px-2 py-1 rounded-full ${
                            safetyLevel === 'safe' ? 'bg-green-100 text-green-700' :
                            safetyLevel === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}
                        >
                          🛡️ {safetyLevel.charAt(0).toUpperCase() + safetyLevel.slice(1)}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        <div>
                          Supply: {takeover.v1SupplyBillions.toFixed(1)}B • 
                          Progress: {formatLargeNumber(contributedMillions)}M / {formatLargeNumber(goalMillions)}M • 
                          {timeDisplay}
                        </div>
                        <div>
                          Participation: {participationRate.toFixed(3)}% • 
                          Reward: {(rewardRate/100).toFixed(1)}x • 
                          Safety: {takeover.safetyUtilization.toFixed(1)}%
                        </div>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 text-right">
                      <div>{takeover.progressPercentage.toFixed(1)}% complete</div>
                      <div className="text-blue-600">Conservative mode active</div>
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