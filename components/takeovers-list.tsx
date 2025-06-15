// components/takeovers-list.tsx - Complete list component for bigint schema
"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  formatAmount, 
  formatDuration,
  getStatusConfig,
  ProcessedTakeoverData,
  calculateProgressPercentage 
} from '@/lib/utils/takeover-calculations';

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
          className={`p-4 rounded-lg shadow-lg max-w-sm transition-all duration-300 ${
            toast.variant === 'destructive' 
              ? 'bg-red-100 border-red-400 text-red-700' 
              : 'bg-blue-100 border-blue-400 text-blue-700'
          }`}
        >
          <div className="font-semibold">{toast.title}</div>
          <div className="text-sm">{toast.description}</div>
          <button
            onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
            className="absolute top-1 right-2 text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );

  return { toast, ToastContainer };
}

// Filter component
interface FilterProps {
  filters: {
    status: string;
    billionScale: boolean;
    hasV2: boolean;
  };
  onFilterChange: (filters: any) => void;
}

function TakeoverFilters({ filters, onFilterChange }: FilterProps) {
  return (
    <div className="bg-white rounded-lg shadow p-4 mb-6">
      <h3 className="text-lg font-semibold mb-3 text-gray-900">Filters</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
          <select
            value={filters.status}
            onChange={(e) => onFilterChange({ ...filters, status: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="successful">Successful</option>
            <option value="failed">Failed</option>
            <option value="expired">Expired</option>
          </select>
        </div>
        
        <div className="flex items-center space-x-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={filters.billionScale}
              onChange={(e) => onFilterChange({ ...filters, billionScale: e.target.checked })}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-2 text-sm text-gray-700">Billion Scale Only</span>
          </label>
        </div>
        
        <div className="flex items-center space-x-4">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={filters.hasV2}
              onChange={(e) => onFilterChange({ ...filters, hasV2: e.target.checked })}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="ml-2 text-sm text-gray-700">Has V2 Migration</span>
          </label>
        </div>
      </div>
    </div>
  );
}

// Takeover card component
interface TakeoverCardProps {
  takeover: ProcessedTakeoverData;
}

function TakeoverCard({ takeover }: TakeoverCardProps) {
  const statusConfig = getStatusConfig(takeover.status);
  const progressPercentage = calculateProgressPercentage(
    takeover.totalContributed, 
    takeover.effectiveMinAmount
  );

  return (
    <Link href={`/takeover/${takeover.address}`}>
      <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-all duration-200 cursor-pointer h-full p-6 border border-gray-200 hover:border-blue-300">
        {/* Header */}
        <div className="flex justify-between items-start mb-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              {takeover.imageUrl && (
                <img 
                  src={takeover.imageUrl} 
                  alt={takeover.tokenName}
                  className="w-8 h-8 rounded-full"
                />
              )}
              <h3 className="text-lg font-semibold truncate text-gray-900">
                {takeover.tokenName}
              </h3>
            </div>
            <p className="text-xs text-gray-500 font-mono truncate">
              {takeover.address}
            </p>
          </div>
          
          <div className="flex flex-col items-end gap-1 ml-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${statusConfig.bgColor} ${statusConfig.color}`}>
              <span>{statusConfig.icon}</span>
              {takeover.status.toUpperCase()}
            </span>
            {takeover.isBillionScale && (
              <span className="px-2 py-1 text-xs border border-purple-300 rounded-full text-purple-700 bg-purple-50">
                Billion Scale
              </span>
            )}
            {takeover.hasV2Mint && (
              <span className="px-2 py-1 text-xs border border-green-300 rounded-full text-green-700 bg-green-50">
                V2 Ready
              </span>
            )}
          </div>
        </div>
        
        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Progress</span>
            <span>{progressPercentage.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all duration-300 ${
                takeover.isGoalMet ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min(progressPercentage, 100)}%` }}
            ></div>
          </div>
        </div>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div>
            <p className="text-gray-600">Contributed</p>
            <p className="font-semibold text-gray-900">
              {formatAmount(takeover.totalContributed)}
            </p>
          </div>
          <div>
            <p className="text-gray-600">Target</p>
            <p className="font-semibold text-gray-900">
              {formatAmount(takeover.effectiveMinAmount)}
            </p>
          </div>
          <div>
            <p className="text-gray-600">Contributors</p>
            <p className="font-semibold text-gray-900">{takeover.contributorCount}</p>
          </div>
          <div>
            <p className="text-gray-600">Reward</p>
            <p className="font-semibold text-gray-900">
              {takeover.isBillionScale && takeover.rewardRateBp 
                ? `${(takeover.rewardRateBp / 100).toFixed(2)}%`
                : `${takeover.customRewardRate}x`
              }
            </p>
          </div>
        </div>

        {/* Footer Info */}
        <div className="flex justify-between items-center text-xs text-gray-500 pt-3 border-t border-gray-100">
          <div>
            {takeover.status === 'active' && takeover.timeRemaining && takeover.timeRemaining > 0 ? (
              <span>⏰ {formatDuration(takeover.timeRemaining)} left</span>
            ) : takeover.created_at ? (
              <span>📅 {new Date(takeover.created_at).toLocaleDateString()}</span>
            ) : (
              <span>📅 Unknown date</span>
            )}
          </div>
          
          {takeover.canFinalize && (
            <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-medium">
              Ready to finalize
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

// Statistics component
interface StatsProps {
  takeovers: ProcessedTakeoverData[];
}

function TakeoverStats({ takeovers }: StatsProps) {
  const stats = {
    total: takeovers.length,
    active: takeovers.filter(t => t.status === 'active').length,
    successful: takeovers.filter(t => t.status === 'successful').length,
    billionScale: takeovers.filter(t => t.isBillionScale).length,
    withV2: takeovers.filter(t => t.hasV2Mint).length,
    readyToFinalize: takeovers.filter(t => t.canFinalize).length,
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 mb-6">
      <h3 className="text-lg font-semibold mb-4 text-gray-900">Overview</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
          <p className="text-sm text-gray-600">Total</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-green-600">{stats.active}</p>
          <p className="text-sm text-gray-600">Active</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-emerald-600">{stats.successful}</p>
          <p className="text-sm text-gray-600">Successful</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-purple-600">{stats.billionScale}</p>
          <p className="text-sm text-gray-600">Billion Scale</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-indigo-600">{stats.withV2}</p>
          <p className="text-sm text-gray-600">With V2</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-orange-600">{stats.readyToFinalize}</p>
          <p className="text-sm text-gray-600">Ready</p>
        </div>
      </div>
    </div>
  );
}

// Main component
export function TakeoversList() {
  const [takeovers, setTakeovers] = useState<ProcessedTakeoverData[]>([])
  const [filteredTakeovers, setFilteredTakeovers] = useState<ProcessedTakeoverData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [debugMode, setDebugMode] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [filters, setFilters] = useState({
    status: '',
    billionScale: false,
    hasV2: false,
  })
  const [showStats, setShowStats] = useState(true)
  const { toast, ToastContainer } = useToast()

  // Apply filters to takeovers
  useEffect(() => {
    let filtered = [...takeovers];
    
    if (filters.status) {
      filtered = filtered.filter(t => t.status === filters.status);
    }
    
    if (filters.billionScale) {
      filtered = filtered.filter(t => t.isBillionScale);
    }
    
    if (filters.hasV2) {
      filtered = filtered.filter(t => t.hasV2Mint);
    }
    
    setFilteredTakeovers(filtered);
  }, [takeovers, filters]);

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
      
      // Try multiple API strategies
      let response;
      let data;
      let apiUsed = 'unknown';
      
      // Strategy 1: Try main API endpoint first
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
      
      // The data should already be processed if coming from the API routes
      setTakeovers(takeoversArray)
      setRetryCount(0); // Reset retry count on success
      
      console.log(`✅ Loaded ${takeoversArray.length} takeovers using ${apiUsed} API`)
      
      // Count ready for finalization
      const readyCount = takeoversArray.filter((t: ProcessedTakeoverData) => t.canFinalize).length;
      
      if (readyCount > 0) {
        console.log(`✅ ${readyCount} takeovers ready for finalization`)
      }
      
      if (showToast) {
        toast({
          title: "Success",
          description: `Loaded ${takeoversArray.length} takeovers`,
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
          <h2 className="text-3xl font-bold text-gray-900">Takeovers</h2>
          <button className="px-4 py-2 bg-gray-300 text-gray-500 rounded-lg cursor-not-allowed" disabled>
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500"></div>
              Loading...
            </div>
          </button>
        </div>
        
        {/* Loading skeleton */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
                <div className="h-6 bg-gray-200 rounded w-16"></div>
              </div>
              <div className="space-y-3">
                <div className="h-2 bg-gray-200 rounded"></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="h-8 bg-gray-200 rounded"></div>
                  <div className="h-8 bg-gray-200 rounded"></div>
                  <div className="h-8 bg-gray-200 rounded"></div>
                  <div className="h-8 bg-gray-200 rounded"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ToastContainer />
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Takeovers</h2>
          <p className="text-gray-600 mt-1">
            {filteredTakeovers.length} of {takeovers.length} takeover{takeovers.length !== 1 ? 's' : ''}
            {error && retryCount < 3 && (
              <span className="text-orange-600 ml-2">
                (retrying... {retryCount + 1}/3)
              </span>
            )}
          </p>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={() => setShowStats(!showStats)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {showStats ? 'Hide Stats' : 'Show Stats'}
          </button>
          
          <button 
            onClick={() => setDebugMode(!debugMode)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {debugMode ? 'Hide Debug' : 'Debug'}
          </button>
          
          <button 
            onClick={handleRefresh}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className={`${loading ? 'animate-spin' : ''}`}>
                🔄
              </div>
              Refresh
            </div>
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && retryCount >= 3 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-center gap-3">
            <div className="text-red-600 text-2xl">⚠️</div>
            <div className="flex-1">
              <p className="font-semibold text-red-600">Failed to load takeovers</p>
              <p className="text-red-700 text-sm mt-1">{error}</p>
            </div>
            <button 
              onClick={handleRefresh}
              className="px-4 py-2 bg-red-100 border border-red-300 rounded-lg hover:bg-red-200 transition-colors text-red-700"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Debug information */}
      {debugMode && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-700 mb-2">Debug Information</h3>
          <div className="text-xs text-blue-600 space-y-1">
            <p>Total takeovers loaded: {takeovers.length}</p>
            <p>Filtered takeovers shown: {filteredTakeovers.length}</p>
            <p>Loading state: {loading.toString()}</p>
            <p>Error state: {error || 'none'}</p>
            <p>Retry count: {retryCount}</p>
            <p>Active filters: {Object.entries(filters).filter(([k,v]) => v && v !== '').map(([k,v]) => `${k}:${v}`).join(', ') || 'none'}</p>
            <p>Last fetch: {new Date().toLocaleTimeString()}</p>
          </div>
        </div>
      )}

      {/* Statistics */}
      {showStats && takeovers.length > 0 && (
        <TakeoverStats takeovers={takeovers} />
      )}

      {/* Filters */}
      {takeovers.length > 0 && (
        <TakeoverFilters filters={filters} onFilterChange={setFilters} />
      )}

      {/* Takeovers grid */}
      {filteredTakeovers.length === 0 && !loading ? (
        <div className="bg-white rounded-lg shadow p-8">
          <div className="text-center py-8">
            <div className="text-gray-400 text-6xl mb-4">📋</div>
            <p className="text-lg text-gray-600">
              {takeovers.length === 0 ? 'No takeovers found' : 'No takeovers match your filters'}
            </p>
            <p className="text-sm text-gray-500 mt-2">
              {takeovers.length === 0 
                ? 'Check back later or create a new takeover' 
                : 'Try adjusting your filters to see more results'
              }
            </p>
            {takeovers.length > 0 && (
              <button
                onClick={() => setFilters({ status: '', billionScale: false, hasV2: false })}
                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredTakeovers.map((takeover) => (
            <TakeoverCard key={takeover.id} takeover={takeover} />
          ))}
        </div>
      )}
    </div>
  )
}