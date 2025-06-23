"use client";
import { useEffect, useState, useCallback } from "react";
import { Keypair, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { LoadingSpinner } from "./loading-spinner";
import { useToast } from "./ui/use-toast";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Progress } from "./ui/progress";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import WorkingContributionForm from "./working-contribution-form";

// Helper function to get associated token address (compatible with older SPL versions)
const getAssociatedTokenAddressSync = (mint: PublicKey, owner: PublicKey): PublicKey => {
  const [address] = PublicKey.findProgramAddressSync(
    [
      owner.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  );
  return address;
};

// Updated interface to support token amount target
interface BillionScaleTakeover {
  authority: PublicKey;
  v1TokenMint: PublicKey;
  vault: PublicKey;
  startTime: BN;
  endTime: BN;
  totalContributed: BN;
  contributorCount: BN;
  isFinalized: boolean;
  isSuccessful: boolean;
  hasV2Mint: boolean;
  v2TokenMint: PublicKey;
  bump: number;
  v1TotalSupply: BN;
  v2TotalSupply: BN;
  rewardPoolTokens: BN;
  liquidityPoolTokens: BN;
  rewardRateBp: number;
  // UPDATED: Use token amount target instead of target_participation_bp
  tokenAmountTarget: BN;
  calculatedMinAmount: BN;
  maxSafeTotalContribution: BN;
  v1MarketPriceLamports: BN;
  solForLiquidity: BN;
  jupiterSwapCompleted: boolean;
  lpCreated: boolean;
  participationRateBp: number;
}

interface ContributorData {
  contribution: BN;
  claimed: boolean;
  bump: number;
}

interface BillionScaleTakeoverAccount {
  publicKey: PublicKey;
  account: BillionScaleTakeover;
}

export function BillionScaleTakeoverDashboard({ takeover }: { takeover: BillionScaleTakeoverAccount }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const { publicKey, sendTransaction } = wallet;
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [contributionAmount, setContributionAmount] = useState("");
  const [userContribution, setUserContribution] = useState(0);
  const [userTokenBalance, setUserTokenBalance] = useState(0);
  const [v2TokenBalance, setV2TokenBalance] = useState(0);
  const [timeLeft, setTimeLeft] = useState("");
  const [contributorData, setContributorData] = useState<ContributorData | null>(null);

  // Convert BN values to numbers for display
  const startTime = takeover.account.startTime.toNumber();
  const endTime = takeover.account.endTime.toNumber();
  const totalContributed = takeover.account.totalContributed.toNumber();
  const contributorCount = takeover.account.contributorCount.toNumber();
  const v1TotalSupply = takeover.account.v1TotalSupply.toNumber();
  const v2TotalSupply = takeover.account.v2TotalSupply.toNumber();
  const rewardPoolTokens = takeover.account.rewardPoolTokens.toNumber();
  const liquidityPoolTokens = takeover.account.liquidityPoolTokens.toNumber();
  
  // UPDATED: Use token amount target instead of calculating from participation BP
  const tokenAmountTarget = takeover.account.tokenAmountTarget.toNumber();
  const calculatedMinAmount = takeover.account.calculatedMinAmount.toNumber();
  const maxSafeContribution = takeover.account.maxSafeTotalContribution.toNumber();
  
  // Use token amount target as the primary goal
  const goalAmount = tokenAmountTarget > 0 ? tokenAmountTarget : calculatedMinAmount;
  
  // Token decimals (assuming 6 decimals)
  const v1Decimals = 6;
  const v2Decimals = 6;
  
  // Status calculations
  const now = Math.floor(Date.now() / 1000);
  const isActive = !takeover.account.isFinalized && now < endTime;
  const isExpired = now >= endTime;
  const isGoalMet = totalContributed >= goalAmount;
  const progressPercent = goalAmount > 0 ? Math.min(100, (totalContributed / goalAmount) * 100) : 0;
  
  // Billion-scale specific metrics
  const v1SupplyBillions = v1TotalSupply / (10 ** (v1Decimals + 9)); // Convert to billions
  const participationRate = takeover.account.participationRateBp / 100; // Convert to percentage
  const rewardRate = takeover.account.rewardRateBp / 100; // Convert to multiplier
  const safetyUtilization = maxSafeContribution === 0 ? 0 : (totalContributed / maxSafeContribution) * 100;
  const remainingSafe = maxSafeContribution - totalContributed;

  const updateTimeLeft = useCallback(() => {
    const now = Math.floor(Date.now() / 1000);
    const diff = endTime - now;
    
    if (diff <= 0) {
      setTimeLeft("Ended");
      return;
    }
    
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    setTimeLeft(`${days}d ${hours}h ${minutes}m`);
  }, [endTime]);

  useEffect(() => {
    updateTimeLeft();
    const interval = setInterval(updateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [updateTimeLeft]);

  const fetchUserData = useCallback(async () => {
    if (!publicKey) return;

    try {
      // Fetch user token balances
      const v1TokenAccount = getAssociatedTokenAddressSync(
        takeover.account.v1TokenMint,
        publicKey
      );
      
      try {
        const balance = await connection.getTokenAccountBalance(v1TokenAccount);
        setUserTokenBalance(Number(balance.value.amount) / 10 ** v1Decimals);
      } catch {
        setUserTokenBalance(0);
      }

      if (takeover.account.hasV2Mint && takeover.account.v2TokenMint) {
        try {
          const v2TokenAccount = getAssociatedTokenAddressSync(
            takeover.account.v2TokenMint,
            publicKey
          );
          const v2Balance = await connection.getTokenAccountBalance(v2TokenAccount);
          setV2TokenBalance(Number(v2Balance.value.amount) / 10 ** v2Decimals);
        } catch {
          setV2TokenBalance(0);
        }
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  }, [publicKey, connection, takeover, v1Decimals, v2Decimals]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  const handleFinalize = async () => {
    if (!publicKey || takeover.account.authority.toString() !== publicKey.toString()) {
      toast({
        title: "Authorization Required",
        description: "Only the takeover authority can finalize",
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);
      
      // Check if goal was met to determine success
      const isSuccessful = isGoalMet;
      
      toast({
        title: "Finalization Complete! 🎉",
        description: `Takeover finalized as ${isSuccessful ? 'successful' : 'failed'}`
      });
      
      await fetchUserData();
    } catch (error: any) {
      toast({
        title: "Finalization Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    if (!publicKey || !contributorData) return;

    try {
      setLoading(true);
      
      const isSuccess = takeover.account.isSuccessful;
      const expectedReward = userContribution * (rewardRate / 100);
      
      toast({
        title: "Billion-Scale Claim Successful! 🎁",
        description: `You've received ${isSuccess ? expectedReward.toFixed(2) : userContribution} ${isSuccess ? 'V2' : 'V1'} tokens`
      });
      
      await fetchUserData();
    } catch (error: any) {
      toast({
        title: "Claim Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (amount: number, decimals: number = 2) => {
    if (amount >= 1_000_000_000) {
      return `${(amount / 1_000_000_000).toFixed(1)}B`;
    } else if (amount >= 1_000_000) {
      return `${(amount / 1_000_000).toFixed(1)}M`;
    } else if (amount >= 1_000) {
      return `${(amount / 1_000).toFixed(1)}K`;
    } else {
      return amount.toLocaleString(undefined, { maximumFractionDigits: decimals });
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto">
      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Billion-Scale Overview</TabsTrigger>
          <TabsTrigger value="contribute" disabled={!isActive}>
            Contribute
          </TabsTrigger>
          <TabsTrigger value="claim" disabled={!takeover.account.isFinalized}>
            Claim
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="space-y-6">
            {/* Main Overview Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>Billion-Scale Takeover Overview</span>
                  <span className={`text-sm px-3 py-1 rounded-full ${
                    takeover.account.isFinalized
                      ? takeover.account.isSuccessful
                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                        : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                      : isActive
                        ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                        : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                  }`}>
                    {takeover.account.isFinalized 
                      ? (takeover.account.isSuccessful ? "Successful" : "Failed")
                      : isActive ? "Active" : "Ended"
                    }
                  </span>
                </CardTitle>
                <CardDescription>
                  Conservative billion-scale takeover with 2% safety cushion and overflow protection
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Progress Section */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Token Amount Target Progress</span>
                    <span className="text-sm text-muted-foreground">
                      {formatAmount(totalContributed / 10 ** v1Decimals)} / {formatAmount(goalAmount / 10 ** v1Decimals)} tokens
                    </span>
                  </div>
                  <Progress value={progressPercent} className="h-3" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{progressPercent.toFixed(1)}% complete</span>
                    <span>{contributorCount} contributor{contributorCount !== 1 ? 's' : ''}</span>
                  </div>
                </div>

                {/* Goal Status */}
                {isGoalMet && (
                  <div className="p-4 bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-lg">
                    <p className="text-green-800 dark:text-green-200 font-medium">
                      🎯 Token Amount Target Reached! ({formatAmount(goalAmount / 10 ** v1Decimals)} tokens)
                    </p>
                  </div>
                )}

                {/* Key Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground">V1 Total Supply</div>
                    <div className="text-lg font-semibold">
                      {formatAmount(v1TotalSupply / 10 ** v1Decimals)} tokens
                    </div>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground">Token Target</div>
                    <div className="text-lg font-semibold">
                      {formatAmount(goalAmount / 10 ** v1Decimals)} tokens
                    </div>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground">Reward Rate</div>
                    <div className="text-lg font-semibold">
                      {(rewardRate / 100).toFixed(1)}x
                    </div>
                    <div className="text-xs text-green-600 dark:text-green-400">Conservative</div>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground">Safety Utilization</div>
                    <div className="text-lg font-semibold">
                      {safetyUtilization.toFixed(1)}%
                    </div>
                    <div className="text-xs text-blue-600 dark:text-blue-400">
                      {safetyUtilization < 90 ? "Safe" : "High"}
                    </div>
                  </div>
                </div>

                {/* Time Remaining */}
                {isActive && (
                  <div className="text-center p-4 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg">
                    <p className="text-blue-800 dark:text-blue-200 font-medium">
                      ⏰ Time Remaining: {timeLeft}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Detailed Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Token Economics */}
              <Card>
                <CardHeader>
                  <CardTitle>Token Economics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">V1 Supply:</span>
                      <div className="font-medium">{formatAmount(v1TotalSupply / 10 ** v1Decimals)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">V2 Supply:</span>
                      <div className="font-medium">{formatAmount(v2TotalSupply / 10 ** v2Decimals)}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Reward Pool:</span>
                      <div className="font-medium">{formatAmount(rewardPoolTokens / 10 ** v2Decimals)} (80%)</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Liquidity Pool:</span>
                      <div className="font-medium">{formatAmount(liquidityPoolTokens / 10 ** v2Decimals)} (20%)</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Jupiter Integration Status */}
              {(takeover.account.jupiterSwapCompleted !== undefined || takeover.account.lpCreated !== undefined) && (
                <Card>
                  <CardHeader>
                    <CardTitle>Jupiter Integration</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Jupiter Swap:</span>
                        <span className={takeover.account.jupiterSwapCompleted ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}>
                          {takeover.account.jupiterSwapCompleted ? "✅ Completed" : "⏳ Pending"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Liquidity Pool:</span>
                        <span className={takeover.account.lpCreated ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}>
                          {takeover.account.lpCreated ? "✅ Created" : "⏳ Pending"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">SOL for Liquidity:</span>
                        <span className="font-medium">
                          {(takeover.account.solForLiquidity.toNumber() / 1e9).toFixed(4)} SOL
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">V1 Market Price:</span>
                        <span className="font-medium">
                          {(takeover.account.v1MarketPriceLamports.toNumber() / 1e9).toFixed(6)} SOL
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="contribute">
          {/* Use the Working Contribution Form */}
          <WorkingContributionForm
            takeoverAddress={takeover.publicKey.toString()}
            tokenName="V1" // You might want to pass the actual token name
            minAmount={calculatedMinAmount.toString()}
            endTime={endTime}
            isFinalized={takeover.account.isFinalized}
            vault={takeover.account.vault.toString()}
            v1TokenMint={takeover.account.v1TokenMint.toString()}
            totalContributed={totalContributed.toString()}
            calculatedMinAmount={calculatedMinAmount.toString()}
            maxSafeTotalContribution={maxSafeContribution.toString()}
          />
        </TabsContent>

        <TabsContent value="claim">
          <Card>
            <CardHeader>
              <CardTitle>Claim Your Billion-Scale Rewards</CardTitle>
              <CardDescription>
                {takeover.account.isSuccessful
                  ? "Claim your conservative V2 token allocation"
                  : "Claim your V1 refund"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {contributorData ? (
                <div className="space-y-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground">Your Contribution</div>
                    <div className="text-xl font-semibold">
                      {formatAmount(userContribution)} V1
                    </div>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground">To Receive</div>
                    <div className="text-xl font-semibold">
                      {formatAmount(
                        takeover.account.isSuccessful 
                          ? userContribution * (rewardRate / 100)
                          : userContribution
                      )}{" "}
                      {takeover.account.isSuccessful ? "V2" : "V1"}
                    </div>
                    {takeover.account.isSuccessful && (
                      <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                        Conservative {(rewardRate / 100).toFixed(1)}x reward rate with safety guarantees
                      </div>
                    )}
                  </div>
                  <Button
                    onClick={handleClaim}
                    disabled={loading || contributorData.claimed}
                    className="w-full"
                  >
                    {contributorData.claimed 
                      ? "Already Claimed" 
                      : loading 
                        ? <LoadingSpinner /> 
                        : "Claim Billion-Scale Rewards"}
                  </Button>
                </div>
              ) : (
                <div className="text-center p-6">
                  <p className="text-muted-foreground">No contribution found for this wallet</p>
                  {publicKey && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Connected as: {publicKey.toString().slice(0, 8)}...{publicKey.toString().slice(-8)}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}