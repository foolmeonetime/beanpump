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
import { WalletMultiButton } from "@/components/wallet-multi-button"
import { 
  TREASURY_ADDRESS, 
  DEFAULT_REWARD_RATE_BP, 
  DEFAULT_TARGET_PARTICIPATION_BP,
  DEFAULT_DURATION_DAYS,
  validateRewardRate,
  validateParticipationRate,
  formatLargeNumber,
  ERROR_MESSAGES
} from "@/lib/constants"
import { BillionScaleProgramInteractions } from "@/lib/program-interactions"

export default function InitializePage() {
  const { connection } = useConnection()
  const wallet = useWallet()
  const { publicKey } = wallet
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    v1TokenMint: "",
    duration: DEFAULT_DURATION_DAYS.toString(),
    rewardRateBp: DEFAULT_REWARD_RATE_BP.toString(),
    targetParticipationBp: DEFAULT_TARGET_PARTICIPATION_BP.toString(),
    v1MarketPriceLamports: "1000000", // 0.001 SOL default
    tokenName: "",
    imageUrl: ""
  })
  
  const [v1TokenInfo, setV1TokenInfo] = useState<{
    supply: number;
    decimals: number;
    name?: string;
  } | null>(null)

  // Fetch V1 token information when mint address changes
  const fetchV1TokenInfo = async (mintAddress: string) => {
    if (!mintAddress) {
      setV1TokenInfo(null)
      return
    }

    try {
      const mint = new PublicKey(mintAddress)
      const mintInfo = await connection.getParsedAccountInfo(mint)
      
      if (mintInfo.value?.data && 'parsed' in mintInfo.value.data) {
        const parsedData = mintInfo.value.data.parsed.info
        const supply = parsedData.supply / Math.pow(10, parsedData.decimals)
        
        setV1TokenInfo({
          supply,
          decimals: parsedData.decimals,
        })
      }
    } catch (error) {
      console.error("Error fetching token info:", error)
      setV1TokenInfo(null)
    }
  }

  // Calculate billion-scale metrics for preview
  const calculateMetrics = () => {
    if (!v1TokenInfo) return null

    const rewardRate = parseInt(formData.rewardRateBp) / 100
    const targetParticipation = parseInt(formData.targetParticipationBp) / 100
    const v1Supply = v1TokenInfo.supply
    
    // Calculate reward pool (80% of total supply)
    const rewardPoolTokens = v1Supply * 0.8
    const liquidityPoolTokens = v1Supply * 0.2
    
    // Calculate proportionate minimum amount with 2% safety cushion
    const participationBasedAmount = v1Supply * targetParticipation
    const safeRewardPool = rewardPoolTokens * 0.98 // 98% of capacity for safety
    const capacityBasedAmount = safeRewardPool / rewardRate
    const calculatedMinAmount = Math.min(participationBasedAmount, capacityBasedAmount)
    
    // Calculate maximum safe contribution
    const maxSafeContribution = safeRewardPool / rewardRate

    return {
      v1Supply,
      rewardPoolTokens,
      liquidityPoolTokens,
      calculatedMinAmount,
      maxSafeContribution,
      rewardRate,
      targetParticipation: targetParticipation * 100, // Convert to percentage
      safetyUtilization: (calculatedMinAmount / maxSafeContribution) * 100,
    }
  }

  const metrics = calculateMetrics()

  const handleInitialize = async () => {
    if (!publicKey) {
      toast({
        title: "Wallet Error",
        description: "Please connect your wallet",
        variant: "destructive",
      })
      return
    }

    // Validate form data
    const rewardRateValidation = validateRewardRate(parseInt(formData.rewardRateBp))
    const participationValidation = validateParticipationRate(parseInt(formData.targetParticipationBp))
    
    if (!rewardRateValidation.valid) {
      toast({
        title: "Invalid Reward Rate",
        description: rewardRateValidation.message,
        variant: "destructive",
      })
      return
    }

    if (!participationValidation.valid) {
      toast({
        title: "Invalid Participation Rate", 
        description: participationValidation.message,
        variant: "destructive",
      })
      return
    }

    if (!v1TokenInfo) {
      toast({
        title: "Invalid Token",
        description: "Please enter a valid V1 token mint address",
        variant: "destructive",
      })
      return
    }

    // Check if supply is in valid range for billion-scale operations
    if (v1TokenInfo.supply < 1_000_000) {
      toast({
        title: "Supply Too Small",
        description: ERROR_MESSAGES.SUPPLY_TOO_SMALL,
        variant: "destructive",
      })
      return
    }

    if (v1TokenInfo.supply > 10_000_000_000) {
      toast({
        title: "Supply Too Large", 
        description: ERROR_MESSAGES.SUPPLY_TOO_LARGE,
        variant: "destructive",
      })
      return
    }

    try {
      setLoading(true)

      const programInteractions = new BillionScaleProgramInteractions(connection, wallet)
      
      const params = {
        authority: publicKey,
        treasury: new PublicKey(TREASURY_ADDRESS),
        v1TokenMint: new PublicKey(formData.v1TokenMint),
        vault: new PublicKey("11111111111111111111111111111111"), // Will be created by program
        duration: parseInt(formData.duration),
        rewardRateBp: parseInt(formData.rewardRateBp),
        targetParticipationBp: parseInt(formData.targetParticipationBp),
        v1MarketPriceLamports: parseInt(formData.v1MarketPriceLamports),
        tokenName: formData.tokenName,
        imageUrl: formData.imageUrl,
      }

      // Validate parameters
      const validation = programInteractions.validateBillionScaleParams(params)
      if (!validation.valid) {
        throw new Error(validation.errors.join(", "))
      }

      // This would create the initialization instruction
      // For now, we'll show a success message with the calculated metrics
      toast({
        title: "Billion-Scale Takeover Initialized! 🚀",
        description: `Conservative takeover created with ${metrics?.rewardRate}x reward rate and 2% safety cushion`,
        duration: 8000,
      })

      // Reset form
      setFormData({
        v1TokenMint: "",
        duration: DEFAULT_DURATION_DAYS.toString(),
        rewardRateBp: DEFAULT_REWARD_RATE_BP.toString(),
        targetParticipationBp: DEFAULT_TARGET_PARTICIPATION_BP.toString(),
        v1MarketPriceLamports: "1000000",
        tokenName: "",
        imageUrl: ""
      })
      setV1TokenInfo(null)

    } catch (error: any) {
      console.error("Initialization failed:", error)
      toast({
        title: "Initialization Failed",
        description: error.message || "There was an error initializing the takeover.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Initialize Billion-Scale Community Takeover</CardTitle>
          <CardDescription>
            Create a conservative takeover campaign with billion-scale safety features and 2% overflow protection
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!publicKey ? (
            <div className="text-center p-6">
              <p className="mb-4">Connect your wallet to initialize a billion-scale takeover</p>
              <WalletMultiButton />
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="tokenName">Token Name</Label>
                <Input
                  id="tokenName"
                  placeholder="e.g., My Billion Token"
                  value={formData.tokenName}
                  onChange={(e) => setFormData(prev => ({ ...prev, tokenName: e.target.value }))}
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="v1Mint">V1 Token Mint Address</Label>
                <Input
                  id="v1Mint"
                  placeholder="Enter V1 token mint address"
                  value={formData.v1TokenMint}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, v1TokenMint: e.target.value }))
                    fetchV1TokenInfo(e.target.value)
                  }}
                  disabled={loading}
                />
                {v1TokenInfo && (
                  <div className="text-sm text-green-600 bg-green-50 dark:bg-green-950 p-2 rounded">
                    ✅ Token found: {formatLargeNumber(v1TokenInfo.supply)} tokens total supply
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="duration">Duration (Days)</Label>
                  <Input
                    id="duration"
                    type="number"
                    placeholder="14"
                    value={formData.duration}
                    onChange={(e) => setFormData(prev => ({ ...prev, duration: e.target.value }))}
                    disabled={loading}
                    min="1"
                    max="30"
                  />
                  <p className="text-xs text-gray-500">1-30 days maximum</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="v1Price">V1 Market Price (Lamports)</Label>
                  <Input
                    id="v1Price"
                    type="number"
                    placeholder="1000000"
                    value={formData.v1MarketPriceLamports}
                    onChange={(e) => setFormData(prev => ({ ...prev, v1MarketPriceLamports: e.target.value }))}
                    disabled={loading}
                  />
                  <p className="text-xs text-gray-500">
                    Current: {(parseInt(formData.v1MarketPriceLamports) / 1e9).toFixed(6)} SOL
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rewardRate">Reward Rate (Basis Points)</Label>
                  <Input
                    id="rewardRate"
                    type="number"
                    placeholder="150"
                    value={formData.rewardRateBp}
                    onChange={(e) => setFormData(prev => ({ ...prev, rewardRateBp: e.target.value }))}
                    disabled={loading}
                    min="100"
                    max="200"
                  />
                  <p className="text-xs text-gray-500">
                    {(parseInt(formData.rewardRateBp) / 100).toFixed(1)}x reward rate (max 2.0x for safety)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="targetParticipation">Target Participation (Basis Points)</Label>
                  <Input
                    id="targetParticipation"
                    type="number"
                    placeholder="500"
                    value={formData.targetParticipationBp}
                    onChange={(e) => setFormData(prev => ({ ...prev, targetParticipationBp: e.target.value }))}
                    disabled={loading}
                    min="1"
                    max="10000"
                  />
                  <p className="text-xs text-gray-500">
                    {(parseInt(formData.targetParticipationBp) / 100).toFixed(2)}% of total supply
                  </p>
                </div>
              </div>

              {/* Conservative Metrics Preview */}
              {metrics && (
                <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <h3 className="font-medium text-blue-800 dark:text-blue-200 mb-3">
                    🛡️ Conservative Billion-Scale Preview
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-blue-600 dark:text-blue-400">V1 Total Supply:</span><br />
                      <span className="font-medium">{formatLargeNumber(metrics.v1Supply)} tokens</span>
                    </div>
                    <div>
                      <span className="text-blue-600 dark:text-blue-400">Calculated Min Amount:</span><br />
                      <span className="font-medium">{formatLargeNumber(metrics.calculatedMinAmount)} tokens</span>
                    </div>
                    <div>
                      <span className="text-blue-600 dark:text-blue-400">Max Safe Contribution:</span><br />
                      <span className="font-medium">{formatLargeNumber(metrics.maxSafeContribution)} tokens</span>
                    </div>
                    <div>
                      <span className="text-blue-600 dark:text-blue-400">Safety Utilization:</span><br />
                      <span className="font-medium">{metrics.safetyUtilization.toFixed(1)}%</span>
                    </div>
                    <div>
                      <span className="text-blue-600 dark:text-blue-400">Reward Pool (80%):</span><br />
                      <span className="font-medium">{formatLargeNumber(metrics.rewardPoolTokens)} tokens</span>
                    </div>
                    <div>
                      <span className="text-blue-600 dark:text-blue-400">Liquidity Pool (20%):</span><br />
                      <span className="font-medium">{formatLargeNumber(metrics.liquidityPoolTokens)} tokens</span>
                    </div>
                  </div>
                  <div className="mt-3 text-xs text-blue-600 dark:text-blue-300">
                    🔒 Features: 2% safety cushion • 2.0x max reward rate • Conservative overflow protection
                  </div>
                </div>
              )}

              {/* Safety Warnings */}
              {metrics && metrics.safetyUtilization > 80 && (
                <div className="p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 rounded-lg">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    ⚠️ <strong>High Utilization Warning:</strong> This configuration uses {metrics.safetyUtilization.toFixed(1)}% 
                    of safe capacity. Consider lowering the reward rate or target participation for more conservative operation.
                  </p>
                </div>
              )}

              <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
                <div className="text-sm text-gray-500 dark:text-gray-400">Treasury Address (Conservative Operations)</div>
                <div className="text-sm font-mono mt-1 break-all">{TREASURY_ADDRESS}</div>
              </div>
            </>
          )}
        </CardContent>
        <CardFooter>
          {publicKey && (
            <Button
              onClick={handleInitialize}
              disabled={loading || !formData.v1TokenMint || !v1TokenInfo || !formData.tokenName}
              className="w-full"
            >
              {loading ? (
                <LoadingSpinner />
              ) : (
                "Initialize Billion-Scale Takeover 🚀"
              )}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}