"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { LoadingSpinner } from '@/components/loading-spinner';
import { useToast } from '@/components/ui/use-toast';
import { WorkingContributionForm } from '@/components/working-contribution-form';

// Types for the takeover data
interface ProcessedTakeoverData {
  id: number;
  address: string;
  authority: string;
  v1_token_mint: string;
  vault: string;
  tokenName: string;
  startTime: string;
  endTime: string;
  totalContributed: string;
  contributorCount: number;
  isFinalized: boolean;
  isSuccessful: boolean;
  hasV2Mint: boolean;
  v2TokenMint?: string;
  minAmount: string;
  customRewardRate: number;
  rewardRateBp?: number;
  tokenAmountTarget?: string; // UPDATED: Use token amount target
  targetParticipationBp?: number; // Keep for backward compatibility
  calculatedMinAmount?: string;
  maxSafeTotalContribution?: string;
  v1TotalSupply?: string;
  v2TotalSupply?: string;
  v1MarketPriceLamports?: string;
  solForLiquidity?: string;
  jupiterSwapCompleted?: boolean;
  lpCreated?: boolean;
  created_at?: string;
  updated_at?: string;
  status: 'active' | 'finalized' | 'successful' | 'failed' | 'expired';
  isBillionScale: boolean;
  isGoalMet: boolean;
  progressPercent: number;
}

// Simple toast notification system
function useToastNotification() {
  const [toasts, setToasts] = useState<Array<{
    id: string;
    title: string;
    description: string;
    variant?: string;
  }>>([]);

  const toast = ({ title, description, variant = 'default' }: {
    title: string;
    description: string;
    variant?: string;
  }) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, title, description, variant }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const ToastContainer = () => (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`p-4 rounded-lg shadow-lg max-w-sm transition-all duration-300 ${
            toast.variant === 'destructive' 
              ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900 dark:border-red-700 dark:text-red-200' 
              : 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900 dark:border-blue-700 dark:text-blue-200'
          }`}
        >
          <div className="font-semibold">{toast.title}</div>
          <div className="text-sm">{toast.description}</div>
          <button
            onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
            className="absolute top-1 right-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );

  return { toast, ToastContainer };
}

