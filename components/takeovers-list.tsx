"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/loading-spinner"
import Link from "next/link"

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
  customRewardRate: number;
  status: 'active' | 'ended' | 'successful' | 'failed' | 'goal_reached';
  progressPercentage: number;
  created_at: string;
  tokenName: string;
}

export function TakeoversList() {
  const [takeovers, setTakeovers] = useState<Takeover[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTakeovers = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetch('/api/takeovers', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (!response.ok) {
        throw new Error('Failed to fetch takeovers')
      }
      
      const data = await response.json()
      setTakeovers(data.takeovers || [])
      
    } catch (error: any) {
      console.error('Error fetching takeovers:', error)
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTakeovers()
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
            <Button onClick={fetchTakeovers}>Retry</Button>
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

  return (
    <div className="w-full max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Takeover Campaigns</h2>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{takeovers.length} campaign{takeovers.length !== 1 ? 's' : ''}</span>
          <Button onClick={fetchTakeovers} variant="outline" size="sm">
            Refresh
          </Button>
        </div>
      </div>
      
      <div className="grid gap-6">
        {takeovers.map((takeover) => {
          const now = Math.floor(Date.now() / 1000)
          const endTime = parseInt(takeover.endTime)
          const isActive = takeover.status === 'active'
          const isEnded = takeover.status === 'ended'
          const isGoalReached = takeover.status === 'goal_reached'
          const isFinalized = takeover.isFinalized

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
            } else {
              timeLeft = `${minutes}m remaining`
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
                  <div>
                    <span className="text-lg">{takeover.tokenName} Takeover</span>
                    <div className="text-sm text-gray-500 font-normal mt-1">
                      Token: {takeover.tokenName}
                      <br />
                      <span className="font-mono text-xs">{takeover.v1_token_mint.slice(0, 8)}...{takeover.v1_token_mint.slice(-4)}</span>
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
                      <div className="text-sm font-medium">{takeover.customRewardRate}x</div>
                    </div>
                  </div>
                </div>
              </CardContent>
              
              <CardFooter>
                {isFinalized ? (
                  <Link href={`/claim/${takeover.address}`} className="w-full">
                    <Button variant="outline" className="w-full hover:bg-green-50 hover:border-green-300">
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