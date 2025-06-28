"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { Transaction, TransactionInstruction, PublicKey, SystemProgram } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/loading-spinner";
import { WalletMultiButton } from "@/components/wallet-multi-button";
import { useToast } from "@/components/ui/use-toast";
import Link from "next/link";

const PROGRAM_ID = process.env.NEXT_PUBLIC_PROGRAM_ID || "";

// Helper function to get associated token address (compatible with older SPL versions)
function getAssociatedTokenAddressLegacy(mint: PublicKey, owner: PublicKey): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL") // Associated Token Program
  );
  return address;
}

// Helper function to create ATA instruction (compatible with older SPL versions)
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
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"), isSigner: false, isWritable: false },
    ],
    programId: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
    data: Buffer.from([]),
  });
}

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

interface DebugInfo {
  responseStatus: number;
  responseTime: number;
  retryCount: number;
  requestUrl: string;
  error?: string;
}

interface ApiHealth {
  endpoints: Record<string, any>;
}

// Simple claims debugger class
class ClaimsDebugger {
  async fetchClaimsWithDebug(contributor: string, apiEndpoint?: string): Promise<{
    success: boolean;
    claims?: ClaimDetails[];
    error?: string;
    debugInfo: DebugInfo;
  }> {
    const startTime = Date.now();
    const url = apiEndpoint || `/api/claims?contributor=${contributor}`;
    
    let retryCount = 0;
    let lastError: string | undefined;
    
    while (retryCount < 3) {
      try {
        const response = await fetch(url);
        const responseTime = Date.now() - startTime;
        
        const debugInfo: DebugInfo = {
          responseStatus: response.status,
          responseTime,
          retryCount,
          requestUrl: url
        };
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error);
        }
        
        return {
          success: true,
          claims: data.claims,
          debugInfo
        };
        
      } catch (error: any) {
        lastError = error.message;
        retryCount++;
        
        if (retryCount < 3) {
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
    }
    
    return {
      success: false,
      error: lastError,
      debugInfo: {
        responseStatus: 0,
        responseTime: Date.now() - startTime,
        retryCount,
        requestUrl: url,
        error: lastError
      }
    };
  }

  async testApiHealth(): Promise<ApiHealth> {
    const endpoints = [
      '/api/claims',
      '/api/takeovers',
      '/api/contributions'
    ];
    
    const results: Record<string, any> = {};
    
    for (const endpoint of endpoints) {
      try {
        const startTime = Date.now();
        const response = await fetch(`${endpoint}?test=true`);
        const responseTime = Date.now() - startTime;
        
        results[endpoint] = {
          status: response.ok ? 'ok' : 'error',
          responseTime,
          statusCode: response.status
        };
      } catch (error) {
        results[endpoint] = {
          status: 'error',
          responseTime: 0,
          error: (error as Error).message
        };
      }
    }
    
    return { endpoints: results };
  }
}

