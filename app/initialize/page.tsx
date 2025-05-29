"use client"

import { useState } from "react"
import { useWallet, useConnection } from "@solana/wallet-adapter-react"
import { PublicKey } from "@solana/web3.js"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { LoadingSpinner } from "@/components/loading-spinner"
import { TREASURY_ADDRESS } from "@/lib/constants"

export default function InitializePage() {
  const { connection } = useConnection()
  const wallet = useWallet()
  const { publicKey, sendTransaction } = wallet
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [minAmount, setMinAmount] = useState("")
  const [duration, setDuration] = useState("")
  const [rewardRate, setRewardRate] = useState("")
  const [v1MintAddress, setV1MintAddress] = useState("")

  const handleInitialize = async () => {
    if (!publicKey || !minAmount || !duration || !rewardRate || !v1MintAddress) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      })
      return
    }

    try {
      setLoading(true)

      // Validate inputs
      const minAmountValue = Number.parseFloat(minAmount)
      const durationValue = Number.parseInt(duration)
      const rewardRateValue = Number.parseFloat(rewardRate)

      if (isNaN(minAmountValue) || minAmountValue <= 0) {
        throw new Error("Invalid minimum amount")
      }

      if (isNaN(durationValue) || durationValue <= 0 || durationValue > 30) {
        throw new Error("Invalid duration (must be between 1-30 days)")
      }

      if (isNaN(rewardRateValue) || rewardRateValue <= 0) {
        throw new Error("Invalid reward rate")
      }

      let v1MintPublicKey: PublicKey
      try {
        v1MintPublicKey = new PublicKey(v1MintAddress)
      } catch (e) {
        throw new Error("Invalid V1 token mint address")
      }

      // In a real app, you would create and send a transaction to call the initialize instruction
      // This is just a mock for the UI
      toast({
        title: "Takeover initialized",
        description: "Your takeover campaign has been created successfully.",
      })

      setLoading(false)
    } catch (error: any) {
      console.error("Error initializing:", error)
      toast({
        title: "Initialization failed",
        description: error.message || "There was an error initializing the takeover.",
        variant: "destructive",
      })
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Initialize Takeover Campaign</CardTitle>
          <CardDescription>Create a new community takeover campaign to migrate from V1 to V2 tokens</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!publicKey ? (
            <div className="text-center p-6">
              <p className="mb-4">Connect your wallet to initialize a takeover</p>
              <Button variant="outline" onClick={() => wallet.connect()}>
                Connect Wallet
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="v1Mint">V1 Token Mint Address</Label>
                <Input
                  id="v1Mint"
                  placeholder="Enter V1 token mint address"
                  value={v1MintAddress}
                  onChange={(e) => setV1MintAddress(e.target.value)}
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  The address of the V1 token mint that will be migrated
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="minAmount">Minimum Amount</Label>
                <Input
                  id="minAmount"
                  type="number"
                  placeholder="Enter minimum amount of tokens"
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                  disabled={loading}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  The minimum amount of V1 tokens required for a successful takeover
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration">Duration (Days)</Label>
                <Input
                  id="duration"
                  type="number"
                  placeholder="Enter duration in days (1-30)"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  disabled={loading}
                  min="1"
                  max="30"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  The duration of the takeover campaign in days (max 30)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="rewardRate">Custom Reward Rate</Label>
                <Input
                  id="rewardRate"
                  type="number"
                  placeholder="Enter custom reward rate"
                  value={rewardRate}
                  onChange={(e) => setRewardRate(e.target.value)}
                  disabled={loading}
                  step="0.01"
                  min="0.01"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  The custom reward rate for V2 token distribution
                </p>
              </div>

              <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
                <div className="text-sm text-gray-500 dark:text-gray-400">Treasury Address</div>
                <div className="text-sm font-mono mt-1 break-all">{TREASURY_ADDRESS}</div>
              </div>
            </>
          )}
        </CardContent>
        <CardFooter>
          {publicKey && (
            <Button
              onClick={handleInitialize}
              disabled={loading || !minAmount || !duration || !rewardRate || !v1MintAddress}
              className="w-full"
            >
              {loading ? <LoadingSpinner /> : "Initialize Takeover"}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
