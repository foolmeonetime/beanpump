import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { LoadingSpinner } from "@/components/loading-spinner";
import { lpSimulator, PoolAnalytics, SwapResult } from "@/lib/lp-simulator";

interface PoolAnalyticsProps {
  poolId?: string;
  tokenMint?: string;
  tokenSymbol?: string;
  initialSolAmount?: number;
  initialTokenAmount?: number;
}

export function PoolAnalyticsComponent({ 
  poolId, 
  tokenMint, 
  tokenSymbol, 
  initialSolAmount, 
  initialTokenAmount 
}: PoolAnalyticsProps) {
  const [analytics, setAnalytics] = useState<PoolAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [swapAmount, setSwapAmount] = useState("");
  const [swapDirection, setSwapDirection] = useState<'SOL' | 'TOKEN'>('SOL');
  const [swapResult, setSwapResult] = useState<SwapResult | null>(null);
  const [currentPoolId, setCurrentPoolId] = useState(poolId);
  const [poolExists, setPoolExists] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Check if pool exists or needs to be created
    if (currentPoolId) {
      // First check if the pool exists
      const pool = lpSimulator.getPool(currentPoolId);
      if (pool) {
        setPoolExists(true);
        fetchAnalytics();
      } else {
        // Pool doesn't exist, try to recreate if we have the data
        setPoolExists(false);
        if (tokenMint && tokenSymbol && initialSolAmount && initialTokenAmount) {
          console.log('Pool not found, recreating...');
          createPool();
        } else {
          // Clear the currentPoolId since the pool doesn't exist and we can't recreate it
          setCurrentPoolId(undefined);
          setAnalytics(null);
        }
      }
    } else if (tokenMint && tokenSymbol && initialSolAmount && initialTokenAmount) {
      // Auto-create pool if we have the necessary data but no poolId
      createPool();
    }
  }, [currentPoolId, tokenMint, tokenSymbol, initialSolAmount, initialTokenAmount]);

  useEffect(() => {
    // Refresh analytics every 10 seconds, but only if pool exists
    const interval = setInterval(() => {
      if (currentPoolId && poolExists) {
        fetchAnalytics();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [currentPoolId, poolExists]);

  const createPool = async () => {
    if (!tokenMint || !tokenSymbol || !initialSolAmount || !initialTokenAmount) return;

    try {
      setLoading(true);
      
      const pool = lpSimulator.createPool({
        tokenMint,
        tokenSymbol,
        initialSolAmount,
        initialTokenAmount,
        fee: 0.003 // 0.3% fee
      });

      setCurrentPoolId(pool.id);
      setPoolExists(true);
      
      toast({
        title: "Pool Created! 🏊",
        description: `${tokenSymbol}/SOL liquidity pool simulation started`,
        duration: 5000
      });

      await fetchAnalytics();
    } catch (error: any) {
      console.error('Error creating pool:', error);
      setPoolExists(false);
      toast({
        title: "Pool Creation Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    if (!currentPoolId) return;

    try {
      // First verify the pool exists
      const pool = lpSimulator.getPool(currentPoolId);
      if (!pool) {
        console.warn(`Pool ${currentPoolId} not found, marking as non-existent`);
        setPoolExists(false);
        setAnalytics(null);
        
        // Try to recreate if we have the data
        if (tokenMint && tokenSymbol && initialSolAmount && initialTokenAmount) {
          createPool();
        }
        return;
      }

      const poolAnalytics = lpSimulator.getPoolAnalytics(currentPoolId);
      setAnalytics(poolAnalytics);
      setPoolExists(true);
    } catch (error: any) {
      console.error('Error fetching analytics:', error);
      
      if (error.message === 'Pool not found') {
        setPoolExists(false);
        setAnalytics(null);
        
        // Try to recreate if we have the data
        if (tokenMint && tokenSymbol && initialSolAmount && initialTokenAmount) {
          console.log('Pool not found during analytics fetch, recreating...');
          createPool();
        } else {
          setCurrentPoolId(undefined);
        }
      } else {
        toast({
          title: "Analytics Error",
          description: error.message,
          variant: "destructive"
        });
      }
    }
  };

  const simulateSwap = () => {
    if (!currentPoolId || !swapAmount || !poolExists) return;

    try {
      const amount = Number(swapAmount);
      const amountInCorrectUnits = swapDirection === 'SOL' 
        ? amount * 1e9  // Convert SOL to lamports
        : amount * 1e6; // Convert tokens to base units

      const result = lpSimulator.simulateSwap(
        currentPoolId,
        swapDirection,
        amountInCorrectUnits,
        0.05 // 5% slippage tolerance
      );

      setSwapResult(result);

      toast({
        title: "Swap Simulated 💱",
        description: `${amount} ${swapDirection} → ${(result.outputAmount / (swapDirection === 'SOL' ? 1e6 : 1e9)).toFixed(6)} ${swapDirection === 'SOL' ? tokenSymbol : 'SOL'}`,
        duration: 5000
      });
    } catch (error: any) {
      console.error('Swap simulation error:', error);
      
      if (error.message === 'Pool not found') {
        setPoolExists(false);
        createPool();
      } else {
        toast({
          title: "Swap Simulation Failed",
          description: error.message,
          variant: "destructive"
        });
      }
    }
  };

  const executeSwap = () => {
    if (!currentPoolId || !swapAmount || !poolExists) return;

    try {
      const amount = Number(swapAmount);
      const amountInCorrectUnits = swapDirection === 'SOL' 
        ? amount * 1e9
        : amount * 1e6;

      const result = lpSimulator.executeSwap(
        currentPoolId,
        swapDirection,
        amountInCorrectUnits,
        'user_simulation',
        0.05
      );

      setSwapResult(result);
      fetchAnalytics(); // Refresh analytics after swap

      toast({
        title: "Swap Executed! 🎉",
        description: `${amount} ${swapDirection} swapped successfully`,
        duration: 5000
      });
    } catch (error: any) {
      console.error('Swap execution error:', error);
      
      if (error.message === 'Pool not found') {
        setPoolExists(false);
        createPool();
      } else {
        toast({
          title: "Swap Execution Failed",
          description: error.message,
          variant: "destructive"
        });
      }
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <LoadingSpinner />
          <p className="text-sm text-gray-500 mt-2">Setting up liquidity pool simulation...</p>
        </CardContent>
      </Card>
    );
  }

  if (!currentPoolId || !poolExists) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pool Simulation</CardTitle>
          <CardDescription>
            {!poolExists ? 
              "Pool simulation expired. Create a new one below." : 
              "No pool simulation available. Create a takeover first or provide pool parameters."
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {tokenMint && tokenSymbol && initialSolAmount && initialTokenAmount ? (
            <Button onClick={createPool} disabled={loading}>
              {loading ? <LoadingSpinner /> : "Create Pool Simulation"}
            </Button>
          ) : (
            <p className="text-sm text-gray-500">
              Pool simulation will be available after takeover finalization.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  if (!analytics) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <LoadingSpinner />
          <p className="text-sm text-gray-500 mt-2">Loading pool analytics...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pool Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>🏊 {tokenSymbol}/SOL Pool Simulation</span>
            <div className="flex gap-2">
              <Button onClick={fetchAnalytics} variant="outline" size="sm">
                Refresh
              </Button>
              {!poolExists && (
                <Button onClick={createPool} size="sm" variant="secondary">
                  Recreate Pool
                </Button>
              )}
            </div>
          </CardTitle>
          <CardDescription>
            Live simulation of a {tokenSymbol}/SOL liquidity pool
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold">
                {(analytics.currentPrice * 1e9 / 1e6).toFixed(6)}
              </div>
              <div className="text-sm text-gray-500">SOL per {tokenSymbol}</div>
              <div className={`text-xs ${analytics.priceChange24h >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {analytics.priceChange24h >= 0 ? '+' : ''}{analytics.priceChange24h.toFixed(2)}%
              </div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold">
                {analytics.totalValueLocked.toFixed(2)}
              </div>
              <div className="text-sm text-gray-500">Total Value Locked</div>
              <div className="text-xs text-gray-400">SOL equivalent</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold">
                {(analytics.volume24h / 1e9).toFixed(2)}
              </div>
              <div className="text-sm text-gray-500">24h Volume</div>
              <div className="text-xs text-gray-400">SOL equivalent</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold">
                {analytics.transactionCount}
              </div>
              <div className="text-sm text-gray-500">Total Trades</div>
              <div className="text-xs text-gray-400">All time</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pool Reserves */}
      <Card>
        <CardHeader>
          <CardTitle>Pool Reserves</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">SOL Reserves</span>
                <span className="text-xs bg-orange-100 dark:bg-orange-900 px-2 py-1 rounded">
                  {((analytics.solReserve / (analytics.solReserve + analytics.tokenReserve * analytics.currentPrice)) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="text-2xl font-bold">
                {(analytics.solReserve / 1e9).toFixed(2)}
              </div>
              <div className="text-sm text-gray-500">SOL</div>
            </div>
            
            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{tokenSymbol} Reserves</span>
                <span className="text-xs bg-blue-100 dark:bg-blue-900 px-2 py-1 rounded">
                  {(((analytics.tokenReserve * analytics.currentPrice) / (analytics.solReserve + analytics.tokenReserve * analytics.currentPrice)) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="text-2xl font-bold">
                {(analytics.tokenReserve / 1e6).toLocaleString()}
              </div>
              <div className="text-sm text-gray-500">{tokenSymbol}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Swap Simulator */}
      <Card>
        <CardHeader>
          <CardTitle>Swap Simulator</CardTitle>
          <CardDescription>
            Test swaps and execute trades in the simulation
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Swap Direction</Label>
              <div className="flex gap-2">
                <Button
                  variant={swapDirection === 'SOL' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSwapDirection('SOL')}
                >
                  SOL → {tokenSymbol}
                </Button>
                <Button
                  variant={swapDirection === 'TOKEN' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSwapDirection('TOKEN')}
                >
                  {tokenSymbol} → SOL
                </Button>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Amount to Swap</Label>
              <Input
                type="number"
                step="0.000001"
                value={swapAmount}
                onChange={(e) => setSwapAmount(e.target.value)}
                placeholder={`Enter ${swapDirection} amount`}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={simulateSwap} variant="outline" className="flex-1" disabled={!poolExists}>
              Simulate Swap
            </Button>
            <Button onClick={executeSwap} className="flex-1" disabled={!poolExists}>
              Execute Test Swap
            </Button>
          </div>

          {swapResult && (
            <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <h4 className="font-medium mb-2">Swap Result</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Output: {(swapResult.outputAmount / (swapDirection === 'SOL' ? 1e6 : 1e9)).toFixed(6)} {swapDirection === 'SOL' ? tokenSymbol : 'SOL'}</div>
                <div>Price Impact: {(swapResult.priceImpact * 100).toFixed(2)}%</div>
                <div>Fee: {(swapResult.fee / (swapDirection === 'SOL' ? 1e9 : 1e6)).toFixed(6)} {swapDirection}</div>
                <div>Slippage: {(swapResult.slippage * 100).toFixed(2)}%</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}