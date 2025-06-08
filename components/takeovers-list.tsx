// Updated takeovers-list.tsx with basis points support
"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/loading-spinner"
import { useToast } from "@/components/ui/use-toast"
import Link from "next/link"

// 🔥 UPDATED: Reward rate utility functions
class RewardRateUtils {
  static toBasisPoints(decimal: number): number {
    return Math.round(decimal * 100);
  }
  
  static toDecimal(basisPoints: number): number {
    return basisPoints / 100.0;
  }
  
  static isValid(decimal: number): boolean {
    return decimal >= 0.5 && decimal <= 10.0;
  }
  
  static formatRate(decimal: number): string {
    return `${decimal.toFixed(1)}x`;
  }
  
  // 🔥 SAFE PARSING: Handle both old (f64) and new (u16) formats
  static parseRewardRate(takeover: any): number {
    // Check for new basis points format first
    if (takeover.rewardRateBp !== undefined && typeof takeover.rewardRateBp === 'number') {
      const decimal = this.toDecimal(takeover.rewardRateBp);
      console.log(`✅ Using basis points: ${takeover.rewardRateBp}bp = ${decimal}x for ${takeover.tokenName}`);
      return decimal;
    }
    
    // Check for old f64 format (might be corrupted)
    if (takeover.customRewardRate !== undefined) {
      if (typeof takeover.customRewardRate === 'number' && 
          isFinite(takeover.customRewardRate) && 
          this.isValid(takeover.customRewardRate)) {
        console.log(`✅ Using f64: ${takeover.customRewardRate}x for ${takeover.tokenName}`);
        return takeover.customRewardRate;
      } else {
        console.warn(`🚨 Corrupted f64 for ${takeover.tokenName}:`, takeover.customRewardRate);
        return 1.5; // Safe fallback
      }
    }
    
    // Fallback for missing data
    console.log(`🔧 No reward rate found for ${takeover.tokenName}, using 1.5x`);
    return 1.5;
  }
}

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
  hasV2Mint: boolean;
  v2TokenMint?: string;
  // 🔥 UPDATED: Handle both reward rate formats
  rewardRateBp?: number;        // New format (u16 basis points)
  customRewardRate?: number;    // Old format (f64) - might be corrupted
  status: 'active' | 'ended' | 'successful' | 'failed' | 'goal_reached';
  progressPercentage: number;
  created_at: string;
  tokenName: string;
  imageUrl?: string;
  finalize_tx?: string;
}