// Utility functions
const formatAmount = (amount: string | number, decimals: number = 6) => {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1)}B`;
  } else if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  } else if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  } else {
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
};

const formatTimeLeft = (seconds: number) => {
  const days = Math.floor(seconds / (24 * 60 * 60));
  const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((seconds % (60 * 60)) / 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const getStatusConfig = (status: string) => {
  switch (status) {
    case 'active':
      return { color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900', label: 'Active' };
    case 'successful':
      return { color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900', label: 'Successful' };
    case 'failed':
      return { color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900', label: 'Failed' };
    case 'expired':
      return { color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900', label: 'Expired' };
    default:
      return { color: 'text-gray-600 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-gray-800', label: 'Finalized' };
  }
};

export default function TakeoverDetailPage() {
  const params = useParams();
  const takeoverAddress = params.id as string;
  
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { toast, ToastContainer } = useToastNotification();
  
  const [takeover, setTakeover] = useState<ProcessedTakeoverData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Calculate derived state
  const now = Math.floor(Date.now() / 1000);
  const endTime = takeover ? parseInt(takeover.endTime) : 0;
  const isActive = takeover?.status === 'active' && now < endTime;
  const isExpired = now >= endTime;
  const isReadyToFinalize = takeover && !takeover.isFinalized && (takeover.isGoalMet || isExpired);
  const isAuthority = takeover && publicKey && takeover.authority === publicKey.toString();
  const canContribute = isActive && !takeover?.isFinalized && publicKey;
  const statusConfig = takeover ? getStatusConfig(takeover.status) : null;
  const timeLeft = Math.max(0, endTime - now);

  // Get the actual goal amount - prioritize token_amount_target, then calculated_min_amount, then min_amount
  const getGoalAmount = () => {
    if (!takeover) return 0;
    
    if (takeover.tokenAmountTarget && parseFloat(takeover.tokenAmountTarget) > 0) {
      return parseFloat(takeover.tokenAmountTarget);
    }
    
    if (takeover.calculatedMinAmount && parseFloat(takeover.calculatedMinAmount) > 0) {
      return parseFloat(takeover.calculatedMinAmount);
    }
    
    return parseFloat(takeover.minAmount || '0');
  };

  const goalAmount = getGoalAmount();
  const totalContributed = parseFloat(takeover?.totalContributed || '0');
  const progressPercent = goalAmount > 0 ? Math.min(100, (totalContributed / goalAmount) * 100) : 0;
  const isGoalMet = totalContributed >= goalAmount;

  // Fetch takeover details
  const fetchTakeoverDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log("🔄 Fetching takeover details for address:", takeoverAddress);
      
      // Try multiple API strategies
      let takeover: ProcessedTakeoverData | null = null;
      let apiUsed = 'unknown';
      
      // Strategy 1: Try fetching with address filter
      try {
        console.log("🔄 Trying filtered API endpoint...");
        const response = await fetch(`/api/takeovers?address=${takeoverAddress}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store'
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log("✅ Filtered API response:", data);
          
          if (data.success && data.data?.takeovers?.length > 0) {
            takeover = data.data.takeovers[0];
            apiUsed = 'filtered';
            console.log("✅ Found takeover via filtered API");
          }
        } else {
          console.log("❌ Filtered API failed:", response.status, response.statusText);
        }
      } catch (filterError) {
        console.log("❌ Filtered API error:", filterError);
      }
      
      // Strategy 2: Try simple endpoint as fallback
      if (!takeover) {
        try {
          console.log("🔄 Trying simple API endpoint...");
          const response = await fetch(`/api/simple-takeovers?address=${takeoverAddress}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store'
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log("✅ Simple API response:", data);
            
            if (data.success && data.data?.takeovers?.length > 0) {
              takeover = data.data.takeovers[0];
              apiUsed = 'simple';
              console.log("✅ Found takeover via simple API");
            }
          } else {
            console.log("❌ Simple API failed:", response.status, response.statusText);
          }
        } catch (simpleError) {
          console.log("❌ Simple API error:", simpleError);
        }
      }

      if (!takeover) {
        throw new Error(`Takeover not found with address: ${takeoverAddress}`);
      }
      
      // Process the takeover data
      const processedTakeover: ProcessedTakeoverData = {
        ...takeover,
        isBillionScale: !!(takeover.v1TotalSupply || takeover.rewardRateBp || takeover.tokenAmountTarget),
        isGoalMet,
        progressPercent,
      };
      
      setTakeover(processedTakeover);
      console.log(`✅ Successfully loaded takeover via ${apiUsed}:`, {
        address: processedTakeover.address,
        tokenName: processedTakeover.tokenName,
        status: processedTakeover.status,
        isBillionScale: processedTakeover.isBillionScale,
        goalAmount,
        isGoalMet,
      });
      
    } catch (error: any) {
      console.error("❌ Error fetching takeover:", error);
      setError(error.message || 'Failed to load takeover details');
    } finally {
      setLoading(false);
    }
  };

  // Handle finalization (for authority only)
  const handleFinalize = async () => {
    if (!publicKey || !takeover || !isAuthority) {
      toast({
        title: "Error",
        description: "Only the authority can finalize this takeover",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const isSuccessful = isGoalMet;
      
      const response = await fetch('/api/takeovers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: takeover.address,
          is_finalized: true,
          is_successful: isSuccessful,
        }),
      });
      
      if (response.ok) {
        toast({
          title: "Success! 🎉",
          description: `Takeover finalized as ${isSuccessful ? 'successful' : 'failed'}`,
        });
        await fetchTakeoverDetails();
      } else {
        throw new Error('Failed to finalize takeover');
      }
    } catch (error: any) {
      console.error("Finalization error:", error);
      toast({
        title: "Finalization Failed",
        description: error.message || "Failed to finalize takeover",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchTakeoverDetails();
  }, [takeoverAddress]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ToastContainer />
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">Loading takeover details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ToastContainer />
        <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-6">
          <div className="text-center">
            <div className="text-red-600 dark:text-red-400 text-6xl mb-4">⚠️</div>
            <p className="text-red-600 dark:text-red-400 text-lg font-semibold">Error Loading Takeover</p>
            <p className="text-gray-600 dark:text-gray-400 mt-2">{error}</p>
            <button 
              onClick={fetchTakeoverDetails}
              className="mt-4 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!takeover) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ToastContainer />
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400">Takeover not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <ToastContainer />

      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {takeover.tokenName || 'Unknown Token'} Takeover
          </h1>
          {statusConfig && (
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusConfig.bg} ${statusConfig.color}`}>
              {statusConfig.label}
            </span>
          )}
        </div>
        <p className="text-gray-600 dark:text-gray-400 font-mono text-sm">
          {takeoverAddress}
        </p>
      </div>

      {/* Main Stats Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Progress & Stats</span>
            {takeover.isBillionScale && (
              <span className="text-sm px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded-full">
                🌊 Billion-Scale
              </span>
            )}
          </CardTitle>
          <CardDescription>
            Goal: {formatAmount(goalAmount / 1_000_000)}M tokens
            {timeLeft > 0 && ` • ${formatTimeLeft(timeLeft)} remaining`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{formatAmount(totalContributed / 1_000_000)}M / {formatAmount(goalAmount / 1_000_000)}M tokens</span>
            </div>
            <Progress value={progressPercent} className="h-3" />
            <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
              <span>{progressPercent.toFixed(1)}% complete</span>
              <span>{takeover.contributorCount} contributor{takeover.contributorCount !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Goal Status */}
          {isGoalMet && (
            <div className="p-4 bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-lg">
              <p className="text-green-800 dark:text-green-200 font-medium flex items-center">
                🎯 Goal Reached! {isReadyToFinalize && isAuthority && "Ready to finalize."}
              </p>
            </div>
          )}

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">Reward Rate</p>
              <p className="font-bold text-gray-900 dark:text-gray-100">
                {takeover.rewardRateBp 
                  ? `${(takeover.rewardRateBp / 100).toFixed(2)}x`
                  : `${takeover.customRewardRate}x`
                }
              </p>
            </div>
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Supply</p>
              <p className="font-bold text-gray-900 dark:text-gray-100">
                {takeover.v1TotalSupply 
                  ? formatAmount(takeover.v1TotalSupply)
                  : 'Unknown'
                }
              </p>
            </div>
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">Start Date</p>
              <p className="font-bold text-gray-900 dark:text-gray-100">
                {takeover.created_at 
                  ? new Date(takeover.created_at).toLocaleDateString()
                  : 'Unknown'
                }
              </p>
            </div>
            <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">Status</p>
              <p className="font-bold text-gray-900 dark:text-gray-100">
                {takeover.isFinalized 
                  ? (takeover.isSuccessful ? 'Successful' : 'Failed')
                  : (isActive ? 'Active' : 'Ended')
                }
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contribution Section */}
      {canContribute && (
        <WorkingContributionForm
          takeoverAddress={takeoverAddress}
          tokenName={takeover.tokenName || 'Unknown Token'}
          minAmount={takeover.minAmount || '0'}
          endTime={endTime}
          isFinalized={takeover.isFinalized}
          vault={takeover.vault}
          v1TokenMint={takeover.v1_token_mint}
          totalContributed={takeover.totalContributed}
          calculatedMinAmount={takeover.calculatedMinAmount}
          maxSafeTotalContribution={takeover.maxSafeTotalContribution}
        />
      )}

      {/* Authority Actions */}
      {isReadyToFinalize && isAuthority && (
        <Card>
          <CardHeader>
            <CardTitle>Authority Actions</CardTitle>
            <CardDescription>
              As the takeover authority, you can finalize this takeover
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={handleFinalize}
              className="w-full"
              variant={isGoalMet ? "default" : "secondary"}
            >
              Finalize as {isGoalMet ? 'Successful' : 'Failed'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Takeover Details */}
      <Card>
        <CardHeader>
          <CardTitle>Takeover Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Authority</p>
                <p className="font-mono text-sm break-all text-gray-900 dark:text-gray-100">{takeover.authority}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Token Mint</p>
                <p className="font-mono text-sm break-all text-gray-900 dark:text-gray-100">{takeover.v1_token_mint}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Vault</p>
                <p className="font-mono text-sm break-all text-gray-900 dark:text-gray-100">{takeover.vault}</p>
              </div>
              {takeover.v2TokenMint && (
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">V2 Token Mint</p>
                  <p className="font-mono text-sm break-all text-gray-900 dark:text-gray-100">{takeover.v2TokenMint}</p>
                </div>
              )}
            </div>
            
            <div className="space-y-4">
              {takeover.isBillionScale && (
                <>
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Token Amount Target</p>
                    <p className="text-sm text-gray-900 dark:text-gray-100">
                      {formatAmount(goalAmount / 1_000_000)}M tokens
                    </p>
                  </div>
                  {takeover.maxSafeTotalContribution && (
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Max Safe Contribution</p>
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {formatAmount(takeover.maxSafeTotalContribution)} tokens
                      </p>
                    </div>
                  )}
                  {takeover.v1MarketPriceLamports && (
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">V1 Market Price</p>
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {formatAmount(takeover.v1MarketPriceLamports)} lamports
                      </p>
                    </div>
                  )}
                </>
              )}
              
              {takeover.jupiterSwapCompleted !== undefined && (
                <div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">Jupiter Integration</p>
                  <div className="text-sm space-y-1">
                    <div className={takeover.jupiterSwapCompleted ? "text-green-600 dark:text-green-400" : "text-gray-500"}>
                      {takeover.jupiterSwapCompleted ? "✅" : "⏳"} Swap: {takeover.jupiterSwapCompleted ? "Completed" : "Pending"}
                    </div>
                    <div className={takeover.lpCreated ? "text-green-600 dark:text-green-400" : "text-gray-500"}>
                      {takeover.lpCreated ? "✅" : "⏳"} LP: {takeover.lpCreated ? "Created" : "Pending"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-center space-x-4">
        <Link href="/takeovers" className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          ← Back to All Takeovers
        </Link>
        <Link href="/claims" className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
          View Claims →
        </Link>
      </div>
    </div>
  );
}