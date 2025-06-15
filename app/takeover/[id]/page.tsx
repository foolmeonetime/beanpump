// app/takeover/[id]/page.tsx
"use client";

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

interface Takeover {
  id: number;
  address: string;
  authority: string;
  v1_token_mint: string;
  vault: string;
  minAmount: string;
  startTime: string;
  endTime: string;
  totalContributed: string;
  contributorCount: number;
  isFinalized: boolean;
  isSuccessful: boolean;
  customRewardRate: number;
  tokenName: string;
  imageUrl?: string;
  status: string;
  rewardRateBp?: number;
  calculatedMinAmount?: string;
  maxSafeTotalContribution?: string;
  targetParticipationBp?: number;
  v1MarketPriceLamports?: string;
  isBillionScale?: boolean;
}

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
          className={`p-4 rounded-lg shadow-lg max-w-sm ${
            toast.variant === 'destructive' 
              ? 'bg-red-100 border-red-400 text-red-700' 
              : 'bg-blue-100 border-blue-400 text-blue-700'
          }`}
        >
          <div className="font-semibold">{toast.title}</div>
          <div className="text-sm">{toast.description}</div>
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
  
  console.log("=== UNIFIED TAKEOVER PAGE DEBUG ===");
  console.log("Takeover address from URL:", takeoverAddress);
  console.log("======================================");
  
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { toast, ToastContainer } = useToast();
  
  const [takeover, setTakeover] = useState<Takeover | null>(null);
  const [loading, setLoading] = useState(true);
  const [contributing, setContributing] = useState(false);
  const [contributionAmount, setContributionAmount] = useState("");
  const [userTokenBalance, setUserTokenBalance] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // Detect if this is a billion-scale takeover
  const isBillionScale = takeover?.rewardRateBp !== undefined || takeover?.isBillionScale === true;

  // Helper functions for finalization logic
  const now = Math.floor(Date.now() / 1000);
  const endTime = takeover ? parseInt(takeover.endTime) : 0;
  const isActive = takeover?.status === 'active' && now < endTime;
  const minAmount = takeover?.calculatedMinAmount || takeover?.minAmount || "0";
  const isGoalMet = takeover ? BigInt(takeover.totalContributed) >= BigInt(minAmount) : false;
  const isExpired = now >= endTime;
  const isReadyToFinalize = takeover && !takeover.isFinalized && (isGoalMet || isExpired);
  const isAuthority = takeover && publicKey && takeover.authority === publicKey.toString();
  const canContribute = isActive && !takeover?.isFinalized && publicKey;

  // Fetch takeover details with improved error handling
  const fetchTakeoverDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log("Fetching takeover details for address:", takeoverAddress);
      
      // Try multiple API strategies
      let takeover: Takeover | null = null;
      
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
          
          const takeovers = data.data?.takeovers || data.takeovers || [];
          const foundTakeover = takeovers.find((t: any) => t.address === takeoverAddress);
          
          if (foundTakeover) {
            takeover = foundTakeover;
            console.log("✅ Found takeover via filtered API");
          }
        } else {
          console.log("❌ Filtered API failed:", response.status);
        }
      } catch (filterError) {
        console.log("❌ Filtered API error:", filterError);
      }
      
      // Strategy 2: Try simple endpoint as fallback
      if (!takeover) {
        try {
          console.log("🔄 Trying simple API endpoint...");
          const response = await fetch('/api/simple-takeovers', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            cache: 'no-store'
          });
          
          if (response.ok) {
            const data = await response.json();
            console.log("✅ Simple API response:", data);
            
            const takeovers = data.takeovers || [];
            const foundTakeover = takeovers.find((t: any) => t.address === takeoverAddress);
            
            if (foundTakeover) {
              takeover = foundTakeover;
              console.log("✅ Found takeover via simple API");
            }
          } else {
            console.log("❌ Simple API failed:", response.status);
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
      console.log("✅ Successfully loaded takeover:", takeover);
      
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
    
    try {
      setContributing(true);
      
      const amount = BigInt(parseFloat(contributionAmount) * 1_000_000); // Convert to lamports
      
      // Create contribution transaction
      const programId = new PublicKey("YourProgramIdHere"); // Replace with actual program ID
      const takeoverPubkey = new PublicKey(takeover.address);
      const contributorAta = new PublicKey("YourContributorAtaHere"); // Replace with actual ATA
      const vault = new PublicKey(takeover.vault);
      const contributorAccount = new PublicKey("YourContributorAccountHere"); // Replace with actual account
      
      const instruction = createContributeInstruction(
        programId,
        takeoverPubkey,
        publicKey,
        contributorAta,
        vault,
        contributorAccount,
        amount
      );
      
      // Send transaction logic here
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

  // Format amounts for display
  const formatAmount = (amount: string): string => {
    const num = parseFloat(amount) / 1_000_000;
    if (num >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(1)}M`;
    } else if (num >= 1_000) {
      return `${(num / 1_000).toFixed(1)}K`;
    } else {
      return num.toFixed(2);
    }
  };

  // Calculate progress percentage
  const getProgressPercentage = (): number => {
    if (!takeover) return 0;
    const contributed = parseFloat(takeover.totalContributed);
    const target = parseFloat(minAmount);
    if (target === 0) return 0;
    return Math.min((contributed / target) * 100, 100);
  };

  // Get status badge color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'successful': return 'bg-blue-100 text-blue-800';
      case 'failed': return 'bg-red-100 text-red-800';
      case 'finalized': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  useEffect(() => {
    fetchTakeoverDetails();
  }, [takeoverAddress]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-lg">Loading takeover details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="text-center">
            <p className="text-red-600 text-lg font-semibold">Error Loading Takeover</p>
            <p className="text-gray-600 mt-2">{error}</p>
            <button 
              onClick={fetchTakeoverDetails}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
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
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <div className="text-center">
            <p className="text-lg">Takeover not found</p>
            <p className="text-gray-600 mt-2">Address: {takeoverAddress}</p>
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
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold">{takeover.tokenName}</h1>
              <p className="text-sm text-gray-600 mt-1 font-mono break-all">
                Address: {takeover.address}
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(takeover.status)}`}>
              {takeover.status.toUpperCase()}
            </span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div>
              <p className="text-sm text-gray-600">Total Contributed</p>
              <p className="text-lg font-semibold">
                {formatAmount(takeover.totalContributed)} tokens
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Target Amount</p>
              <p className="text-lg font-semibold">
                {formatAmount(minAmount)} tokens
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Contributors</p>
              <p className="text-lg font-semibold">{takeover.contributorCount}</p>
            </div>
          </div>
          
          <div className="mt-4">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Progress</span>
              <span>{getProgressPercentage().toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full" 
                style={{ width: `${getProgressPercentage()}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Contribution Section */}
        {canContribute && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold mb-4">Contribute to Takeover</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Contribution Amount (tokens)
                </label>
                <input
                  type="number"
                  placeholder="Enter amount"
                  value={contributionAmount}
                  onChange={(e) => setContributionAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button 
                onClick={handleContribute}
                disabled={contributing || !contributionAmount}
                className="w-full px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {contributing ? "Contributing..." : "Contribute"}
              </button>
            </div>
          </div>
        )}

        {/* Details */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Takeover Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600">Authority</p>
              <p className="font-mono text-sm break-all">{takeover.authority}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Token Mint</p>
              <p className="font-mono text-sm break-all">{takeover.v1_token_mint}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Vault</p>
              <p className="font-mono text-sm break-all">{takeover.vault}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Reward Rate</p>
              <p className="text-sm">
                {isBillionScale && takeover.rewardRateBp 
                  ? `${takeover.rewardRateBp} BP`
                  : `${takeover.customRewardRate}x`
                }
              </p>
            </div>
            {isBillionScale && (
              <>
                <div>
                  <p className="text-sm text-gray-600">Max Safe Contribution</p>
                  <p className="text-sm">{formatAmount(takeover.maxSafeTotalContribution || "0")}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Billion Scale</p>
                  <p className="text-sm">Yes</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Admin Actions */}
        {isAuthority && isReadyToFinalize && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h2 className="text-xl font-bold mb-4">Admin Actions</h2>
            <p className="text-sm text-gray-600 mb-4">
              This takeover is ready for finalization.
            </p>
            <button className="w-full px-4 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600">
              Finalize Takeover
            </button>
          </div>
        )}
      </div>
    </div>
  );
}