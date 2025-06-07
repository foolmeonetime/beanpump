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

export function useRealtimeTakeovers() {
  const [takeovers, setTakeovers] = useState<Takeover[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastFinalizationCheck, setLastFinalizationCheck] = useState<number>(0);
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
      
    } catch (error: any) {
      console.error('Error fetching takeovers:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [takeovers, toast]);

  const triggerFinalizationCheck = useCallback(async () => {
    try {
      const now = Date.now();
      // Prevent spam clicks - only allow one check per 30 seconds
      if (now - lastFinalizationCheck < 30000) {
        return;
      }
      
      setLastFinalizationCheck(now);
      
      console.log("🤖 Triggering manual finalization check...");
      
      const response = await fetch('/api/auto-finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        const result = await response.json();
        
        if (result.finalized?.length > 0) {
          toast({
            title: "🚀 Auto-Finalization Complete",
            description: `${result.finalized.length} takeover(s) have been finalized and are ready for claiming!`,
            duration: 6000
          });
          
          // Refresh the takeovers list
          setTimeout(fetchTakeovers, 1000);
        } else {
          toast({
            title: "✅ All Up to Date",
            description: "No takeovers needed finalization at this time.",
            duration: 3000
          });
        }
      }
      
    } catch (error: any) {
      console.error('Finalization check error:', error);
      toast({
        title: "❌ Finalization Check Failed",
        description: "Unable to check for finalization. Please try again.",
        variant: "destructive"
      });
    }
  }, [lastFinalizationCheck, fetchTakeovers, toast]);

  const checkIfShouldAutoFinalize = useCallback(() => {
    const now = Math.floor(Date.now() / 1000);
    
    const readyForFinalization = takeovers.filter(t => {
      if (t.isFinalized) return false;
      
      const endTime = parseInt(t.endTime);
      const totalContributed = BigInt(t.totalContributed);
      const minAmount = BigInt(t.minAmount);
      
      // Goal reached or time expired
      return totalContributed >= minAmount || now >= endTime;
    });
    
    if (readyForFinalization.length > 0) {
      console.log(`🎯 Found ${readyForFinalization.length} takeovers ready for auto-finalization`);
      
      // Auto-trigger finalization check
      setTimeout(() => {
        triggerFinalizationCheck();
      }, 2000);
    }
  }, [takeovers, triggerFinalizationCheck]);

  // Initial fetch
  useEffect(() => {
    fetchTakeovers();
  }, []);

  // Real-time polling every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTakeovers();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchTakeovers]);

  // Check for auto-finalization whenever takeovers update
  useEffect(() => {
    if (takeovers.length > 0) {
      checkIfShouldAutoFinalize();
    }
  }, [takeovers, checkIfShouldAutoFinalize]);

  return {
    takeovers,
    loading,
    error,
    refetch: fetchTakeovers,
    triggerFinalizationCheck,
    lastFinalizationCheck
  };
}