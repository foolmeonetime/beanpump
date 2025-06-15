// components/takeovers-list.tsx
"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';

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
  customRewardRate: number;
  tokenName: string;
  imageUrl?: string;
  status: string;
  rewardRateBp?: number;
  calculatedMinAmount?: string;
  maxSafeTotalContribution?: string;
  targetParticipationBp?: number;
  v1MarketPriceLamports?: string;
  isBillionScale?: boolean;
  created_at: string;
}

// Simple toast notification system
function useToast() {
  const [toasts, setToasts] = useState<Array<{id: string, title: string, description: string, variant?: string}>>([]);

  const toast = ({ title, description, variant = 'default' }: {title: string, description: string, variant?: string}) => {
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
          className={`p-4 rounded-lg shadow-lg max-w-sm ${
            toast.variant === 'destructive' 
              ? 'bg-red-100 border-red-400 text-red-700' 
              : 'bg-blue-100 border-blue-400 text-blue-700'
          }`}
        >
          <div className="font-semibold">{toast.title}</div>
          <div className="text-sm">{toast.description}</div>
        </div>
      ))}
    </div>
  );

  return { toast, ToastContainer };
}

// Safe number parsing helpers
const safeParseFloat = (value: any, fallback: number = 0): number => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  
  const num = typeof value === 'string' ? parseFloat(value) : Number(value);
  
  if (isNaN(num)) {
    return fallback;
  }
  
  return num;
};

const safeParseInt = (value: any, fallback: number = 0): number => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  
  const num = typeof value === 'string' ? parseInt(value) : Number(value);
  
  if (isNaN(num)) {
    return fallback;
  }
  
  return num;
};

// Safe amount formatting for display
const formatAmount = (amount: any): string => {
  if (!amount || amount === '0') {
    return '0';
  }
  
  const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  
  if (isNaN(num)) {
    return '0';
  }
  
  // Convert from lamports to tokens (divide by 1M)
  const tokens = num / 1_000_000;
  
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  } else if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  } else {
    return tokens.toFixed(2);
  }
};

// Calculate progress percentage safely
const getProgressPercentage = (contributed: any, target: any): number => {
  const contributedNum = safeParseFloat(contributed);
  const targetNum = safeParseFloat(target);
  
  if (targetNum === 0) return 0;
  return Math.min((contributedNum / targetNum) * 100, 100);
};

// Get status badge color
const getStatusColor = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'active': return 'bg-green-100 text-green-800';
    case 'successful': return 'bg-blue-100 text-blue-800';
    case 'failed': return 'bg-red-100 text-red-800';
    case 'finalized': return 'bg-gray-100 text-gray-800';
    case 'expired': return 'bg-orange-100 text-orange-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

// Get status icon
const getStatusIcon = (status: string) => {
  switch (status?.toLowerCase()) {
    case 'active': return '🟢';
    case 'successful': return '✅';
    case 'failed': return '❌';
    case 'expired': return '⏰';
    default: return '❓';
  }
};

// Calculate takeover status
const calculateStatus = (takeover: Takeover): string => {
  const now = Math.floor(Date.now() / 1000);
  const endTime = safeParseInt(takeover.endTime);
  const minAmount = takeover.calculatedMinAmount || takeover.minAmount || "0";
  const isGoalMet = safeParseFloat(takeover.totalContributed) >= safeParseFloat(minAmount);
  
  if (takeover.isFinalized) {
    return takeover.isSuccessful ? 'successful' : 'failed';
  }
  
  if (now >= endTime) {
    return 'expired';
  }
  
  return 'active';
};

