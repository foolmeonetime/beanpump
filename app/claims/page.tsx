// app/claims/page.tsx - Improved version with better error handling
"use client";

import { useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useToast } from "@/components/ui/use-toast";
import { WalletMultiButton } from "@/components/wallet-multi-button";
import Link from "next/link";
import { 
  PublicKey, 
  Transaction,
  TransactionInstruction
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

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

export default function ClaimsPage() {
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
      
      console.log('🔍 Fetching claims for:', publicKey.toString());
      
      const response = await fetch(`/api/claims?contributor=${publicKey.toString()}`);
      
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
      
      // 🔥 IMPROVED: Better error handling for database recording
      try {
        const recordResponse = await fetch('/api/claims', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            contributionId: claim.id,
            contributor: publicKey.toString(),
            takeoverAddress: claim.takeoverAddress,
            transactionSignature: signature
          })
        });
        
        console.log('🔍 Database response status:', recordResponse.status);
        
        // Get response text first to see what we're dealing with
        const responseText = await recordResponse.text();
        console.log('🔍 Raw database response:', responseText);
        
        if (!recordResponse.ok) {
          let errorMessage = `HTTP ${recordResponse.status}`;
          
          try {
            const errorData = JSON.parse(responseText);
            errorMessage = errorData.error || errorData.message || errorMessage;
            console.error('🔍 Parsed database error:', errorData);
          } catch (parseError) {
            console.error('🔍 Failed to parse error response:', parseError);
            errorMessage = `${errorMessage}: ${responseText}`;
          }
          
          // Show warning but don't fail completely since blockchain succeeded
          toast({
            title: "⚠️ Partial Success",
            description: `Tokens claimed successfully on blockchain but database update failed: ${errorMessage}. Transaction: ${signature.slice(0, 8)}...`,
            duration: 10000
          });
          
          // Still refresh to see if the claim shows up
          setTimeout(() => {
            fetchClaims();
          }, 3000);
          
          return; // Don't throw error since blockchain succeeded
        }
        
        let recordData;
        try {
          recordData = JSON.parse(responseText);
        } catch (parseError) {
          throw new Error(`Invalid JSON response from database: ${responseText}`);
        }
        
        if (!recordData.success) {
          throw new Error(recordData.error || 'Database operation failed');
        }
        
        console.log('✅ Successfully recorded in database:', recordData);
        
      } catch (dbError: any) {
        console.error('❌ Database recording error:', dbError);
        
        // Show warning but don't fail completely since blockchain succeeded
        toast({
          title: "⚠️ Blockchain Success, Database Error",
          description: `Your tokens were claimed successfully on the blockchain (${signature.slice(0, 8)}...) but there was an issue updating our database. Your tokens are safe in your wallet.`,
          duration: 12000
        });
        
        // Still try to refresh in case it worked
        setTimeout(() => {
          fetchClaims();
        }, 3000);
        
        return; // Don't throw error since blockchain succeeded
      }
      
      // Full success
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
      
      // Provide more specific error messages
      let errorMessage = error.message || 'An error occurred while processing your claim';
      
      if (error.message?.includes('Transaction failed')) {
        errorMessage = 'Blockchain transaction failed: ' + error.message;
      } else if (error.message?.includes('insufficient funds')) {
        errorMessage = 'Insufficient SOL for transaction fees. Please add some SOL to your wallet.';
      } else if (error.message?.includes('User rejected')) {
        errorMessage = 'Transaction was cancelled by user.';
      }
      
      toast({
        title: "Claim Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setClaiming(null);
    }
  };

  useEffect(() => {
    if (publicKey) {
      fetchClaims();
    }
  }, [publicKey]);

  if (!publicKey) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <h2 className="text-2xl font-bold mb-4">Connect Wallet to View Claims</h2>
            <p className="text-gray-600 mb-6">
              Connect your wallet to view and claim your tokens from completed takeovers.
            </p>
            <WalletMultiButton />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <LoadingSpinner />
            <p className="text-sm text-gray-500 mt-2">Loading your claims...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Error Loading Claims</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button onClick={fetchClaims}>Retry</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const claimableCount = claims.filter(c => !c.isClaimed).length;
  const claimedCount = claims.filter(c => c.isClaimed).length;
  const totalClaimableValue = claims
    .filter(c => !c.isClaimed)
    .reduce((sum, claim) => sum + Number(claim.claimableAmount), 0);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-2">Your Token Claims</h1>
        <p className="text-gray-600">
          View and claim tokens from completed takeover campaigns
        </p>
      </div>

      {claims.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-6xl mb-4">🎁</div>
            <h2 className="text-xl font-semibold mb-2">No Claims Found</h2>
            <p className="text-gray-600 mb-4">
              You don't have any claimable tokens yet. Participate in takeover campaigns to earn rewards!
            </p>
            <Link href="/">
              <Button>Browse Takeovers</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Claims Summary</span>
                <div className="flex items-center gap-2">
                  {claimableCount > 0 && (
                    <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                      {claimableCount} Ready
                    </span>
                  )}
                  <Button onClick={fetchClaims} variant="ghost" size="sm">
                    Refresh
                  </Button>
                </div>
              </CardTitle>
              <CardDescription>
                {publicKey.toString().slice(0, 8)}...{publicKey.toString().slice(-4)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{claims.length}</div>
                  <div className="text-sm text-gray-500">Total Claims</div>
                </div>
                <div className="p-4 bg-green-50 dark:bg-green-900 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{claimableCount}</div>
                  <div className="text-sm text-gray-500">Ready to Claim</div>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="text-2xl font-bold text-gray-600">{claimedCount}</div>
                  <div className="text-sm text-gray-500">Already Claimed</div>
                </div>
                <div className="p-4 bg-purple-50 dark:bg-purple-900 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {(totalClaimableValue / 1_000_000).toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-500">Tokens Ready</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Claims List */}
          <div className="space-y-4">
            {claims.map((claim) => {
              const contributionTokens = Number(claim.contributionAmount) / 1_000_000;
              const claimableTokens = Number(claim.claimableAmount) / 1_000_000;
              const isProcessing = claiming === claim.id.toString();
              
              return (
                <Card key={claim.id} className={`${claim.isClaimed ? 'opacity-75' : ''}`}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="text-2xl">
                          {claim.isSuccessful ? '🎉' : '💰'}
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold">{claim.tokenName} Takeover</h3>
                          <p className="text-sm text-gray-500">
                            {claim.isSuccessful ? 'Successful Campaign' : 'Refund Available'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {claim.isClaimed ? (
                          <span className="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                            ✓ Claimed
                          </span>
                        ) : (
                          <span className="px-3 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                            Ready to Claim
                          </span>
                        )}
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                      <div>
                        <div className="text-sm text-gray-500">Your Contribution</div>
                        <div className="font-medium">
                          {contributionTokens.toLocaleString()} {claim.tokenName}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">
                          {claim.isSuccessful ? 'Reward Amount' : 'Refund Amount'}
                        </div>
                        <div className="font-medium">
                          {claimableTokens.toLocaleString()}{' '}
                          {claim.isSuccessful 
                            ? `V2 tokens (${claim.customRewardRate}x)` 
                            : claim.tokenName
                          }
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Token Address</div>
                        <div className="font-mono text-xs">
                          {claim.tokenMint.slice(0, 8)}...{claim.tokenMint.slice(-4)}
                        </div>
                      </div>
                    </div>
                    
                    {claim.isSuccessful && claim.v2TokenMint && !claim.isClaimed && (
                      <div className="p-3 bg-green-50 border border-green-200 rounded-lg mb-4">
                        <h4 className="font-medium text-green-800 mb-1">🎉 V2 Token Ready!</h4>
                        <p className="text-sm text-green-700">
                          Claim your {claimableTokens.toLocaleString()} V2 {claim.tokenName} tokens now
                        </p>
                        <div className="text-xs font-mono text-green-600 mt-1">
                          {claim.v2TokenMint}
                        </div>
                      </div>
                    )}
                  </CardContent>
                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between">
                      <Link href={`/takeover/${claim.takeoverAddress}`}>
                        <Button variant="outline" size="sm">
                          View Takeover
                        </Button>
                      </Link>
                      
                      {!claim.isClaimed ? (
                        <Button 
                          onClick={() => processClaim(claim)}
                          disabled={isProcessing}
                          className={`${
                            claim.isSuccessful 
                              ? 'bg-green-600 hover:bg-green-700' 
                              : 'bg-blue-600 hover:bg-blue-700'
                          }`}
                        >
                          {isProcessing ? (
                            <div className="flex items-center">
                              <LoadingSpinner />
                              <span className="ml-2">Processing...</span>
                            </div>
                          ) : (
                            <>
                              {claim.isSuccessful ? '🎉 Claim Rewards' : '💰 Claim Refund'}
                            </>
                          )}
                        </Button>
                      ) : (
                        <Button disabled variant="outline">
                          Already Claimed ✓
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}