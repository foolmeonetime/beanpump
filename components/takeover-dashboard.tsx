"use client";
import { useEffect, useState, useCallback } from "react";
import { Keypair, PublicKey, Transaction, SystemProgram, VersionedTransaction } from "@solana/web3.js";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Program, BN, Wallet } from "@coral-xyz/anchor";
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
import { getProgram, findContributorPDA } from "@/lib/program";

// Manual ATA implementation for older spl-token version
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
    TOKEN_PROGRAM_ID
  ))[0];
};

const createATAInstruction = (
  payer: PublicKey,
  ata: PublicKey,
  mint: PublicKey,
  owner: PublicKey
) => {
  return SystemProgram.createAccount({
    fromPubkey: payer,
    newAccountPubkey: ata,
    space: 165,
    lamports: 2039280, // Hardcoded minimum balance
    programId: TOKEN_PROGRAM_ID,
  });
};

// Wallet adapter type fix
interface AdaptedWallet extends Wallet {
  signTransaction: <T extends Transaction | VersionedTransaction>(tx: T) => Promise<T>;
  signAllTransactions: <T extends Transaction | VersionedTransaction>(txs: T[]) => Promise<T[]>;
}

const adaptWallet = (wallet: any): AdaptedWallet => ({
  publicKey: wallet.publicKey,
  signTransaction: wallet.signTransaction,
  signAllTransactions: wallet.signAllTransactions,
  payer: Keypair.generate() // Dummy payer for type safety
});

declare module "@coral-xyz/anchor" {
  namespace web3 {
    export const SYSVAR_RENT_PUBKEY: PublicKey;
  }
}

interface TakeoverAccount {
  publicKey: PublicKey;
  account: {
    authority: PublicKey;
    v1TokenMint: PublicKey;
    vault: PublicKey;
    minAmount: BN;
    startTime: BN;
    endTime: BN;
    totalContributed: BN;
    contributorCount: BN;
    isFinalized: boolean;
    isSuccessful: boolean;
    hasV2Mint: boolean;
    v2TokenMint: PublicKey;
    v2TotalSupply: BN;
    customRewardRate: number;
    bump: number;
  };
}

interface ContributorData {
  contribution: BN;
  claimed: boolean;
}

