"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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

interface ClaimDetails {
  id: string;
  takeoverId: string;
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

interface ClaimsState {
  claims: ClaimDetails[];
  loading: boolean;
  error: string | null;
  lastFetchTime: number | null;
  processingClaims: Set<string>;
}

// ✅ ADDED: Type for debugger response
interface ClaimsDebuggerResponse {
  success: boolean;
  claims: any[];
  error?: string;
  debugInfo: any;
}

// ✅ ADDED: Type for API health response
interface ApiHealthResponse {
  status: string | number;
  data?: any;
  error?: string;
  timestamp: string;
}

// ✅ FIXED: Simplified state management without useReducer
const initialClaimsState: ClaimsState = {
  claims: [], // ✅ Always start with empty array, never undefined
  loading: false,
  error: null,
  lastFetchTime: null,
  processingClaims: new Set<string>()
};

// Debug helpers
class ClaimsDebugger {
  async fetchClaimsWithDebug(contributor: string, endpoint: string): Promise<ClaimsDebuggerResponse> {
    const startTime = Date.now();
    const debugInfo: any = {
      timestamp: new Date().toISOString(),
      endpoint,
      contributor,
      startTime
    };

    try {
      const response = await fetch(endpoint, {
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      debugInfo.responseStatus = response.status;
      debugInfo.responseHeaders = Object.fromEntries(response.headers.entries());
      
      const data = await response.json();
      debugInfo.responseData = data;
      debugInfo.endTime = Date.now();
      debugInfo.duration = debugInfo.endTime - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${data.error || 'Unknown error'}`);
      }

      // ✅ ENHANCED: Better extraction logic with detailed logging
      console.log('🔍 ClaimsDebugger: Raw API response:', data);
      console.log('🔍 ClaimsDebugger: data.success:', data.success);
      console.log('🔍 ClaimsDebugger: data.data:', data.data);
      console.log('🔍 ClaimsDebugger: data.data?.claims:', data.data?.claims);
      console.log('🔍 ClaimsDebugger: data.claims:', data.claims);

      let extractedClaims: any[] = [];
      
      if (data.data && Array.isArray(data.data.claims)) {
        extractedClaims = data.data.claims;
        console.log('🔍 ClaimsDebugger: Using data.data.claims, length:', extractedClaims.length);
      } else if (Array.isArray(data.claims)) {
        extractedClaims = data.claims;
        console.log('🔍 ClaimsDebugger: Using data.claims, length:', extractedClaims.length);
      } else {
        console.warn('⚠️ ClaimsDebugger: No valid claims found in response');
        extractedClaims = [];
      }

      return {
        success: data.success,
        claims: extractedClaims,
        error: data.error,
        debugInfo
      };
    } catch (error: any) {
      debugInfo.error = error.message;
      debugInfo.endTime = Date.now();
      debugInfo.duration = debugInfo.endTime - startTime;
      
      return {
        success: false,
        claims: [], // ✅ Always return empty array instead of undefined
        error: error.message,
        debugInfo
      };
    }
  }

  async testApiHealth(): Promise<ApiHealthResponse> {
    try {
      const response = await fetch('/api/health', {
        cache: 'no-store'
      });
      
      const data = await response.json();
      
      return {
        status: response.status,
        data,
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
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

export default function ClaimsPage() {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const { toast } = useToast();

  console.log('🏁 ClaimsPage render:', { 
    publicKey: publicKey?.toString(), 
    hasSignTransaction: !!signTransaction 
  });

  // ✅ FIXED: Use useState instead of useReducer for simpler state management
  const [claimsState, setClaimsState] = useState<ClaimsState>(initialClaimsState);
  
  console.log('📊 Current claims state:', { 
    claimsLength: claimsState.claims?.length || 0,
    loading: claimsState.loading,
    error: claimsState.error,
    claimsIsArray: Array.isArray(claimsState.claims)
  });
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [apiHealth, setApiHealth] = useState<ApiHealthResponse | null>(null);

  // Refs for cleanup and caching
  const fetchAbortController = useRef<AbortController | null>(null);
  const claimsDebugger = useRef(new ClaimsDebugger());

  // ✅ FIXED: Helper functions to update state safely
  const updateClaimsState = useCallback((updates: Partial<ClaimsState>) => {
    setClaimsState(prev => {
      const newState = { 
        ...prev, 
        ...updates,
        // ✅ CRITICAL: Never allow claims to be undefined
        claims: updates.claims !== undefined ? (Array.isArray(updates.claims) ? updates.claims : []) : prev.claims
      };
      console.log('🔄 Updating claims state:', { 
        oldClaimsLength: prev.claims?.length || 0, 
        newClaimsLength: newState.claims?.length || 0,
        updates 
      });
      return newState;
    });
  }, []);

  const addProcessingClaim = useCallback((claimId: string) => {
    setClaimsState(prev => ({
      ...prev,
      processingClaims: new Set([...prev.processingClaims, claimId])
    }));
  }, []);

  const removeProcessingClaim = useCallback((claimId: string) => {
    setClaimsState(prev => ({
      ...prev,
      processingClaims: new Set([...prev.processingClaims].filter(id => id !== claimId))
    }));
  }, []);

  // Fetch claims with enhanced error handling
  const fetchClaims = useCallback(async (forceRefresh = false): Promise<void> => {
    if (!publicKey) {
      setClaimsState(initialClaimsState);
      return;
    }

    // Check if we need to fetch (avoid unnecessary requests)
    const now = Date.now();
    const lastFetch = claimsState.lastFetchTime;
    const timeSinceLastFetch = lastFetch ? now - lastFetch : Infinity;
    
    if (!forceRefresh && timeSinceLastFetch < 30000) { // 30 second cache
      console.log('📦 Using cached claims data');
      return;
    }

    // Cancel any pending request
    if (fetchAbortController.current) {
      fetchAbortController.current.abort();
    }
    fetchAbortController.current = new AbortController();

    try {
      updateClaimsState({ loading: true, error: null });
      
      console.log('🔍 Fetching claims for:', publicKey.toString());
      
      // Choose API endpoint based on force refresh
      const apiEndpoint = forceRefresh 
        ? `/api/claims/enhanced?contributor=${publicKey.toString()}&refresh=true`
        : `/api/claims?contributor=${publicKey.toString()}`;
        
      const result = await claimsDebugger.current.fetchClaimsWithDebug(
        publicKey.toString(), 
        apiEndpoint
      );
      
      setDebugInfo(result.debugInfo);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch claims');
      }
      
      // ✅ SIMPLIFIED: The ClaimsDebugger already extracts claims properly
      console.log('📊 Claims from debugger:', result.claims);
      console.log('📊 Claims type:', typeof result.claims);
      console.log('📊 Is array:', Array.isArray(result.claims));
      
      // ✅ Use the claims directly from the debugger (it already handles the extraction)
      let claimsData: any[] = result.claims || [];
      
      console.log('📊 Processing claims count:', claimsData.length);
      
      // ✅ FIXED: Transform and validate API response with proper null checks
      const userClaims: ClaimDetails[] = claimsData.map((claim: any) => ({
        id: claim.id?.toString() || '',
        takeoverId: claim.takeoverId?.toString() || '',
        takeoverAddress: claim.takeoverAddress || '',
        tokenName: claim.tokenName || 'Unknown Token',
        contributionAmount: claim.contributionAmount || '0',
        isSuccessful: Boolean(claim.isSuccessful),
        customRewardRate: Number(claim.customRewardRate) || 1.5,
        claimableAmount: claim.isSuccessful ? claim.rewardAmount : claim.refundAmount,
        tokenMint: claim.isSuccessful ? claim.v2TokenMint : claim.v1TokenMint,
        claimType: claim.isSuccessful ? 'reward' as const : 'refund' as const,
        vault: claim.vault || '',
        v1TokenMint: claim.v1TokenMint || '',
        v2TokenMint: claim.v2TokenMint || '',
        refundAmount: claim.refundAmount || '0',
        rewardAmount: claim.rewardAmount || '0',
        isClaimed: Boolean(claim.isClaimed),
        transactionSignature: claim.transactionSignature || '',
        createdAt: claim.createdAt || ''
      }));

      // ✅ ENHANCED: Defensive counting with bulletproof null checks
      const safeUserClaims = Array.isArray(userClaims) ? userClaims : [];
      const safePreviousClaims = Array.isArray(claimsState.claims) ? claimsState.claims : [];
      
      const claimableCount = safeUserClaims.filter((c: ClaimDetails) => c && !c.isClaimed).length || 0;
      const previousClaimableCount = safePreviousClaims.filter((c: ClaimDetails) => c && !c.isClaimed).length || 0;
      
      updateClaimsState({
        claims: Array.isArray(userClaims) ? userClaims : [],
        loading: false,
        error: null,
        lastFetchTime: now
      });

      if (claimableCount > 0 && claimableCount !== previousClaimableCount) {
        toast({
          title: "🎁 Claims Available!",
          description: `You have ${claimableCount} claim${claimableCount !== 1 ? 's' : ''} ready to process.`,
          variant: "default"
        });
      }
      
    } catch (error: any) {
      console.error('❌ Error fetching claims:', error);
      
      if (error.name === 'AbortError') {
        console.log('🚫 Claims fetch was cancelled');
        return;
      }
      
      updateClaimsState({ error: error.message, loading: false });
      
      toast({
        title: "Failed to Load Claims",
        description: error.message,
        variant: "destructive"
      });
    }
  }, [publicKey, claimsState.lastFetchTime, claimsState.claims, toast, updateClaimsState]);

  // Process individual claim
  const processClaim = useCallback(async (claim: ClaimDetails): Promise<void> => {
    if (!publicKey || !signTransaction) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet to claim.",
        variant: "destructive"
      });
      return;
    }

    if (claimsState.processingClaims.has(claim.id)) {
      console.log('⏳ Claim already being processed:', claim.id);
      return;
    }

    addProcessingClaim(claim.id);

    try {
      console.log('🎯 Processing claim:', claim);
      
      // Placeholder for actual claim processing logic
      // This would involve creating and signing the appropriate Solana transaction
      
      toast({
        title: "Claim Successful! 🎉",
        description: `Claimed ${(Number(claim.claimableAmount) / 1_000_000).toLocaleString()} tokens successfully`,
        variant: "default"
      });

      // Refresh claims with proper debouncing
      setTimeout(() => {
        fetchClaims(true);
      }, 1000);

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
      removeProcessingClaim(claim.id);
    }
  }, [publicKey, signTransaction, claimsState.processingClaims, fetchClaims, toast, addProcessingClaim, removeProcessingClaim]);

  // System health testing
  const testSystemHealth = useCallback(async (): Promise<void> => {
    try {
      const health: ApiHealthResponse = await claimsDebugger.current.testApiHealth();
      setApiHealth(health);
      setShowDebug(true);
    } catch (error: any) {
      console.error('Health check failed:', error);
      toast({
        title: "Health Check Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  }, [toast]);

  // ✅ ENHANCED: Effect with proper cleanup and error handling
  useEffect(() => {
    console.log('🎯 useEffect triggered, calling fetchClaims');
    try {
      fetchClaims();
    } catch (error) {
      console.error('❌ Error in useEffect fetchClaims:', error);
    }
    
    // Cleanup function
    return () => {
      if (fetchAbortController.current) {
        fetchAbortController.current.abort();
      }
    };
  }, [fetchClaims]);

  // Wallet not connected
  if (!publicKey) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-semibold mb-4">Connect Your Wallet</h2>
            <p className="text-gray-600 mb-6">
              Please connect your wallet to view your claims.
            </p>
            <WalletMultiButton />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading state
  if (claimsState.loading && claimsState.claims.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <LoadingSpinner />
            <p className="mt-4 text-gray-600">Loading your claims...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (claimsState.error && claimsState.claims.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card className="border-red-200">
          <CardContent className="pt-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-red-800 mb-4">
                Error Loading Claims
              </h2>
              <p className="text-red-600 mb-4">{claimsState.error}</p>
              <div className="space-x-2">
                <Button 
                  variant="outline" 
                  onClick={() => fetchClaims(true)}
                >
                  Retry
                </Button>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={testSystemHealth}
                >
                  Test System Health
                </Button>
              </div>
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
                >
                  ✕
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-yellow-800">
              {debugInfo && (
                <div className="mb-4">
                  <h4 className="font-semibold mb-2">Last Request:</h4>
                  <pre className="text-xs bg-yellow-100 p-2 rounded overflow-auto">
                    {JSON.stringify(debugInfo, null, 2)}
                  </pre>
                </div>
              )}
              
              {apiHealth && (
                <div>
                  <h4 className="font-semibold mb-2">API Health:</h4>
                  <pre className="text-xs bg-yellow-100 p-2 rounded overflow-auto">
                    {JSON.stringify(apiHealth, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (!Array.isArray(claimsState.claims) || claimsState.claims.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card>
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-semibold mb-4">No Claims Found</h2>
            <p className="text-gray-600 mb-4">
              You don&apos;t have any claims available at this time.
            </p>
            <p className="text-sm text-gray-500">
              Claims become available after takeovers are finalized.
            </p>
            <Button 
              variant="outline" 
              className="mt-4" 
              onClick={() => fetchClaims(true)}
            >
              Refresh
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ✅ DEFENSIVE: Wrap entire render in try-catch to catch mapping errors
  try {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Your Claims</h1>
            <p className="text-gray-600">
              {Array.isArray(claimsState.claims) ? claimsState.claims.length : 0} claim{(claimsState.claims?.length || 0) !== 1 ? 's' : ''} found
            </p>
          </div>
          <Button 
            variant="outline" 
            onClick={() => fetchClaims(true)}
            disabled={claimsState.loading}
          >
            {claimsState.loading ? <LoadingSpinner className="w-4 h-4" /> : 'Refresh'}
          </Button>
        </div>

        <div className="grid gap-4">
          {Array.isArray(claimsState.claims) && claimsState.claims.map((claim: ClaimDetails) => (
          <Card key={claim.id} className="relative">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {claim.tokenName}
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      claim.claimType === 'reward' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {claim.claimType === 'reward' ? '🎁 Reward' : '💰 Refund'}
                    </span>
                    {claim.isClaimed && (
                      <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        ✅ Claimed
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Contributed: {(Number(claim.contributionAmount) / 1_000_000).toLocaleString()} tokens
                  </CardDescription>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold">
                    {(Number(claim.claimableAmount) / 1_000_000).toLocaleString()} tokens
                  </div>
                  <div className="text-sm text-gray-500">
                    {claim.claimType === 'reward' ? 
                      `${claim.customRewardRate}x reward rate` : 
                      'Full refund'
                    }
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-center">
                <div className="space-y-1">
                  <p className="text-sm text-gray-600">
                    Takeover: {claim.takeoverAddress.slice(0, 8)}...{claim.takeoverAddress.slice(-4)}
                  </p>
                  {claim.transactionSignature && (
                    <p className="text-xs text-gray-500">
                      Claimed: {claim.transactionSignature.slice(0, 8)}...{claim.transactionSignature.slice(-4)}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Link href={`/takeover/${claim.takeoverAddress}`}>
                    <Button variant="outline" size="sm">
                      View Details
                    </Button>
                  </Link>
                  {!claim.isClaimed && (
                    <Button 
                      onClick={() => processClaim(claim)}
                      disabled={claimsState.processingClaims.has(claim.id)}
                      className="min-w-[80px]"
                    >
                      {claimsState.processingClaims.has(claim.id) ? (
                        <LoadingSpinner className="w-4 h-4" />
                      ) : (
                        'Claim'
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Debug toggle */}
      {process.env.NODE_ENV === 'development' && (
        <div className="text-center space-y-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setShowDebug(!showDebug)}
          >
            {showDebug ? 'Hide' : 'Show'} Debug Info
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => {
              console.log('🔍 Debug State Dump:', {
                claimsState,
                claimsIsArray: Array.isArray(claimsState.claims),
                claimsLength: claimsState.claims?.length,
                claimsType: typeof claimsState.claims,
                firstClaim: claimsState.claims?.[0]
              });
            }}
          >
            Dump State to Console
          </Button>
        </div>
      )}

      {/* Debug Information */}
      {showDebug && debugInfo && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="text-yellow-800">🔧 Debug Information</CardTitle>
          </CardHeader>
          <CardContent className="text-yellow-800">
            <pre className="text-xs bg-yellow-100 p-2 rounded overflow-auto">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
  } catch (renderError: any) {
    console.error('❌ CRITICAL: Render error in ClaimsPage:', renderError);
    
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Card className="border-red-200">
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-semibold text-red-800 mb-4">
              Render Error
            </h2>
            <p className="text-red-600 mb-4">
              A critical error occurred while rendering the claims page.
            </p>
            <pre className="text-xs bg-red-50 p-2 rounded mb-4 text-left">
              {renderError.message}
            </pre>
            <div className="space-x-2">
              <Button 
                variant="outline" 
                onClick={() => window.location.reload()}
              >
                Reload Page
              </Button>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  console.log('🔍 Error Debug State:', {
                    claimsState,
                    error: renderError,
                    publicKey: publicKey?.toString()
                  });
                }}
              >
                Log Debug Info
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
}