export function TakeoversList() {
  const [takeovers, setTakeovers] = useState<Takeover[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [debugMode, setDebugMode] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const { toast, ToastContainer } = useToast()

  const fetchTakeovers = async (showToast: boolean = false) => {
    try {
      setLoading(true)
      setError(null)
      
      if (showToast) {
        toast({
          title: "Refreshing",
          description: "Fetching latest takeovers...",
        });
      }
      
      console.log('🔄 Fetching takeovers...')
      
      // Strategy 1: Try main API endpoint first
      let response;
      let data;
      let apiUsed = 'unknown';
      
      try {
        console.log('🔄 Trying main API endpoint...')
        response = await fetch('/api/takeovers', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store'
        })
        
        if (response.ok) {
          data = await response.json()
          apiUsed = 'main';
          console.log('✅ Main API successful:', data)
        } else {
          throw new Error(`Main API failed: ${response.status} ${response.statusText}`)
        }
        
      } catch (mainApiError) {
        console.error('❌ Main API failed, trying simple endpoint:', mainApiError)
        
        // Strategy 2: Fallback to simple endpoint
        try {
          response = await fetch('/api/simple-takeovers', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store'
          })
          
          if (!response.ok) {
            throw new Error(`Simple API also failed: ${response.status} ${response.statusText}`)
          }
          
          data = await response.json()
          apiUsed = 'simple';
          console.log('✅ Simple API successful:', data)
          
        } catch (simpleApiError) {
          console.error('❌ Both APIs failed:', simpleApiError)
          throw new Error('All API endpoints failed. Please try again later.')
        }
      }
      
      // Handle the nested data structure
      let takeoversArray = data.data?.takeovers || data.takeovers || []
      
      if (!Array.isArray(takeoversArray)) {
        console.error('❌ Invalid response format:', data)
        throw new Error('Invalid response format: missing takeovers array')
      }
      
      // Process and calculate status for each takeover
      const processedTakeovers = takeoversArray.map((takeover: any) => {
        const processedTakeover = {
          ...takeover,
          status: calculateStatus(takeover),
          // Ensure consistent field naming
          minAmount: takeover.minAmount || takeover.min_amount || '1000000',
          startTime: takeover.startTime || takeover.start_time || '0',
          endTime: takeover.endTime || takeover.end_time || '0',
          totalContributed: takeover.totalContributed || takeover.total_contributed || '0',
          contributorCount: takeover.contributorCount || takeover.contributor_count || 0,
          isFinalized: takeover.isFinalized || takeover.is_finalized || false,
          isSuccessful: takeover.isSuccessful || takeover.is_successful || false,
          customRewardRate: takeover.customRewardRate || takeover.custom_reward_rate || 1.5,
          tokenName: takeover.tokenName || takeover.token_name || 'Unknown Token',
          imageUrl: takeover.imageUrl || takeover.image_url,
          // Billion-scale fields
          rewardRateBp: takeover.rewardRateBp || takeover.reward_rate_bp,
          calculatedMinAmount: takeover.calculatedMinAmount || takeover.calculated_min_amount,
          maxSafeTotalContribution: takeover.maxSafeTotalContribution || takeover.max_safe_total_contribution,
          isBillionScale: takeover.rewardRateBp !== undefined || takeover.reward_rate_bp !== undefined,
        };
        
        return processedTakeover;
      });
      
      setTakeovers(processedTakeovers)
      setRetryCount(0); // Reset retry count on success
      
      console.log(`✅ Loaded ${processedTakeovers.length} takeovers using ${apiUsed} API`)
      
      // Count ready for finalization
      const readyCount = processedTakeovers.filter(t => {
        const now = Math.floor(Date.now() / 1000);
        const endTime = safeParseInt(t.endTime);
        const minAmount = t.calculatedMinAmount || t.minAmount || "0";
        const isGoalMet = safeParseFloat(t.totalContributed) >= safeParseFloat(minAmount);
        const isExpired = now >= endTime;
        return !t.isFinalized && (isGoalMet || isExpired);
      }).length;
      
      if (readyCount > 0) {
        console.log(`✅ Loaded ${processedTakeovers.length} takeovers, ${readyCount} ready for finalization`)
      }
      
      if (showToast) {
        toast({
          title: "Success",
          description: `Loaded ${processedTakeovers.length} takeovers`,
        });
      }
      
    } catch (error: any) {
      console.error('💥 Error fetching takeovers:', error)
      const errorMessage = error.message || 'Failed to load takeovers'
      setError(errorMessage)
      setRetryCount(prev => prev + 1);
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false)
    }
  }

  // Auto-retry logic
  useEffect(() => {
    if (error && retryCount < 3) {
      const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 5000); // Exponential backoff, max 5s
      console.log(`🔄 Auto-retrying in ${retryDelay}ms (attempt ${retryCount + 1}/3)`);
      
      const timer = setTimeout(() => {
        fetchTakeovers(false);
      }, retryDelay);
      
      return () => clearTimeout(timer);
    }
  }, [error, retryCount]);

  useEffect(() => {
    fetchTakeovers()
  }, [])

  // Manual refresh
  const handleRefresh = () => {
    setRetryCount(0);
    fetchTakeovers(true);
  };

  if (loading && takeovers.length === 0) {
    return (
      <div className="space-y-4">
        <ToastContainer />
        
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Active Takeovers</h2>
          <button className="px-4 py-2 bg-gray-300 text-gray-500 rounded cursor-not-allowed" disabled>
            Loading...
          </button>
        </div>
        
        {/* Loading skeleton */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2 mb-4"></div>
              <div className="space-y-2">
                <div className="h-3 bg-gray-200 rounded"></div>
                <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                <div className="h-2 bg-gray-200 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ToastContainer />
      
      {/* Header with refresh and debug controls */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Active Takeovers</h2>
          <p className="text-sm text-gray-600">
            {takeovers.length} takeover{takeovers.length !== 1 ? 's' : ''} loaded
            {error && retryCount < 3 && (
              <span className="text-orange-600 ml-2">
                (retrying... {retryCount + 1}/3)
              </span>
            )}
          </p>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={() => setDebugMode(!debugMode)}
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            {debugMode ? 'Hide Debug' : 'Show Debug'}
          </button>
          
          <button 
            onClick={handleRefresh}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && retryCount >= 3 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center gap-2 text-red-600">
            <span>⚠️</span>
            <div>
              <p className="font-semibold">Failed to load takeovers</p>
              <p className="text-sm">{error}</p>
              <button 
                onClick={handleRefresh}
                className="mt-2 px-3 py-1 text-sm bg-red-100 border border-red-300 rounded hover:bg-red-200"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Debug information */}
      {debugMode && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-700 mb-2">Debug Information</h3>
          <div className="text-xs text-blue-600 space-y-1">
            <p>Takeovers loaded: {takeovers.length}</p>
            <p>Loading state: {loading.toString()}</p>
            <p>Error state: {error || 'none'}</p>
            <p>Retry count: {retryCount}</p>
            <p>Last fetch: {new Date().toLocaleTimeString()}</p>
          </div>
        </div>
      )}

      {/* Takeovers grid */}
      {takeovers.length === 0 && !loading ? (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-center py-8">
            <p className="text-lg text-gray-600">No takeovers found</p>
            <p className="text-sm text-gray-500 mt-2">
              Check back later or create a new takeover
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {takeovers.map((takeover) => {
            const minAmount = takeover.calculatedMinAmount || takeover.minAmount || "0";
            const progressPercentage = getProgressPercentage(takeover.totalContributed, minAmount);
            const isBillionScale = takeover.isBillionScale;
            
            return (
              <Link key={takeover.id} href={`/takeover/${takeover.address}`}>
                <div className="bg-white rounded-lg shadow hover:shadow-md transition-shadow cursor-pointer h-full p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-semibold truncate">
                        {takeover.tokenName}
                      </h3>
                      <p className="text-xs text-gray-500 font-mono truncate">
                        {takeover.address}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 ml-2">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${getStatusColor(takeover.status)}`}>
                        <span>{getStatusIcon(takeover.status)}</span>
                        {takeover.status.toUpperCase()}
                      </span>
                      {isBillionScale && (
                        <span className="px-2 py-1 text-xs border border-gray-300 rounded-full">
                          Billion Scale
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {/* Progress */}
                    <div>
                      <div className="flex justify-between text-sm text-gray-600 mb-1">
                        <span>Progress</span>
                        <span>{progressPercentage.toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full" 
                          style={{ width: `${progressPercentage}%` }}
                        ></div>
                      </div>
                    </div>
                    
                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-gray-600">Contributed</p>
                        <p className="font-semibold">
                          {formatAmount(takeover.totalContributed)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">Target</p>
                        <p className="font-semibold">
                          {formatAmount(minAmount)}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">Contributors</p>
                        <p className="font-semibold">{takeover.contributorCount}</p>
                      </div>
                      <div>
                        <p className="text-gray-600">Reward</p>
                        <p className="font-semibold">
                          {isBillionScale && takeover.rewardRateBp 
                            ? `${takeover.rewardRateBp} BP`
                            : `${takeover.customRewardRate}x`
                          }
                        </p>
                      </div>
                    </div>

                    {/* Time remaining */}
                    {takeover.status === 'active' && (
                      <div className="text-xs text-gray-500">
                        ⏰ Ends: {new Date(safeParseInt(takeover.endTime) * 1000).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  )
}