export default function ClaimsPage() {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [claims, setClaims] = useState<ClaimDetails[]>([]);
  const [loading, setLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [apiHealth, setApiHealth] = useState<ApiHealth | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const { toast } = useToast();

  const claimsDebugger = new ClaimsDebugger();

  // Updated fetchClaims to handle optional forceRefresh parameter
  const fetchClaims = async (forceRefresh: boolean = false) => {
    if (!publicKey) return;

    try {
      setLoading(true);
      setError(null);
      
      console.log('🔍 Fetching claims for:', publicKey.toString());
      
      // Use enhanced API if force refresh is requested
      const apiEndpoint = forceRefresh 
        ? `/api/claims/enhanced?contributor=${publicKey.toString()}&refresh=true`
        : `/api/claims?contributor=${publicKey.toString()}`;
      
      const result = await claimsDebugger.fetchClaimsWithDebug(publicKey.toString(), apiEndpoint);
      setDebugInfo(result.debugInfo);
      
      if (!result.success) {
        throw new Error(result.error);
      }
      
      console.log('📊 Found claims:', result.claims?.length || 0);
      
      // Transform API response to component format
      const userClaims: ClaimDetails[] = (result.claims || []).map((claim: any) => ({
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
      
      // Show notification if there are claimable items
      const claimableCount = userClaims.filter(c => !c.isClaimed).length;
      if (claimableCount > 0) {
        toast({
          title: "🎁 Claims Available!",
          description: `You have ${claimableCount} claim${claimableCount !== 1 ? 's' : ''} ready to process.`,
          duration: 5000
        });
      }
      
    } catch (error: any) {
      console.error('❌ Error fetching claims:', error);
      setError(error.message);
      
      toast({
        title: "Error Loading Claims",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const testSystemHealth = async () => {
    try {
      const health = await claimsDebugger.testApiHealth();
      setApiHealth(health);
      setShowDebug(true);
    } catch (error) {
      console.error('Health check failed:', error);
    }
  };

  const processClaim = async (claim: ClaimDetails) => {
    if (!publicKey || !signTransaction) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet to claim tokens",
        variant: "destructive"
      });
      return;
    }

    try {
      setIsProcessing(true);
      
      console.log('🎁 Processing claim for:', claim.tokenName);
      console.log('📍 Claim details:', claim);
      
      // Create claim instruction based on your program's airdrop_v2 instruction
      const programId = new PublicKey(PROGRAM_ID);
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
      
      // Use legacy function to get associated token address
      const userTokenAccount = getAssociatedTokenAddressLegacy(tokenMint, publicKey);
      
      // Check if ATA exists
      const ataInfo = await connection.getAccountInfo(userTokenAccount);
      
      const transaction = new Transaction();
      
      // Create ATA if it doesn't exist
      if (!ataInfo) {
        console.log('🏦 Creating associated token account...');
        // Use legacy function to create ATA instruction
        const createAtaIx = createAssociatedTokenAccountInstructionLegacy(
          publicKey,        // payer
          userTokenAccount, // associatedToken
          publicKey,        // owner
          tokenMint         // mint
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
      
      // Record the claim in database
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
        
        if (!recordResponse.ok) {
          // Show warning but don't fail completely since blockchain succeeded
          toast({
            title: "⚠️ Partial Success",
            description: `Tokens claimed successfully on blockchain but database update failed. Transaction: ${signature.slice(0, 8)}...`,
            duration: 10000
          });
        } else {
          const recordData = await recordResponse.json();
          if (recordData.success) {
            console.log('✅ Successfully recorded in database:', recordData);
          }
        }
        
      } catch (dbError: any) {
        console.error('❌ Database recording error:', dbError);
        
        // Show warning but don't fail completely since blockchain succeeded
        toast({
          title: "⚠️ Blockchain Success, Database Error",
          description: `Your tokens were claimed successfully on the blockchain (${signature.slice(0, 8)}...) but there was an issue updating our database.`,
          duration: 10000
        });
      }

      toast({
        title: "🎉 Success!",
        description: `Claimed ${(Number(claim.claimableAmount) / 1_000_000).toLocaleString()} tokens successfully`,
      });

      // Refresh claims list
      setTimeout(() => {
        fetchClaims();
      }, 2000);

    } catch (error: any) {
      console.error('❌ Claim processing error:', error);
      
      let errorMessage = error.message || "Unknown error occurred";
      
      if (error.message?.includes('User rejected')) {
        errorMessage = "Transaction was cancelled by user";
      } else if (error.message?.includes('insufficient')) {
        errorMessage = "Insufficient funds for transaction fees";
      }
      
      toast({
        title: "Claim Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (publicKey) {
      fetchClaims();
    } else {
      setClaims([]);
      setError(null);
    }
  }, [publicKey]);

  // Don't render if wallet not connected
  if (!publicKey) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-semibold mb-4">Connect Your Wallet</h2>
            <p className="text-gray-600 mb-4">
              Please connect your wallet to view and claim your tokens
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
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Error Loading Claims</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <div className="flex gap-2 justify-center">
              <Button onClick={() => fetchClaims()}>Retry</Button>
              <Button variant="outline" onClick={testSystemHealth}>Run Diagnostics</Button>
            </div>
          </CardContent>
        </Card>

        {/* Debug Information */}
        {showDebug && (debugInfo || apiHealth) && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardHeader>
              <CardTitle className="text-yellow-800 flex items-center justify-between">
                🔧 Debug Information
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowDebug(false)}
                  className="text-yellow-600 hover:text-yellow-800"
                >
                  ×
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {debugInfo && (
                <div>
                  <h4 className="font-medium text-yellow-800 mb-2">Claims API Debug:</h4>
                  <div className="text-sm grid grid-cols-2 gap-2">
                    <div>Response Status: {debugInfo.responseStatus}</div>
                    <div>Response Time: {debugInfo.responseTime}ms</div>
                    <div>Retry Count: {debugInfo.retryCount}</div>
                    <div>URL: {debugInfo.requestUrl}</div>
                  </div>
                </div>
              )}

              {apiHealth && (
                <div>
                  <h4 className="font-medium text-yellow-800 mb-2">API Health Check:</h4>
                  <div className="text-xs space-y-1">
                    {Object.entries(apiHealth.endpoints).map(([endpoint, status]: [string, any]) => (
                      <div key={endpoint} className="flex justify-between">
                        <span>{endpoint}:</span>
                        <span className={status.status === 'ok' ? 'text-green-600' : 'text-red-600'}>
                          {status.status} ({status.responseTime}ms)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
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
        <div className="flex gap-2 justify-center mt-2">
          <Button variant="outline" size="sm" onClick={() => fetchClaims()}>
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => fetchClaims(true)}>
            Force Sync
          </Button>
          <Button variant="outline" size="sm" onClick={testSystemHealth}>
            System Health
          </Button>
        </div>
      </div>

      {claims.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-6xl mb-4">🎁</div>
            <h2 className="text-xl font-semibold mb-2">No Claims Found</h2>
            <p className="text-gray-600 mb-4">
              You don&apos;t have any claimable tokens yet. Participate in takeover campaigns to earn rewards!
            </p>
            <Link href="/takeovers">
              <Button>Browse Active Takeovers</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Claims Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-green-600">{claimableCount}</div>
                <div className="text-sm text-gray-600">Ready to Claim</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-gray-600">{claimedCount}</div>
                <div className="text-sm text-gray-600">Already Claimed</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-blue-600">
                  {(totalClaimableValue / 1_000_000).toLocaleString()}
                </div>
                <div className="text-sm text-gray-600">Total Claimable Value</div>
              </CardContent>
            </Card>
          </div>

          {/* Claims List */}
          <div className="space-y-4">
            {claims.map((claim) => {
              const contributionTokens = Number(claim.contributionAmount) / 1_000_000;
              const claimableTokens = Number(claim.claimableAmount) / 1_000_000;
              
              return (
                <Card 
                  key={`${claim.takeoverId}-${claim.id}`}
                  className={`transition-colors ${
                    !claim.isClaimed ? 'border-green-200 bg-green-50' : 'border-gray-200'
                  }`}
                >
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        {claim.tokenName} Takeover
                        <span 
                          className={`text-xs px-2 py-1 rounded-full ${
                            claim.isSuccessful 
                              ? "bg-green-100 text-green-800" 
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {claim.isSuccessful ? "Successful" : "Refund"}
                        </span>
                        {claim.isClaimed && (
                          <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                            ✓ Claimed
                          </span>
                        )}
                      </span>
                    </CardTitle>
                    <CardDescription>
                      Contribution: {contributionTokens.toLocaleString()} {claim.tokenName} • 
                      Claimable: {claimableTokens.toLocaleString()} {
                        claim.isSuccessful 
                          ? `${claim.tokenName} V2` 
                          : claim.tokenName
                      }
                    </CardDescription>
                  </CardHeader>
                  
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                      <div>
                        <div className="text-gray-500">Contribution</div>
                        <div className="font-medium">
                          {contributionTokens.toLocaleString()} {claim.tokenName}
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">Claimable Amount</div>
                        <div className="font-medium">
                          {claimableTokens.toLocaleString()} {
                            claim.isSuccessful 
                              ? `${claim.tokenName} V2` 
                              : claim.tokenName
                          }
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-500">Multiplier</div>
                        <div className="font-medium">
                          {claim.isSuccessful 
                            ? `${claim.customRewardRate}x` 
                            : '1.0x (Refund)'
                          }
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <Link href={`/takeover/${claim.takeoverAddress}`}>
                        <Button variant="outline" size="sm">
                          View Takeover
                        </Button>
                      </Link>
                      
                      {!claim.isClaimed && (
                        <Button 
                          onClick={() => processClaim(claim)}
                          disabled={isProcessing}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {isProcessing ? (
                            <>
                              <LoadingSpinner className="mr-2" />
                              Processing...
                            </>
                          ) : (
                            'Claim Tokens'
                          )}
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