export function TakeoversList() {
  const [takeovers, setTakeovers] = useState<Takeover[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [debugMode, setDebugMode] = useState(false)
  const { toast } = useToast()

  const fetchTakeovers = async () => {
    try {
      setLoading(true)
      setError(null)
      
      console.log('🔄 Fetching takeovers...')
      
      const response = await fetch('/api/takeovers', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const data = await response.json()
      console.log('📊 Received takeovers data:', data)
      
      if (!data.takeovers || !Array.isArray(data.takeovers)) {
        throw new Error('Invalid response format: missing takeovers array')
      }
      
      setTakeovers(data.takeovers || [])
      
      // 🔥 UPDATED: Log reward rate parsing for debugging
      data.takeovers.forEach((takeover: Takeover) => {
        const parsedRate = RewardRateUtils.parseRewardRate(takeover);
        if (takeover.customRewardRate !== parsedRate) {
          console.log(`🔧 Fixed reward rate for ${takeover.tokenName}: ${takeover.customRewardRate} → ${parsedRate}`);
        }
      });
      
      // Log debug info
      const now = Math.floor(Date.now() / 1000)
      const readyCount = data.takeovers.filter((t: Takeover) => {
        if (t.isFinalized) return false
        const endTime = parseInt(t.endTime)
        const totalContributed = BigInt(t.totalContributed)
        const minAmount = BigInt(t.minAmount)
        return totalContributed >= minAmount || now >= endTime
      }).length
      
      console.log(`✅ Loaded ${data.takeovers.length} takeovers, ${readyCount} ready for finalization`)
      
    } catch (error: any) {
      console.error('❌ Error fetching takeovers:', error)
      setError(error.message)
      toast({
        title: "Error Loading Takeovers",
        description: error.message,
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTakeovers()
  }, [])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchTakeovers, 30000)
    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-64 space-y-4">
        <LoadingSpinner />
        <span className="text-gray-600">Loading takeovers...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center p-8 max-w-4xl mx-auto">
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-xl font-medium mb-2 text-red-600">Error Loading Takeovers</h3>
            <p className="text-gray-500 mb-4">{error}</p>
            <div className="space-x-2">
              <Button onClick={fetchTakeovers}>Retry</Button>
              <Button variant="outline" onClick={() => setDebugMode(!debugMode)}>
                {debugMode ? 'Hide' : 'Show'} Debug
              </Button>
            </div>
            {debugMode && (
              <div className="mt-4 p-4 bg-gray-100 rounded text-left text-sm">
                <pre>{JSON.stringify({ error, timestamp: new Date().toISOString() }, null, 2)}</pre>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  if (takeovers.length === 0) {
    return (
      <div className="text-center p-8 max-w-4xl mx-auto">
        <Card>
          <CardContent className="pt-6">
            <h3 className="text-xl font-medium mb-2">No Takeovers Found</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              No takeover campaigns exist yet. Create the first one!
            </p>
            <Link href="/create">
              <Button>Create New Takeover</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Count different statuses for debugging
  const now = Math.floor(Date.now() / 1000)
  const statusCounts = {
    finalized: takeovers.filter(t => t.isFinalized).length,
    successful: takeovers.filter(t => t.isFinalized && t.isSuccessful).length,
    failed: takeovers.filter(t => t.isFinalized && !t.isSuccessful).length,
    readyToFinalize: takeovers.filter(t => {
      if (t.isFinalized) return false
      const endTime = parseInt(t.endTime)
      const totalContributed = BigInt(t.totalContributed)
      const minAmount = BigInt(t.minAmount)
      return totalContributed >= minAmount || now >= endTime
    }).length,
    active: takeovers.filter(t => !t.isFinalized && t.status === 'active').length
  }

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Takeover Campaigns</h2>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{takeovers.length} campaign{takeovers.length !== 1 ? 's' : ''}</span>
          <Button onClick={() => setDebugMode(!debugMode)} variant="ghost" size="sm">
            🐛 Debug
          </Button>
          <Button onClick={fetchTakeovers} variant="outline" size="sm">
            Refresh
          </Button>
        </div>
      </div>

      {/* Manual Finalization Info */}
      {statusCounts.readyToFinalize > 0 && (
        <Card className="mb-6 border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="text-lg">⚡ Manual Finalization Required</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-600 mb-4">
              {statusCounts.readyToFinalize} takeover{statusCounts.readyToFinalize !== 1 ? 's' : ''} ready for finalization. 
              Takeover creators must manually finalize their campaigns when they're ready.
            </p>
            <div className="text-xs text-gray-500">
              💡 Each takeover can only be finalized by its creator (the authority who initialized it).
            </div>
          </CardContent>
        </Card>
      )}

      {/* Debug Info Panel */}
      {debugMode && (
        <Card className="mb-6 border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="text-lg">🐛 Debug Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div>
                <div className="font-medium">Total</div>
                <div className="text-lg">{takeovers.length}</div>
              </div>
              <div>
                <div className="font-medium">Active</div>
                <div className="text-lg text-green-600">{statusCounts.active}</div>
              </div>
              <div>
                <div className="font-medium">Ready to Finalize</div>
                <div className="text-lg text-yellow-600">{statusCounts.readyToFinalize}</div>
              </div>
              <div>
                <div className="font-medium">Successful</div>
                <div className="text-lg text-green-600">{statusCounts.successful}</div>
              </div>
              <div>
                <div className="font-medium">Failed</div>
                <div className="text-lg text-red-600">{statusCounts.failed}</div>
              </div>
            </div>
            <div className="mt-4 text-xs text-gray-600">
              Current timestamp: {now} ({new Date().toLocaleString()})
            </div>
          </CardContent>
        </Card>
      )}
      
      <div className="grid gap-6">
        {takeovers.map((takeover) => {
          const now = Math.floor(Date.now() / 1000)
          const endTime = parseInt(takeover.endTime)
          const isActive = takeover.status === 'active'
          const isEnded = takeover.status === 'ended'
          const isGoalReached = takeover.status === 'goal_reached'
          const isFinalized = takeover.isFinalized

          // 🔥 UPDATED: Parse reward rate safely
          const safeRewardRate = RewardRateUtils.parseRewardRate(takeover);

          // Format time remaining
          let timeLeft = ""
          let statusColor = ""
          
          if (isFinalized) {
            timeLeft = takeover.isSuccessful ? "✅ Successful" : "❌ Failed"
            statusColor = takeover.isSuccessful 
              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
              : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
          } else if (isGoalReached) {
            timeLeft = "🎯 Goal Reached - Ready to Finalize"
            statusColor = "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
          } else if (isActive) {
            const diff = endTime - now
            const days = Math.floor(diff / 86400)
            const hours = Math.floor((diff % 86400) / 3600)
            const minutes = Math.floor((diff % 3600) / 60)
            
            if (days > 0) {
              timeLeft = `${days}d ${hours}h remaining`
            } else if (hours > 0) {
              timeLeft = `${hours}h ${minutes}m remaining`
            } else if (minutes > 0) {
              timeLeft = `${minutes}m remaining`
            } else {
              timeLeft = "⏰ Ending soon"
            }
            statusColor = "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
          } else {
            timeLeft = "⏰ Ended - Awaiting Finalization"
            statusColor = "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
          }

          return (
            <Card key={takeover.id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    {/* Token Image */}
                    {takeover.imageUrl ? (
                      <img 
                        src={takeover.imageUrl} 
                        alt={takeover.tokenName}
                        className="w-12 h-12 rounded-full object-cover border-2 border-gray-200"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-lg">
                        {takeover.tokenName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <span className="text-lg">{takeover.tokenName} Takeover</span>
                      <div className="text-sm text-gray-500 font-normal mt-1">
                        Token: {takeover.tokenName}
                        <br />
                        <span className="font-mono text-xs">{takeover.v1_token_mint.slice(0, 8)}...{takeover.v1_token_mint.slice(-4)}</span>
                        {debugMode && (
                          <div className="text-xs mt-1">
                            ID: {takeover.id} | Status: {takeover.status} | Authority: {takeover.authority.slice(0, 4)}...
                            {takeover.finalize_tx && (
                              <div>Finalize TX: {takeover.finalize_tx.slice(0, 8)}...</div>
                            )}
                            {/* 🔥 UPDATED: Debug reward rate info */}
                            <div className="mt-1 p-1 bg-yellow-100 rounded text-xs">
                              Reward Rate Debug:
                              {takeover.rewardRateBp && <div>• BP: {takeover.rewardRateBp} → {RewardRateUtils.toDecimal(takeover.rewardRateBp)}x</div>}
                              {takeover.customRewardRate && <div>• F64: {takeover.customRewardRate}</div>}
                              <div>• Used: {safeRewardRate}x</div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full ${statusColor}`}>
                    {isActive ? "🟢 Active" : 
                     isGoalReached ? "🎯 Goal Reached" :
                     isEnded ? "⏰ Ended" : 
                     timeLeft.includes("✅") ? "✅ Success" : "❌ Failed"}
                  </span>
                </CardTitle>
                <CardDescription>
                  Created by {takeover.authority.slice(0, 6)}...{takeover.authority.slice(-4)}
                </CardDescription>
              </CardHeader>
              
              <CardContent className="pb-4">
                <div className="space-y-4">
                  {/* Progress Section */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">Funding Progress</span>
                      <span className="text-gray-600">
                        {(parseInt(takeover.totalContributed) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} / {(parseInt(takeover.minAmount) / 1_000_000).toLocaleString()} {takeover.tokenName}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <Progress value={takeover.progressPercentage} className="h-2" />
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>{takeover.progressPercentage.toFixed(1)}% complete</span>
                        <span>Goal: {(parseInt(takeover.minAmount) / 1_000_000).toLocaleString()} {takeover.tokenName}</span>
                      </div>
                    </div>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg text-center">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Time</div>
                      <div className="text-sm font-medium">{timeLeft}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg text-center">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Contributors</div>
                      <div className="text-sm font-medium">{takeover.contributorCount}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg text-center">
                      <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Reward Rate</div>
                      <div className="text-sm font-medium">
                        {RewardRateUtils.formatRate(safeRewardRate)}
                        {/* 🔥 UPDATED: Show if rate was fixed */}
                        {takeover.customRewardRate && 
                         takeover.customRewardRate !== safeRewardRate && (
                          <span className="text-xs text-yellow-600 ml-1">⚠️</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* V2 Token Info for Successful Takeovers */}
                  {isFinalized && takeover.isSuccessful && takeover.v2TokenMint && (
                    <div className="bg-green-50 border border-green-200 p-3 rounded-lg">
                      <div className="text-sm font-medium text-green-800 mb-1">V2 Token Created</div>
                      <div className="text-xs font-mono text-green-600">
                        {takeover.v2TokenMint}
                      </div>
                      {/* 🔥 UPDATED: Show V2 supply calculation */}
                      <div className="text-xs text-green-700 mt-1">
                        V2 Supply: {((parseInt(takeover.totalContributed) / 1_000_000) * safeRewardRate).toLocaleString()} tokens
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
              
              <CardFooter>
                {isFinalized ? (
                  <Link href={`/claim/${takeover.address}`} className="w-full">
                    <Button 
                      variant="outline" 
                      className={`w-full ${takeover.isSuccessful 
                        ? 'hover:bg-green-50 hover:border-green-300' 
                        : 'hover:bg-red-50 hover:border-red-300'
                      }`}
                    >
                      {takeover.isSuccessful ? "🎉 Claim V2 Tokens" : "💰 Claim Refund"}
                    </Button>
                  </Link>
                ) : (
                  <Link href={`/takeover/${takeover.address}`} className="w-full">
                    <Button variant="outline" className="w-full hover:bg-purple-50 hover:border-purple-300">
                      View Details & {isActive || isGoalReached ? "Contribute" : "Finalize"}
                    </Button>
                  </Link>
                )}
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </div>
  )
}