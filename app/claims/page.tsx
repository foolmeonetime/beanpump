// app/claims/page.tsx - Enhanced with comprehensive debugging while preserving all functionality
"use client";

import { useEffect, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useToast } from "@/components/ui/use-toast";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
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

// Enhanced debugging class for API calls
class ClaimsDebugger {
  private baseUrl: string;

  constructor(baseUrl: string = '/api') {
    this.baseUrl = baseUrl;
  }

  async fetchClaimsWithDebug(contributor: string, takeoverAddress?: string) {
    const startTime = Date.now();
    let retryCount = 0;
    const maxRetries = 3;

    const params = new URLSearchParams({ contributor });
    if (takeoverAddress) {
      params.append('takeover', takeoverAddress);
    }

    const requestUrl = `${this.baseUrl}/claims?${params.toString()}`;
    
    const debugInfo = {
      requestUrl,
      responseTime: 0,
      retryCount: 0,
      responseStatus: 0,
      responseHeaders: {} as Record<string, string>
    };

    // Retry logic for network issues
    while (retryCount <= maxRetries) {
      try {
        console.log(`🔍 Fetching claims (attempt ${retryCount + 1}):`, requestUrl);

        const response = await fetch(requestUrl, {
          cache: 'no-store',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        });

        debugInfo.responseStatus = response.status;
        debugInfo.responseHeaders = Object.fromEntries(response.headers.entries());
        debugInfo.responseTime = Date.now() - startTime;
        debugInfo.retryCount = retryCount;

        // Get response text first to handle both JSON and non-JSON responses
        const responseText = await response.text();
        console.log('📄 Raw response preview:', responseText.substring(0, 200));

        if (!response.ok) {
          console.error(`❌ Claims API error (${response.status}):`, responseText);
          
          // Don't retry on client errors (4xx)
          if (response.status >= 400 && response.status < 500) {
            return {
              success: false,
              error: `API error ${response.status}: ${responseText}`,
              debugInfo
            };
          }

          // Retry on server errors (5xx) or network issues
          if (retryCount < maxRetries) {
            retryCount++;
            console.log(`⏳ Retrying in ${retryCount} seconds...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
            continue;
          }

          return {
            success: false,
            error: `API error after ${maxRetries} retries: ${response.status} ${responseText}`,
            debugInfo
          };
        }

        // Try to parse JSON
        let data;
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.error('❌ JSON parse error:', parseError);
          return {
            success: false,
            error: `Invalid JSON response: ${responseText.substring(0, 100)}...`,
            debugInfo
          };
        }

        console.log('✅ Claims fetched successfully:', data);

        // Handle both data formats: {claims: []} and {data: {claims: []}}
        const claims = data.claims || data.data?.claims || [];

        return {
          success: true,
          claims: claims,
          debugInfo
        };

      } catch (fetchError: any) {
        console.error(`❌ Claims fetch error (attempt ${retryCount + 1}):`, fetchError);
        
        if (retryCount < maxRetries) {
          retryCount++;
          console.log(`⏳ Retrying in ${retryCount} seconds...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          continue;
        }

        debugInfo.responseTime = Date.now() - startTime;
        debugInfo.retryCount = retryCount;

        return {
          success: false,
          error: `Network error after ${maxRetries} retries: ${fetchError.message}`,
          debugInfo
        };
      }
    }

    // Should never reach here, but TypeScript requires it
    return {
      success: false,
      error: 'Unexpected error in retry loop',
      debugInfo
    };
  }

  async testApiHealth() {
    const endpoints = [
      '/api/claims',
      '/api/contributions',
      '/api/takeovers'
    ];

    const results: Record<string, any> = {};

    for (const endpoint of endpoints) {
      const startTime = Date.now();
      try {
        // Try HEAD first, fall back to GET with limit
        let response;
        try {
          response = await fetch(endpoint, { 
            method: 'HEAD',
            cache: 'no-store'
          });
        } catch (headError) {
          // HEAD failed, try GET with minimal query
          response = await fetch(`${endpoint}?limit=1`, { 
            method: 'GET',
            cache: 'no-store'
          });
        }
        
        results[endpoint] = {
          status: response.ok ? 'ok' : 'error',
          responseTime: Date.now() - startTime,
          httpStatus: response.status,
          ...(response.ok ? {} : { error: `HTTP ${response.status}` })
        };
      } catch (error: any) {
        results[endpoint] = {
          status: 'error',
          responseTime: Date.now() - startTime,
          error: error.message
        };
      }
    }

    return { endpoints: results };
  }
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
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [apiHealth, setApiHealth] = useState<any>(null);
  const { toast } = useToast();

  const claimsDebugger = new ClaimsDebugger();

  const fetchClaims = async () => {
    if (!publicKey) return;

    try {
      setLoading(true);
      setError(null);
      
      console.log('🔍 Fetching claims for:', publicKey.toString());
      
      const result = await claimsDebugger.fetchClaimsWithDebug(publicKey.toString());
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
        description: "Please connect your wallet to claim.",
        variant: "destructive"
      });
      return;
    }

    try {
      setClaiming(claim.id.toString());
      
      console.log('🔧 Processing claim for:', claim.tokenName);
      
      const programId = new PublicKey("5Z3xKkGh9YKhwjXXiPGhAHZFb6VhjjZe8bPs2yaBU7dj"); // Replace with actual
      const takeoverPubkey = new PublicKey(claim.takeoverAddress);
      const tokenMint = new PublicKey(claim.tokenMint);
      const vaultPubkey = new PublicKey(claim.vault);
      
      // Get user's associated token account for the claim token
      const userTokenAccount = getAssociatedTokenAddressLegacy(tokenMint, publicKey);
      
      // Create contributor account PDA
      const [contributorPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("contributor"),
          takeoverPubkey.toBuffer(),
          publicKey.toBuffer()
        ],
        programId
      );

      const transaction = new Transaction();

      // Check if ATA exists, create if not
      try {
        await connection.getAccountInfo(userTokenAccount);
      } catch (error) {
        const createATAInstruction = createAssociatedTokenAccountInstructionLegacy(
          publicKey,
          userTokenAccount,
          publicKey,
          tokenMint
        );
        transaction.add(createATAInstruction);
      }

      // Create claim instruction (simplified - replace with actual instruction)
      const amountBuffer = Buffer.alloc(8);
      amountBuffer.writeBigUInt64LE(BigInt(claim.claimableAmount), 0);

      const claimInstruction = new TransactionInstruction({
        keys: [
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
      
      // Get fresh blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
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
          description: `Your tokens were claimed successfully on the blockchain (${signature.slice(0, 8)}...) but there was an issue updating our database.`,
          duration: 10000
        });
      }

      toast({
        title: "Success! 🎉",
        description: `Claimed ${(Number(claim.claimableAmount) / 1_000_000).toLocaleString()} tokens successfully`,
      });

      // Refresh claims list
      fetchClaims();

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
      setClaiming(null);
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
              <Button onClick={fetchClaims}>Retry</Button>
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
          <Button variant="outline" size="sm" onClick={fetchClaims}>
            Refresh
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
            <Link href="/">
              <Button>Explore Takeovers</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-2xl font-bold text-green-600">{claimableCount}</div>
                <div className="text-sm text-gray-600">Ready to Claim</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-2xl font-bold text-blue-600">{claimedCount}</div>
                <div className="text-sm text-gray-600">Already Claimed</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {(totalClaimableValue / 1_000_000).toFixed(2)}M
                </div>
                <div className="text-sm text-gray-600">Total Claimable</div>
              </CardContent>
            </Card>
          </div>

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
                            ? `${claim.tokenName} V2` 
                            : claim.tokenName
                          }
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-500">Multiplier</div>
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
                            <div className="flex items-center">
                              <LoadingSpinner />
                              <span className="ml-2">Claiming...</span>
                            </div>
                          ) : (
                            `Claim ${claimableTokens.toFixed(2)}M Tokens`
                          )}
                        </Button>
                      )}
                    </div>

                    {claim.isClaimed && claim.transactionSignature && (
                      <div className="mt-2 text-xs text-gray-500">
                        Claimed in transaction: {claim.transactionSignature.slice(0, 8)}...
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      {/* Debug Panel */}
      {showDebug && (debugInfo || apiHealth) && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-blue-800 flex items-center justify-between">
              🔧 System Debug Information
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowDebug(false)}
                className="text-blue-600 hover:text-blue-800"
              >
                ×
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {debugInfo && (
              <div>
                <h4 className="font-medium text-blue-800 mb-2">Last API Call:</h4>
                <div className="text-sm grid grid-cols-2 gap-2">
                  <div>Status: {debugInfo.responseStatus}</div>
                  <div>Time: {debugInfo.responseTime}ms</div>
                  <div>Retries: {debugInfo.retryCount}</div>
                  <div>Claims Found: {claims.length}</div>
                </div>
              </div>
            )}

            {apiHealth && (
              <div>
                <h4 className="font-medium text-blue-800 mb-2">API Health:</h4>
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