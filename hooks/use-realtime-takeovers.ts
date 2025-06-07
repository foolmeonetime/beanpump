// Fixed use-realtime-takeovers.ts
"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
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
  
  // Use ref to avoid dependency cycles
  const takeoverRef = useRef<Takeover[]>([]);
  const autoFinalizingRef = useRef(false);

  // Update refs when state changes
  useEffect(() => {
    takeoverRef.current = takeovers;
  }, [takeovers]);

  useEffect(() => {
    autoFinalizingRef.current = autoFinalizing;
  }, [autoFinalizing]);

  const fetchTakeovers = useCallback(async (skipAutoFinalize = false) => {
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
      
      // Check for newly finalized takeovers using ref to avoid dependency
      const currentTakeovers = takeoverRef.current;
      if (currentTakeovers.length > 0) {
        const newlyFinalized = newTakeovers.filter((newT: Takeover) => {
          const oldT = currentTakeovers.find(old => old.id === newT.id);
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
      
      // Auto-check for finalization only if not skipped and not already auto-finalizing
      if (!skipAutoFinalize && !autoFinalizingRef.current) {
        await checkAndAutoFinalize(newTakeovers);
      }
      
    } catch (error: any) {
      console.error('Error fetching takeovers:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }, [toast]); // Remove takeovers from dependencies

  const checkAndAutoFinalize = useCallback(async (takeoverList: Takeover[]) => {
    if (autoFinalizingRef.current) {
      console.log('⏸️ Auto-finalization already in progress, skipping...');
      return;
    }
    
    const now = Math.floor(Date.now() / 1000);
    
    const readyForFinalization = takeoverList.filter(t => {
      if (t.isFinalized) return false;
      
      const endTime = parseInt(t.endTime);
      const totalContributed = BigInt(t.totalContributed);
      const minAmount = BigInt(t.minAmount);
      
      // Goal reached or time expired
      return totalContributed >= minAmount || now >= endTime;
    });
    
    if (readyForFinalization.length === 0) {
      console.log('✅ No takeovers ready for finalization');
      return;
    }
    
    console.log(`🎯 Found ${readyForFinalization.length} takeovers ready for auto-finalization`);
    
    try {
      setAutoFinalizing(true);
      
      // Call the auto-finalize API
      const response = await fetch('/api/auto-finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error(`Auto-finalize API failed: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (result.success && result.finalized?.length > 0) {
        toast({
          title: "🚀 Auto-Finalization Complete!",
          description: `${result.finalized.length} takeover(s) finalized and ready for claiming!`,
          duration: 6000
        });
        
        // Refresh the takeovers list after successful finalization
        setTimeout(() => {
          fetchTakeovers(true); // Skip auto-finalize on refresh to prevent loops
        }, 2000);
      } else if (result.errors?.length > 0) {
        console.error('Auto-finalization errors:', result.errors);
        toast({
          title: "⚠️ Auto-Finalization Issues",
          description: `${result.errors.length} takeover(s) failed to finalize. Check console for details.`,
          duration: 6000
        });
      }
      
    } catch (error: any) {
      console.error('Auto-finalization error:', error);
      toast({
        title: "❌ Auto-Finalization Failed",
        description: `Error: ${error.message}`,
        duration: 6000
      });
    } finally {
      setAutoFinalizing(false);
    }
  }, [toast, fetchTakeovers]);

  const manualFinalize = useCallback(async () => {
    await checkAndAutoFinalize(takeoverRef.current);
  }, [checkAndAutoFinalize]);

  // Initial fetch
  useEffect(() => {
    fetchTakeovers();
  }, [fetchTakeovers]);

  // Auto-check every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchTakeovers();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchTakeovers]);

  // Count ready for finalization using current takeovers
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
    refetch: () => fetchTakeovers(),
    manualFinalize
  };
}