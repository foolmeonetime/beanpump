// app/claim/[address]/page.tsx - Specific takeover claims page
"use client";

import { useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useToast } from "@/components/ui/use-toast";
import { WalletMultiButton } from "@/components/wallet-multi-button";
import { 
  PublicKey, 
  Transaction,
  TransactionInstruction
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import Link from "next/link";
import { useParams } from "next/navigation";

interface ClaimDetails {
  id: number;
  takeoverId: number;
  takeoverAddress: string;
  tokenName: string;
  contributionAmount: string;
  isSuccessful: boolean;
  customRewardRate: number;
  claimableAmount: string;
  tokenMint: string;
  claimType: 'refund' | 'reward';
  vault: string;
  v1TokenMint: string;
  v2TokenMint?: string;
  refundAmount: string;
  rewardAmount: string;
  isClaimed: boolean;
  transactionSignature: string;
  createdAt: string;
}

// Helper to get associated token address
function getAssociatedTokenAddressLegacy(mint: PublicKey, owner: PublicKey): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")
  );
  return address;
}

// Helper to create ATA instruction if needed
function createAssociatedTokenAccountInstructionLegacy(
  payer: PublicKey,
  associatedToken: PublicKey,
  owner: PublicKey,
  mint: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
    ],
    programId: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
    data: Buffer.from([]),
  });
}

