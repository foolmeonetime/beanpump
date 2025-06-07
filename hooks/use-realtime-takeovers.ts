"use client";

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';

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
  hasV2Mint: boolean;
  v2TokenMint?: string;
  customRewardRate: number;
  status: 'active' | 'ended' | 'successful' | 'failed' | 'goal_reached';
  progressPercentage: number;
  created_at: string;
  tokenName: string;
  imageUrl?: string;
}

export function useSimpleAutoFinalize() {
  const [takeovers, setTakeovers] = useState<Takeover[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoFinalizing, setAutoFinalizing] = useState(false);
  const { toast } = useToast();

  const fetchTakeovers = useCallback(async () => {
    try {
      setError(null);
      
      const response = await fetch('/api/takeovers', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch takeovers');
      }
      
      const data = await response.json();
      const newTakeovers = data.takeovers || [];
      
      // Check for newly finalized takeovers
      if (takeovers.length > 0) {
        const newlyFinalized = newTakeovers.filter((newT: Takeover) => {
          const oldT = takeovers.find(old => old.id === newT.id);
          return oldT && !oldT.isFinalized && newT.isFinalized;
        });
        
        // Show notifications for newly finalized takeovers
        newlyFinalized.forEach((t: Takeover) => {
          toast({
            title: t.isSuccessful ? "🎉 Takeover Successful!" : "⏰ Takeover Ended",
            description: `${t.tokenName} takeover has been finalized. ${t.isSuccessful ? 'Contributors can now claim V2 tokens!' : 'Contributors can claim refunds.'}`,
            duration: 8000
          });
        });
      }
      
      setTakeovers(newTakeovers);
      
      // Auto-check for finalization after fetching
      await checkAndAutoFinalize(newTakeovers);
      
    } catch (error: any) {
      console.error('Error fetching takeovers:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [takeovers, toast]);

  const checkAndAutoFinalize = useCallback(async (takeoverList: Takeover[]) => {
    if (autoFinalizing) return; // Prevent multiple simultaneous checks
    
    const now = Math.floor(Date.now() / 1000);
    
    const readyForFinalization = takeoverList.filter(t => {
      if (t.isFinalized) return false;
      
      const endTime = parseInt(t.endTime);
      const totalContributed = BigInt(t.totalContributed);
      const minAmount = BigInt(t.minAmount);
      
      // Goal reached or time expired
      return totalContributed >= minAmount || now >= endTime;
    });
    
    if (readyForFinalization.length === 0) return;
    
    console.log(`🎯 Found ${readyForFinalization.length} takeovers ready for auto-finalization`);
    
    try {
      setAutoFinalizing(true);
      
      // Call the auto-finalize API
      const response = await fetch('/api/auto-finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const result = await response.json();
        
        if (result.finalized?.length > 0) {
          toast({
            title: "🚀 Auto-Finalization Complete!",
            description: `${result.finalized.length} takeover(s) finalized and ready for claiming!`,
            duration: 6000
          });
          
          // Refresh the takeovers list
          setTimeout(() => {
            fetchTakeovers();
          }, 2000);
        }
      }
      
    } catch (error: any) {
      console.error('Auto-finalization error:', error);
    } finally {
      setAutoFinalizing(false);
    }
  }, [autoFinalizing, fetchTakeovers, toast]);

  const manualFinalize = useCallback(async () => {
    await checkAndAutoFinalize(takeovers);
  }, [takeovers, checkAndAutoFinalize]);

  // Initial fetch
  useEffect(() => {
    fetchTakeovers();
  }, []);

  // Auto-check every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTakeovers();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [fetchTakeovers]);

  // Count ready for finalization
  const now = Math.floor(Date.now() / 1000);
  const readyForFinalization = takeovers.filter(t => {
    if (t.isFinalized) return false;
    const endTime = parseInt(t.endTime);
    const totalContributed = BigInt(t.totalContributed);
    const minAmount = BigInt(t.minAmount);
    return totalContributed >= minAmount || now >= endTime;
  }).length;

  return {
    takeovers,
    loading,
    error,
    autoFinalizing,
    readyForFinalization,
    refetch: fetchTakeovers,
    manualFinalize
  };
}