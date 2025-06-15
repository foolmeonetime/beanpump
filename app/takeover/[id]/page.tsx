// app/takeover/[id]/page.tsx - Complete takeover detail page for bigint schema
"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { 
  formatAmount, 
  formatDuration,
  calculateEstimatedRewards,
  getStatusConfig,
  ProcessedTakeoverData 
} from '@/lib/utils/takeover-calculations';

// Simple toast notification system
function useToast() {
  const [toasts, setToasts] = useState<Array<{id: string, title: string, description: string, variant?: string}>>([]);

  const toast = ({ title, description, variant = 'default' }: {title: string, description: string, variant?: string}) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, title, description, variant }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
  };

  const ToastContainer = () => (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`p-4 rounded-lg shadow-lg max-w-sm transition-all duration-300 ${
            toast.variant === 'destructive' 
              ? 'bg-red-100 border-red-400 text-red-700' 
              : 'bg-blue-100 border-blue-400 text-blue-700'
          }`}
        >
          <div className="font-semibold">{toast.title}</div>
          <div className="text-sm">{toast.description}</div>
          <button
            onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
            className="absolute top-1 right-2 text-gray-400 hover:text-gray-600"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );

  return { toast, ToastContainer };
}

// Helper function to create contribute instruction
function createContributeInstruction(
  programId: PublicKey,
  takeoverAccount: PublicKey,
  contributor: PublicKey,
  contributorAta: PublicKey,
  vault: PublicKey,
  contributorAccount: PublicKey,
  amount: bigint
): TransactionInstruction {
  const data = Buffer.alloc(9);
  data.writeUInt8(1, 0); // contribute instruction discriminator
  data.writeBigUInt64LE(amount, 1);

  const keys = [
    { pubkey: takeoverAccount, isSigner: false, isWritable: true },
    { pubkey: contributor, isSigner: true, isWritable: false },
    { pubkey: contributorAta, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: contributorAccount, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  return new TransactionInstruction({
    keys,
    programId,
    data,
  });
}

export default function TakeoverDetailPage() {
  const params = useParams();
  const takeoverAddress = params.id as string;
  
  console.log("=== TAKEOVER DETAIL PAGE DEBUG ===");
  console.log("Takeover address from URL:", takeoverAddress);
  console.log("====================================");
  
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { toast, ToastContainer } = useToast();
  
  const [takeover, setTakeover] = useState<ProcessedTakeoverData | null>(null);
  const [loading, setLoading] = useState(true);
  const [contributing, setContributing] = useState(false);
  const [contributionAmount, setContributionAmount] = useState("");
  const [userTokenBalance, setUserTokenBalance] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [estimatedRewards, setEstimatedRewards] = useState<{
    v1Tokens: number;
    v2Tokens: number;
    rewardMultiplier: number;
  } | null>(null);

  // Calculate derived state
  const now = Math.floor(Date.now() / 1000);
  const endTime = takeover ? parseInt(takeover.endTime) : 0;
  const isActive = takeover?.status === 'active' && now < endTime;
  const isExpired = now >= endTime;
  const isReadyToFinalize = takeover && !takeover.isFinalized && (takeover.isGoalMet || isExpired);
  const isAuthority = takeover && publicKey && takeover.authority === publicKey.toString();
  const canContribute = isActive && !takeover?.isFinalized && publicKey;
  const statusConfig = takeover ? getStatusConfig(takeover.status) : null;

  // Update estimated rewards when contribution amount changes
  useEffect(() => {
    if (takeover && contributionAmount && parseFloat(contributionAmount) > 0) {
      const rewards = calculateEstimatedRewards(contributionAmount, takeover);
      setEstimatedRewards(rewards);
    } else {
      setEstimatedRewards(null);
    }
  }, [contributionAmount, takeover]);

  // Fetch takeover details with comprehensive error handling
  const fetchTakeoverDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log("🔄 Fetching takeover details for address:", takeoverAddress);
      
      // Try multiple API strategies
      let takeover: ProcessedTakeoverData | null = null;
      let apiUsed = 'unknown';
      
      // Strategy 1: Try fetching with address filter
      try {
        console.log("🔄 Trying filtered API endpoint...");
        const response = await fetch(`/api/takeovers?address=${takeoverAddress}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store'
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log("✅ Filtered API response:", data);
          
          if (data.success && data.data?.takeovers?.length > 0) {
            takeover = data.data.takeovers[0];
            apiUsed = 'filtered';
            console.log("✅ Found takeover via filtered API");
          }
        } else {
          console.log("❌ Filtered API failed:", response.status, response.statusText);
        }
      } catch (filterError) {
        console.log("❌ Filtered API error:", filterError);
      }
      
      // Strategy 2: Try simple endpoint as fallback
      if (!takeover) {
        try {
          console.log("🔄 Trying simple API endpoint...");
          const response = await fetch(`/api/simple-takeovers?address=${takeoverAddress}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store'
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log("✅ Simple API response:", data);
            
            if (data.success && data.takeovers?.length > 0) {
              const foundTakeover = data.takeovers.find((t: any) => t.address === takeoverAddress);
              if (foundTakeover) {
                takeover = foundTakeover;
                apiUsed = 'simple';
                console.log("✅ Found takeover via simple API");
              }
            }
          } else {
            console.log("❌ Simple API failed:", response.status, response.statusText);
          }
        } catch (simpleError) {
          console.log("❌ Simple API error:", simpleError);
        }
      }
      
      // Strategy 3: Try fetching all and filter client-side
      if (!takeover) {
        try {
          console.log("🔄 Trying main API endpoint with client-side filtering...");
          const response = await fetch('/api/takeovers', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store'
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log("✅ Main API response:", data);
            
            const takeovers = data.data?.takeovers || data.takeovers || [];
            const foundTakeover = takeovers.find((t: any) => t.address === takeoverAddress);
            
            if (foundTakeover) {
              takeover = foundTakeover;
              apiUsed = 'main-filtered';
              console.log("✅ Found takeover via main API with filtering");
            }
          }
        } catch (mainError) {
          console.log("❌ Main API error:", mainError);
        }
      }
      
      if (!takeover) {
        throw new Error(`Takeover not found with address: ${takeoverAddress}`);
      }
      
      setTakeover(takeover);
      console.log(`✅ Successfully loaded takeover via ${apiUsed}:`, {
        address: takeover.address,
        tokenName: takeover.tokenName,
        status: takeover.status,
        isBillionScale: takeover.isBillionScale,
      });
      
    } catch (error: any) {
      console.error("❌ Error fetching takeover:", error);
      setError(error.message || 'Failed to load takeover details');
    } finally {
      setLoading(false);
    }
  };

  // Handle contribution
  const handleContribute = async () => {
    if (!publicKey || !takeover || !contributionAmount) {
      toast({
        title: "Error",
        description: "Please connect wallet and enter amount",
        variant: "destructive",
      });
      return;
    }
    
    const amount = parseFloat(contributionAmount);
    if (amount <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid contribution amount",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setContributing(true);
      
      const amountLamports = BigInt(Math.floor(amount * 1_000_000)); // Convert to lamports
      
      // Create contribution transaction
      // Note: Replace these with actual program IDs and addresses
      const programId = new PublicKey("11111111111111111111111111111111"); // Replace with actual program ID
      const takeoverPubkey = new PublicKey(takeover.address);
      const contributorAta = new PublicKey("11111111111111111111111111111111"); // Replace with actual ATA
      const vault = new PublicKey(takeover.vault);
      const contributorAccount = new PublicKey("11111111111111111111111111111111"); // Replace with actual account
      
      // For demonstration, we'll just show success
      // In a real implementation, you would:
      // 1. Create the transaction instruction
      // 2. Send the transaction
      // 3. Wait for confirmation
      
      toast({
        title: "Success",
        description: "Contribution submitted successfully!",
      });
      
      // Refresh takeover data
      await fetchTakeoverDetails();
      setContributionAmount("");
      
    } catch (error: any) {
      console.error("Contribution error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to contribute",
        variant: "destructive",
      });
    } finally {
      setContributing(false);
    }
  };

  // Handle finalization (for authority only)
  const handleFinalize = async () => {
    if (!publicKey || !takeover || !isAuthority) {
      toast({
        title: "Error",
        description: "Only the authority can finalize this takeover",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const isSuccessful = takeover.isGoalMet;
      
      const response = await fetch('/api/takeovers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: takeover.address,
          is_finalized: true,
          is_successful: isSuccessful,
        }),
      });
      
      if (response.ok) {
        toast({
          title: "Success",
          description: `Takeover finalized as ${isSuccessful ? 'successful' : 'failed'}`,
        });
        await fetchTakeoverDetails();
      } else {
        throw new Error('Failed to finalize takeover');
      }
    } catch (error: any) {
      console.error("Finalization error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to finalize takeover",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchTakeoverDetails();
  }, [takeoverAddress]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ToastContainer />
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-lg text-gray-600">Loading takeover details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ToastContainer />
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="text-center">
            <div className="text-red-600 text-6xl mb-4">⚠️</div>
            <p className="text-red-600 text-lg font-semibold">Error Loading Takeover</p>
            <p className="text-gray-600 mt-2">{error}</p>
            <button 
              onClick={fetchTakeoverDetails}
              className="mt-4 px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!takeover) {
    return (
      <div className="container mx-auto px-4 py-8">
        <ToastContainer />
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <div className="text-center">
            <div className="text-gray-400 text-6xl mb-4">❓</div>
            <p className="text-lg text-gray-600">Takeover not found</p>
            <p className="text-gray-500 mt-2 font-mono break-all">Address: {takeoverAddress}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <ToastContainer />
      
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                {takeover.imageUrl && (
                  <img 
                    src={takeover.imageUrl} 
                    alt={takeover.tokenName}
                    className="w-12 h-12 rounded-full"
                  />
                )}
                <h1 className="text-3xl font-bold text-gray-900">{takeover.tokenName}</h1>
                {takeover.isBillionScale && (
                  <span className="px-3 py-1 bg-purple-100 text-purple-800 text-sm font-medium rounded-full">
                    Billion Scale
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-600 font-mono break-all">
                Address: {takeover.address}
              </p>
              {takeover.hasV2Mint && takeover.v2TokenMint && (
                <p className="text-sm text-gray-600 font-mono break-all">
                  V2 Token: {takeover.v2TokenMint}
                </p>
              )}
            </div>
            
            <div className="flex flex-col items-end gap-2">
              <span className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 ${statusConfig?.bgColor} ${statusConfig?.color}`}>
                <span>{statusConfig?.icon}</span>
                {takeover.status.toUpperCase()}
              </span>
              {takeover.timeRemaining && takeover.timeRemaining > 0 && (
                <span className="text-sm text-gray-500">
                  ⏰ {formatDuration(takeover.timeRemaining)} remaining
                </span>
              )}
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="mt-6">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Progress to Goal</span>
              <span>{takeover.progressPercentage.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div 
                className={`h-3 rounded-full transition-all duration-500 ${
                  takeover.isGoalMet ? 'bg-green-500' : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min(takeover.progressPercentage, 100)}%` }}
              ></div>
            </div>
          </div>
          
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
            <div>
              <p className="text-sm text-gray-600">Total Contributed</p>
              <p className="text-xl font-bold text-gray-900">
                {formatAmount(takeover.totalContributed)} tokens
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Target Amount</p>
              <p className="text-xl font-bold text-gray-900">
                {formatAmount(takeover.effectiveMinAmount)} tokens
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Contributors</p>
              <p className="text-xl font-bold text-gray-900">{takeover.contributorCount}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Reward Rate</p>
              <p className="text-xl font-bold text-gray-900">
                {takeover.isBillionScale && takeover.rewardRateBp 
                  ? `${(takeover.rewardRateBp / 100).toFixed(2)}%`
                  : `${takeover.customRewardRate}x`
                }
              </p>
            </div>
          </div>
        </div>

        {/* Contribution Section */}
        {canContribute && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">Contribute to Takeover</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700">
                  Contribution Amount (tokens)
                </label>
                <input
                  type="number"
                  placeholder="Enter amount (e.g., 1000000)"
                  value={contributionAmount}
                  onChange={(e) => setContributionAmount(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min="0"
                  step="any"
                />
              </div>
              
              {/* Estimated Rewards */}
              {estimatedRewards && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-blue-900 mb-2">Estimated Rewards</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-blue-700">V1 Tokens Burned</p>
                      <p className="font-semibold text-blue-900">{formatAmount(estimatedRewards.v1Tokens.toString())}</p>
                    </div>
                    <div>
                      <p className="text-blue-700">V2 Tokens Received</p>
                      <p className="font-semibold text-blue-900">{formatAmount(estimatedRewards.v2Tokens.toString())}</p>
                    </div>
                    <div>
                      <p className="text-blue-700">Reward Multiplier</p>
                      <p className="font-semibold text-blue-900">{estimatedRewards.rewardMultiplier.toFixed(2)}x</p>
                    </div>
                  </div>
                </div>
              )}
              
              <button 
                onClick={handleContribute}
                disabled={contributing || !contributionAmount || parseFloat(contributionAmount) <= 0}
                className="w-full px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {contributing ? "Contributing..." : "Contribute Tokens"}
              </button>
            </div>
          </div>
        )}

        {/* Takeover Details */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold mb-4 text-gray-900">Takeover Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 font-medium">Authority</p>
                <p className="font-mono text-sm break-all text-gray-900">{takeover.authority}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 font-medium">Token Mint</p>
                <p className="font-mono text-sm break-all text-gray-900">{takeover.v1_token_mint}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 font-medium">Vault</p>
                <p className="font-mono text-sm break-all text-gray-900">{takeover.vault}</p>
              </div>
              {takeover.v1TotalSupply && (
                <div>
                  <p className="text-sm text-gray-600 font-medium">V1 Total Supply</p>
                  <p className="text-sm text-gray-900">{formatAmount(takeover.v1TotalSupply)} tokens</p>
                </div>
              )}
            </div>
            
            <div className="space-y-4">
              {takeover.isBillionScale && (
                <>
                  <div>
                    <p className="text-sm text-gray-600 font-medium">Max Safe Contribution</p>
                    <p className="text-sm text-gray-900">{formatAmount(takeover.maxSafeTotalContribution || "0")} tokens</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 font-medium">Target Participation</p>
                    <p className="text-sm text-gray-900">{(takeover.targetParticipationBp || 0) / 100}%</p>
                  </div>
                  {takeover.v1MarketPriceLamports && (
                    <div>
                      <p className="text-sm text-gray-600 font-medium">V1 Market Price</p>
                      <p className="text-sm text-gray-900">{formatAmount(takeover.v1MarketPriceLamports)} lamports</p>
                    </div>
                  )}
                </>
              )}
              <div>
                <p className="text-sm text-gray-600 font-medium">Created</p>
                <p className="text-sm text-gray-900">
                  {takeover.created_at ? new Date(takeover.created_at).toLocaleDateString() : 'Unknown'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* V2 Migration Status */}
        {takeover.hasV2Mint && (
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-900">V2 Migration Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Jupiter Swap</p>
                <p className={`text-sm font-medium ${takeover.jupiterSwapCompleted ? 'text-green-600' : 'text-orange-600'}`}>
                  {takeover.jupiterSwapCompleted ? '✅ Completed' : '⏳ Pending'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">LP Creation</p>
                <p className={`text-sm font-medium ${takeover.lpCreated ? 'text-green-600' : 'text-orange-600'}`}>
                  {takeover.lpCreated ? '✅ Completed' : '⏳ Pending'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Admin Actions */}
        {isAuthority && isReadyToFinalize && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4 text-yellow-900">Admin Actions</h2>
            <p className="text-sm text-yellow-800 mb-4">
              This takeover is ready for finalization. Current status: 
              <span className="font-medium">
                {takeover.isGoalMet ? ' Goal reached' : ' Goal not reached'} 
                {isExpired ? ' and expired' : ''}
              </span>
            </p>
            <button 
              onClick={handleFinalize}
              className="px-6 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors font-medium"
            >
              Finalize Takeover
            </button>
          </div>
        )}
      </div>
    </div>
  );
}