export default function ClaimPage() {
  const params = useParams();
  const takeoverAddress = params.address as string;
  
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [claims, setClaims] = useState<ClaimDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchClaims = async () => {
    if (!publicKey) return;

    try {
      setLoading(true);
      setError(null);
      
      console.log('🔍 Fetching claims for takeover:', takeoverAddress);
      console.log('🔍 User:', publicKey.toString());
      
      const response = await fetch(
        `/api/claims?contributor=${publicKey.toString()}&takeover=${takeoverAddress}`
      );
      
      if (!response.ok) {
        throw new Error('Failed to fetch claims');
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error);
      }
      
      console.log('📊 Found claims:', data.claims);
      
      // Transform API response to component format
      const userClaims: ClaimDetails[] = data.claims.map((claim: any) => ({
        id: claim.id,
        takeoverId: claim.takeoverId,
        takeoverAddress: claim.takeoverAddress,
        tokenName: claim.tokenName,
        contributionAmount: claim.contributionAmount,
        isSuccessful: claim.isSuccessful,
        customRewardRate: claim.customRewardRate,
        claimableAmount: claim.isSuccessful ? claim.rewardAmount : claim.refundAmount,
        tokenMint: claim.isSuccessful ? claim.v2TokenMint : claim.v1TokenMint,
        claimType: claim.isSuccessful ? 'reward' : 'refund',
        vault: claim.vault,
        v1TokenMint: claim.v1TokenMint,
        v2TokenMint: claim.v2TokenMint,
        refundAmount: claim.refundAmount,
        rewardAmount: claim.rewardAmount,
        isClaimed: claim.isClaimed || false,
        transactionSignature: claim.transactionSignature || '',
        createdAt: claim.createdAt || ''
      }));

      setClaims(userClaims);
      
    } catch (error: any) {
      console.error('❌ Error fetching claims:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const processClaim = async (claim: ClaimDetails) => {
    if (!publicKey || !signTransaction) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet to claim.",
        variant: "destructive"
      });
      return;
    }

    try {
      setClaiming(claim.id.toString());
      
      console.log('🎁 Processing claim for:', claim.tokenName);
      console.log('📍 Claim details:', claim);
      
      // Create claim instruction based on your program's airdrop_v2 instruction
      const programId = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID!);
      const takeoverPubkey = new PublicKey(claim.takeoverAddress);
      const tokenMint = new PublicKey(claim.tokenMint);
      const vaultPubkey = new PublicKey(claim.vault);
      
      // Get contributor PDA
      const [contributorPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("contributor"),
          takeoverPubkey.toBuffer(),
          publicKey.toBuffer()
        ],
        programId
      );
      
      // Get user's token account
      const userTokenAccount = getAssociatedTokenAddressLegacy(tokenMint, publicKey);
      
      // Check if ATA exists
      const ataInfo = await connection.getAccountInfo(userTokenAccount);
      
      const transaction = new Transaction();
      
      // Create ATA if it doesn't exist
      if (!ataInfo) {
        console.log('🏦 Creating associated token account...');
        const createAtaIx = createAssociatedTokenAccountInstructionLegacy(
          publicKey,
          userTokenAccount,
          publicKey,
          tokenMint
        );
        transaction.add(createAtaIx);
      }
      
      // Create the claim instruction (airdrop_v2 discriminator from IDL)
      const claimAmount = BigInt(claim.claimableAmount);
      const amountBuffer = Buffer.alloc(8);
      amountBuffer.writeBigUInt64LE(claimAmount, 0);
      
      const claimInstruction = new TransactionInstruction({
        keys: [
          { pubkey: publicKey, isSigner: true, isWritable: true },        // authority (contributor)
          { pubkey: publicKey, isSigner: true, isWritable: true },        // contributor
          { pubkey: takeoverPubkey, isSigner: false, isWritable: true },  // takeover
          { pubkey: contributorPDA, isSigner: false, isWritable: true },  // contributor_account
          { pubkey: tokenMint, isSigner: false, isWritable: true },       // v2_mint
          { pubkey: userTokenAccount, isSigner: false, isWritable: true }, // contributor_ata
          { pubkey: vaultPubkey, isSigner: false, isWritable: true },     // vault
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
        ],
        programId,
        data: Buffer.concat([
          Buffer.from([140, 11, 185, 155, 26, 142, 21, 45]), // airdrop_v2 discriminator
          amountBuffer
        ])
      });

      transaction.add(claimInstruction);
      transaction.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
      transaction.feePayer = publicKey;

      console.log('🔐 Signing transaction...');
      const signedTransaction = await signTransaction(transaction);
      
      console.log('📤 Sending transaction...');
      const signature = await connection.sendRawTransaction(signedTransaction.serialize());
      
      console.log('⏳ Waiting for confirmation...', signature);
      await connection.confirmTransaction(signature, 'confirmed');
      
      console.log('✅ Transaction confirmed, recording claim...');
      
      // Record the claim in the database
      const recordResponse = await fetch('/api/claims', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contributionId: claim.id,
          contributor: publicKey.toString(),
          takeoverAddress: claim.takeoverAddress,
          transactionSignature: signature
        })
      });
      
      if (!recordResponse.ok) {
        throw new Error('Failed to record claim in database');
      }
      
      const recordData = await recordResponse.json();
      
      if (!recordData.success) {
        throw new Error(recordData.error);
      }
      
      toast({
        title: "🎉 Claim Successful!",
        description: `Successfully claimed ${Number(claim.claimableAmount) / 1_000_000} ${
          claim.claimType === 'reward' ? 'V2 tokens' : claim.tokenName
        }. View on Solscan: https://solscan.io/tx/${signature}?cluster=devnet`,
        duration: 10000
      });
      
      // Refresh claims
      setTimeout(() => {
        fetchClaims();
      }, 2000);
      
    } catch (error: any) {
      console.error('❌ Claim error:', error);
      toast({
        title: "Claim Failed",
        description: error.message || 'An error occurred while processing your claim',
        variant: "destructive"
      });
    } finally {
      setClaiming(null);
    }
  };

  useEffect(() => {
    if (publicKey && takeoverAddress) {
      fetchClaims();
    }
  }, [publicKey, takeoverAddress]);

  if (!publicKey) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-semibold mb-4">Wallet Required</h2>
            <p className="text-gray-600 mb-4">Connect your wallet to view and process claims for this takeover.</p>
            <WalletMultiButton />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <LoadingSpinner />
            <p className="text-sm text-gray-500 mt-2">Loading claims...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Error</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <div className="space-x-2">
              <Button onClick={fetchClaims}>Retry</Button>
              <Link href="/claims">
                <Button variant="outline">View All Claims</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (claims.length === 0) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-6xl mb-4">🤷‍♂️</div>
            <h2 className="text-xl font-semibold mb-4">No Claims Found</h2>
            <p className="text-gray-600 mb-4">
              You don't have any claimable contributions for this takeover.
            </p>
            <div className="space-x-2">
              <Link href={`/takeover/${takeoverAddress}`}>
                <Button>View Takeover</Button>
              </Link>
              <Link href="/claims">
                <Button variant="outline">View All Claims</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalClaimable = claims.reduce((sum, claim) => sum + Number(claim.claimableAmount), 0);
  const hasUnclaimedTokens = claims.some(c => !c.isClaimed);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Claim Your Tokens</h1>
        <p className="text-gray-600">
          Process your claims for takeover: {takeoverAddress.slice(0, 8)}...{takeoverAddress.slice(-4)}
        </p>
      </div>

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Claim Summary</span>
            <span className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-full">
              {claims.length} Claim{claims.length !== 1 ? 's' : ''}
            </span>
          </CardTitle>
          <CardDescription>
            Connected: {publicKey.toString().slice(0, 8)}...{publicKey.toString().slice(-4)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Total Claimable:</span><br />
              {(totalClaimable / 1_000_000).toLocaleString()} tokens
            </div>
            <div>
              <span className="font-medium">Claim Type:</span><br />
              {claims[0]?.claimType === 'reward' ? '🎉 Reward Tokens' : '💰 Refund'}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Individual Claims */}
      <div className="space-y-4">
        {claims.map((claim) => {
          const contributionTokens = Number(claim.contributionAmount) / 1_000_000;
          const claimableTokens = Number(claim.claimableAmount) / 1_000_000;
          const isProcessing = claiming === claim.id.toString();
          
          return (
            <Card key={claim.id} className={claim.isClaimed ? 'opacity-75' : ''}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-lg">
                  <div className="flex items-center gap-3">
                    <div className="text-2xl">
                      {claim.isSuccessful ? '🎉' : '💰'}
                    </div>
                    <div>
                      <span>{claim.tokenName} Contribution</span>
                      <div className="text-sm font-normal text-gray-500">
                        Contribution #{claim.id}
                      </div>
                    </div>
                  </div>
                  <span 
                    className={`text-xs px-2 py-1 rounded-full ${
                      claim.isClaimed
                        ? "bg-gray-100 text-gray-600"
                        : claim.isSuccessful 
                          ? "bg-green-100 text-green-800" 
                          : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {claim.isClaimed ? "✓ Claimed" : claim.isSuccessful ? "Success" : "Refund"}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="font-medium">Original Contribution:</span><br />
                    {contributionTokens.toLocaleString()} {claim.tokenName}
                  </div>
                  <div>
                    <span className="font-medium">
                      {claim.isSuccessful ? 'Reward Amount:' : 'Refund Amount:'}
                    </span><br />
                    {claimableTokens.toLocaleString()}{' '}
                    {claim.isSuccessful 
                      ? `V2 tokens (${claim.customRewardRate}x)` 
                      : claim.tokenName
                    }
                  </div>
                </div>
                
                {claim.isSuccessful && claim.v2TokenMint && !claim.isClaimed && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <h4 className="font-medium text-green-800 mb-1">V2 Token Details</h4>
                    <div className="text-xs font-mono text-green-600">
                      {claim.v2TokenMint}
                    </div>
                    <p className="text-xs text-green-700 mt-1">
                      This is your new V2 token address. Save it for your records!
                    </p>
                  </div>
                )}
                
                <Button 
                  onClick={() => processClaim(claim)}
                  disabled={isProcessing || claim.isClaimed}
                  className={`w-full ${
                    claim.isClaimed
                      ? 'bg-gray-400'
                      : claim.isSuccessful 
                        ? 'bg-green-600 hover:bg-green-700' 
                        : 'bg-yellow-600 hover:bg-yellow-700'
                  }`}
                >
                  {claim.isClaimed ? (
                    "Already Claimed ✓"
                  ) : isProcessing ? (
                    <div className="flex items-center justify-center">
                      <LoadingSpinner />
                      <span className="ml-2">Processing...</span>
                    </div>
                  ) : (
                    <>
                      {claim.isSuccessful ? '🎉 Claim Reward' : '💰 Claim Refund'}
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Navigation */}
      <div className="flex justify-center space-x-4">
        <Link href={`/takeover/${takeoverAddress}`}>
          <Button variant="outline">← Back to Takeover</Button>
        </Link>
        <Link href="/claims">
          <Button variant="outline">View All Claims</Button>
        </Link>
      </div>
    </div>
  );
}