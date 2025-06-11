"use client";
import { useEffect, useState, useCallback } from "react";
import { Keypair, PublicKey, Transaction, SystemProgram } from "@solana/web3.js";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { LoadingSpinner } from "./loading-spinner";
import { useToast } from "./ui/use-toast";
import { Button } from "./ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Progress } from "./ui/progress";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { BillionScaleProgramInteractions, BillionScaleTakeover, ContributorData } from "@/lib/program-interactions";
import { findContributorPDA } from "@/lib/program";

// Helper function for ATA operations (keeping for compatibility)
const getAssociatedTokenAddress = async (
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> => {
  return (await PublicKey.findProgramAddressSync(
    [
      owner.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      mint.toBuffer(),
    ],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
  ))[0];
};

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
  const [timeLeft, setTimeLeft] = useState("");
  const [contributorData, setContributorData] = useState<ContributorData | null>(null);
  const [v2TokenBalance, setV2TokenBalance] = useState(0);
  const [programInteractions, setProgramInteractions] = useState<BillionScaleProgramInteractions | null>(null);
  
  const v1Decimals = 6;
  const v2Decimals = 6;

  // Initialize program interactions
  useEffect(() => {
    if (wallet.publicKey) {
      const interactions = new BillionScaleProgramInteractions(connection, wallet);
      setProgramInteractions(interactions);
    }
  }, [connection, wallet]);

  // Calculate billion-scale metrics
  const calculatedMinAmount = takeover.account.calculatedMinAmount.toNumber() / 10 ** v1Decimals;
  const totalContributed = takeover.account.totalContributed.toNumber() / 10 ** v1Decimals;
  const maxSafeContribution = takeover.account.maxSafeTotalContribution.toNumber() / 10 ** v1Decimals;
  const endTime = takeover.account.endTime.toNumber();
  const isActive = Date.now() / 1000 < endTime && !takeover.account.isFinalized;
  const progressPercentage = calculatedMinAmount === 0 ? 0 : (totalContributed / calculatedMinAmount) * 100;
  
  // Billion-scale specific metrics
  const v1SupplyBillions = takeover.account.v1TotalSupply.toNumber() / (10 ** (v1Decimals + 9)); // Convert to billions
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
    if (!publicKey || !programInteractions) return;

    try {
      const [contributorPDA] = await findContributorPDA(takeover.publicKey, publicKey);

      try {
        const program = programInteractions.getProgram();
        const contributor = await program.account.contributorData.fetch(contributorPDA) as unknown as ContributorData;
        setContributorData(contributor);
        setUserContribution(contributor.contribution.toNumber() / 10 ** v1Decimals);
      } catch {
        setContributorData(null);
        setUserContribution(0);
      }

      const v1TokenAccount = await getAssociatedTokenAddress(
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
          const v2TokenAccount = await getAssociatedTokenAddress(
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
  }, [publicKey, connection, takeover, v1Decimals, v2Decimals, programInteractions]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  const handleContribute = async () => {
    if (!publicKey || !contributionAmount || !programInteractions) return;

    try {
      setLoading(true);
      const amount = Number(contributionAmount);
      const amountBN = new BN(amount * 10 ** v1Decimals);

      // Check for overflow before attempting contribution
      const wouldOverflow = await programInteractions.wouldCauseOverflow(takeover.publicKey, amountBN);
      if (wouldOverflow) {
        throw new Error(`Contribution would exceed safe capacity. Maximum safe remaining: ${remainingSafe.toFixed(2)} tokens`);
      }

      const userTokenAccount = await getAssociatedTokenAddress(
        takeover.account.v1TokenMint,
        publicKey
      );

      const contributeIx = await programInteractions.contributeBillionScale(
        publicKey,
        takeover.publicKey,
        userTokenAccount,
        takeover.account.vault,
        amountBN
      );

      const tx = new Transaction();
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      tx.add(contributeIx);

      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction(signature);

      toast({ 
        title: "Billion-Scale Contribution Successful! 🎉", 
        description: `${amount} V1 tokens contributed safely. Reward rate: ${rewardRate}x` 
      });
      
      setContributionAmount("");
      await fetchUserData();
    } catch (error: any) {
      toast({
        title: "Contribution Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFinalize = async () => {
    if (!publicKey || !programInteractions) return;

    try {
      setLoading(true);
      
      // Create V2 mint keypair
      const v2MintKeypair = Keypair.generate();
      
      const finalizeIx = await programInteractions.finalizeTakeover(
        takeover.publicKey,
        publicKey,
        v2MintKeypair.publicKey
      );

      const tx = new Transaction();
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      tx.add(finalizeIx);
      
      // Sign with V2 mint keypair
      tx.partialSign(v2MintKeypair);

      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction(signature);

      toast({
        title: "Billion-Scale Takeover Finalized! 🚀",
        description: `Conservative safety features ensured smooth completion. V2 Mint: ${v2MintKeypair.publicKey.toString().slice(0, 8)}...`
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
    if (!publicKey || !contributorData || !programInteractions) return;

    try {
      setLoading(true);
      
      const isSuccess = takeover.account.isSuccessful;
      const mint = isSuccess ? takeover.account.v2TokenMint : takeover.account.v1TokenMint;
      
      const userTokenAccount = await getAssociatedTokenAddress(mint, publicKey);

      const claimIx = await programInteractions.airdropV2Liquidity(
        takeover.account.authority,
        publicKey,
        takeover.publicKey,
        mint,
        userTokenAccount,
        takeover.account.vault
      );

      const tx = new Transaction();
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      tx.add(claimIx);

      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction(signature);

      const expectedReward = userContribution * rewardRate;
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

  const formatAmount = (amount: number, decimals: number = 2) => 
    amount.toLocaleString(undefined, { maximumFractionDigits: decimals });

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
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                      : isActive 
                        ? "bg-green-100 text-green-800"
                        : "bg-yellow-100 text-yellow-800"
                  }`}>
                    {takeover.account.isFinalized
                      ? takeover.account.isSuccessful
                        ? "🎉 Successfully completed!"
                        : "❌ Did not meet target"
                      : isActive
                        ? "🟢 Active campaign"
                        : "⏰ Ended - Awaiting finalization"}
                  </span>
                </CardTitle>
                <CardDescription>
                  Conservative billion-scale takeover with 2% safety cushion and 2.0x max reward rate
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Progress Section */}
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span className="font-medium">Funding Progress</span>
                    <span>
                      {formatAmount(totalContributed)} / {formatAmount(calculatedMinAmount)} V1
                    </span>
                  </div>
                  <Progress value={progressPercentage} className="h-3" />
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{progressPercentage.toFixed(1)}% Complete</span>
                    <span>Conservative Goal: {formatAmount(calculatedMinAmount)} V1</span>
                  </div>
                </div>

                {/* Billion-Scale Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg text-center">
                    <div className="text-xs text-blue-600 dark:text-blue-400 mb-1">V1 Supply</div>
                    <div className="text-lg font-bold text-blue-800 dark:text-blue-200">
                      {v1SupplyBillions.toFixed(1)}B
                    </div>
                  </div>
                  <div className="p-4 bg-purple-50 dark:bg-purple-950 rounded-lg text-center">
                    <div className="text-xs text-purple-600 dark:text-purple-400 mb-1">Participation</div>
                    <div className="text-lg font-bold text-purple-800 dark:text-purple-200">
                      {participationRate.toFixed(2)}%
                    </div>
                  </div>
                  <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg text-center">
                    <div className="text-xs text-green-600 dark:text-green-400 mb-1">Reward Rate</div>
                    <div className="text-lg font-bold text-green-800 dark:text-green-200">
                      {(rewardRate / 100).toFixed(1)}x
                    </div>
                  </div>
                  <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg text-center">
                    <div className="text-xs text-yellow-600 dark:text-yellow-400 mb-1">Safe Capacity</div>
                    <div className="text-lg font-bold text-yellow-800 dark:text-yellow-200">
                      {safetyUtilization.toFixed(1)}%
                    </div>
                  </div>
                </div>

                {/* Conservative Safety Info */}
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <h3 className="font-medium mb-2">🛡️ Conservative Safety Features</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Max Safe Total:</span><br />
                      <span className="font-medium">{formatAmount(maxSafeContribution)} V1</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Remaining Safe Space:</span><br />
                      <span className="font-medium">{formatAmount(remainingSafe)} V1</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Safety Cushion:</span><br />
                      <span className="font-medium">2% built-in overflow protection</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Max Reward Rate:</span><br />
                      <span className="font-medium">2.0x (conservative limit)</span>
                    </div>
                  </div>
                </div>

                {/* Time and Contributors */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-muted rounded-lg text-center">
                    <div className="text-sm text-muted-foreground">Time Remaining</div>
                    <div className="text-xl font-semibold">{timeLeft}</div>
                  </div>
                  <div className="p-4 bg-muted rounded-lg text-center">
                    <div className="text-sm text-muted-foreground">Contributors</div>
                    <div className="text-xl font-semibold">
                      {takeover.account.contributorCount.toNumber()}
                    </div>
                  </div>
                </div>

                {publicKey && (
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground">Your Contribution</div>
                    <div className="text-xl font-semibold">
                      {formatAmount(userContribution)} V1
                    </div>
                    {userContribution > 0 && (
                      <div className="text-sm text-green-600 mt-1">
                        Expected V2 reward: {formatAmount(userContribution * (rewardRate / 100))} V2
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
              {publicKey?.equals(takeover.account.authority) && !takeover.account.isFinalized && (
                <CardFooter>
                  <Button 
                    onClick={handleFinalize} 
                    disabled={loading || Date.now() / 1000 < endTime}
                    className="w-full"
                  >
                    {loading ? <LoadingSpinner /> : "Finalize Billion-Scale Takeover"}
                  </Button>
                </CardFooter>
              )}
            </Card>

            {/* Liquidity Features (if applicable) */}
            {takeover.account.isFinalized && takeover.account.isSuccessful && (
              <Card>
                <CardHeader>
                  <CardTitle>🌊 Liquidity Features</CardTitle>
                  <CardDescription>
                    Enhanced liquidity features for billion-scale token economy
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Jupiter Swap:</span><br />
                      <span className={takeover.account.jupiterSwapCompleted ? "text-green-600" : "text-gray-400"}>
                        {takeover.account.jupiterSwapCompleted ? "✅ Completed" : "⏳ Pending"}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Liquidity Pool:</span><br />
                      <span className={takeover.account.lpCreated ? "text-green-600" : "text-gray-400"}>
                        {takeover.account.lpCreated ? "✅ Created" : "⏳ Pending"}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">SOL for Liquidity:</span><br />
                      <span className="font-medium">
                        {(takeover.account.solForLiquidity.toNumber() / 1e9).toFixed(4)} SOL
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">V1 Market Price:</span><br />
                      <span className="font-medium">
                        {(takeover.account.v1MarketPriceLamports.toNumber() / 1e9).toFixed(6)} SOL
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="contribute">
          <Card>
            <CardHeader>
              <CardTitle>Contribute to Billion-Scale Takeover</CardTitle>
              <CardDescription>
                Conservative contribution with overflow protection and 2% safety cushion
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!publicKey ? (
                <div className="text-center p-6">
                  <p className="mb-4">Connect wallet to contribute</p>
                  <WalletMultiButton />
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label>Amount to Contribute (V1 tokens)</Label>
                    <Input
                      type="number"
                      value={contributionAmount}
                      onChange={(e) => setContributionAmount(e.target.value)}
                      placeholder="Enter V1 amount"
                      disabled={loading}
                    />
                    <div className="text-sm text-muted-foreground space-y-1">
                      <div>Available: {formatAmount(userTokenBalance)} V1</div>
                      <div>Safe remaining space: {formatAmount(remainingSafe)} V1</div>
                      <div>Your reward rate: {(rewardRate / 100).toFixed(1)}x (conservative)</div>
                    </div>
                  </div>

                  {Number(contributionAmount) > 0 && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        💎 <strong>Expected V2 reward:</strong> {formatAmount(Number(contributionAmount) * (rewardRate / 100))} V2 tokens
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">
                        🛡️ Protected by conservative 2% safety cushion and 2.0x max rate limit
                      </p>
                    </div>
                  )}

                  <Button 
                    onClick={handleContribute}
                    disabled={loading || !contributionAmount || Number(contributionAmount) > remainingSafe}
                    className="w-full"
                  >
                    {loading ? <LoadingSpinner /> : `Contribute ${contributionAmount || '0'} V1 (Safe)`}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
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
                      <div className="text-xs text-green-600 mt-1">
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
                  <p>No contribution found for this wallet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}