export function TakeoverDashboard({ takeover }: { takeover: TakeoverAccount }) {
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
  const v1Decimals = 6;
  const v2Decimals = 6;

  const minAmount = takeover.account.minAmount.toNumber() / 10 ** v1Decimals;
  const totalContributed = takeover.account.totalContributed.toNumber() / 10 ** v1Decimals;
  const endTime = takeover.account.endTime.toNumber();
  const isActive = Date.now() / 1000 < endTime && !takeover.account.isFinalized;
  const progressPercentage = minAmount === 0 ? 0 : (totalContributed / minAmount) * 100;

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
      const program = getProgram(connection, adaptWallet(wallet));
      const [contributorPDA] = await findContributorPDA(takeover.publicKey, publicKey);

      try {
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
      const balance = await connection.getTokenAccountBalance(v1TokenAccount);
      setUserTokenBalance(Number(balance.value.amount) / 10 ** v1Decimals);

      if (takeover.account.hasV2Mint) {
        const v2TokenAccount = await getAssociatedTokenAddress(
          takeover.account.v2TokenMint,
          publicKey
        );
        const v2Balance = await connection.getTokenAccountBalance(v2TokenAccount);
        setV2TokenBalance(Number(v2Balance.value.amount) / 10 ** v2Decimals);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  }, [publicKey, connection, takeover, v1Decimals, v2Decimals, wallet]);

  useEffect(() => {
    fetchUserData();
  }, [fetchUserData]);

  const handleContribute = async () => {
    if (!publicKey || !contributionAmount || !wallet.signTransaction) return;

    try {
      setLoading(true);
      const program = getProgram(connection, adaptWallet(wallet));
      const amount = Number(contributionAmount);
      const amountLamports = new BN(amount * 10 ** v1Decimals);

      const [contributorPDA] = await findContributorPDA(takeover.publicKey, publicKey);
      const userTokenAccount = await getAssociatedTokenAddress(
        takeover.account.v1TokenMint,
        publicKey
      );

      let tx = new Transaction();
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      
      try {
        await connection.getAccountInfo(userTokenAccount);
      } catch {
        tx.add(createATAInstruction(
          publicKey,
          userTokenAccount,
          takeover.account.v1TokenMint,
          publicKey
        ));
      }

      const ix = await program.methods.contribute(amountLamports)
        .accounts({
          contributor: publicKey,
          takeover: takeover.publicKey,
          contributorAta: userTokenAccount,
          vault: takeover.account.vault,
          contributorAccount: contributorPDA,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .instruction();

      tx.add(ix);
      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction(signature);

      toast({ title: "Contribution Successful", description: `${amount} V1 tokens contributed!` });
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
    if (!publicKey || !wallet.signTransaction) return;

    try {
      setLoading(true);
      const program = getProgram(connection, adaptWallet(wallet));
      
      const [v2MintPDA] = await PublicKey.findProgramAddress(
        [Buffer.from("v2_mint"), takeover.publicKey.toBuffer()],
        program.programId
      );

      const signature = await program.methods
        .finalizeTakeover()
        .accounts({
          takeover: takeover.publicKey,
          authority: publicKey,
          v2Mint: v2MintPDA,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();

      await connection.confirmTransaction(signature);

      toast({
        title: "Takeover Finalized",
        description: `V2 Mint: ${v2MintPDA.toString()}`
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
    if (!publicKey || !contributorData || !wallet.signTransaction) return;

    try {
      setLoading(true);
      const program = getProgram(connection, adaptWallet(wallet));
      const [contributorPDA] = await findContributorPDA(takeover.publicKey, publicKey);
      
      const isSuccess = takeover.account.isSuccessful;
      const mint = isSuccess ? takeover.account.v2TokenMint : takeover.account.v1TokenMint;
      const decimals = isSuccess ? v2Decimals : v1Decimals;
      
      const baseAmount = contributorData.contribution.toNumber();
      const rewardAmount = isSuccess 
        ? new BN(baseAmount * takeover.account.customRewardRate)
        : new BN(baseAmount);

      const userTokenAccount = await getAssociatedTokenAddress(mint, publicKey);
      let tx = new Transaction();
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      try {
        await connection.getAccountInfo(userTokenAccount);
      } catch {
        tx.add(createATAInstruction(
          publicKey,
          userTokenAccount,
          mint,
          publicKey
        ));
      }

      const ix = await program.methods.airdropV2(rewardAmount)
        .accounts({
          authority: takeover.account.authority,
          contributor: publicKey,
          takeover: takeover.publicKey,
          contributorAccount: contributorPDA,
          v2Mint: mint,
          contributorAta: userTokenAccount,
          vault: takeover.account.vault,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .instruction();

      tx.add(ix);
      const signature = await sendTransaction(tx, connection);
      await connection.confirmTransaction(signature, "confirmed");

      toast({
        title: "Claim Successful",
        description: `You've received ${rewardAmount.toNumber() / 10 ** decimals} ${isSuccess ? 'V2' : 'V1'} tokens`
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

  const formatAmount = (amount: number, decimals: number) => 
    amount.toLocaleString(undefined, { maximumFractionDigits: decimals });

  return (
    <div className="w-full max-w-4xl mx-auto">
      <Tabs defaultValue="overview">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contribute" disabled={!isActive}>
            Contribute
          </TabsTrigger>
          <TabsTrigger value="claim" disabled={!takeover.account.isFinalized}>
            Claim
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Takeover Overview</CardTitle>
              <CardDescription>
                {takeover.account.isFinalized
                  ? takeover.account.isSuccessful
                    ? "Successfully completed!"
                    : "Did not meet target"
                  : "Active campaign"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Progress</span>
                  <span>
                    {formatAmount(totalContributed, v1Decimals)} / {formatAmount(minAmount, v1Decimals)} V1
                  </span>
                </div>
                <Progress value={progressPercentage} />
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{progressPercentage.toFixed(1)}% Complete</span>
                  <span>Goal: {formatAmount(minAmount, v1Decimals)} V1</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-muted rounded-lg">
                  <div className="text-sm text-muted-foreground">Time Remaining</div>
                  <div className="text-xl font-semibold">{timeLeft}</div>
                </div>
                <div className="p-4 bg-muted rounded-lg">
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
                    {formatAmount(userContribution, v1Decimals)} V1
                  </div>
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
                  {loading ? <LoadingSpinner /> : "Finalize Takeover"}
                </Button>
              </CardFooter>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="contribute">
          <Card>
            <CardHeader>
              <CardTitle>Contribute V1 Tokens</CardTitle>
              <CardDescription>
                Contribute to the community takeover campaign
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
                    <Label>Amount to Contribute</Label>
                    <Input
                      type="number"
                      value={contributionAmount}
                      onChange={(e) => setContributionAmount(e.target.value)}
                      placeholder="Enter V1 amount"
                      disabled={loading}
                    />
                    <div className="text-sm text-muted-foreground">
                      Available: {formatAmount(userTokenBalance, v1Decimals)} V1
                    </div>
                  </div>
                  <Button 
                    onClick={handleContribute}
                    disabled={loading || !contributionAmount || userTokenBalance < Number(contributionAmount)}
                    className="w-full"
                  >
                    {loading ? <LoadingSpinner /> : "Contribute"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="claim">
          <Card>
            <CardHeader>
              <CardTitle>Claim Tokens</CardTitle>
              <CardDescription>
                {takeover.account.isSuccessful
                  ? "Claim your V2 tokens"
                  : "Claim your V1 refund"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {contributorData ? (
                <div className="space-y-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground">Your Contribution</div>
                    <div className="text-xl font-semibold">
                      {formatAmount(userContribution, v1Decimals)} V1
                    </div>
                  </div>
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground">To Receive</div>
                    <div className="text-xl font-semibold">
                      {formatAmount(
                        takeover.account.isSuccessful 
                          ? userContribution * takeover.account.customRewardRate
                          : userContribution,
                        takeover.account.isSuccessful ? v2Decimals : v1Decimals
                      )}{" "}
                      {takeover.account.isSuccessful ? "V2" : "V1"}
                    </div>
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
                        : "Claim Tokens"}
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