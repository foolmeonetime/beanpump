"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { LoadingSpinner } from "@/components/loading-spinner";
import { PoolAnalyticsComponent } from "@/components/pool-analytics";
import { SimulatedPool } from "@/lib/lp-simulator";

export default function PoolsPage() {
  const [pools, setPools] = useState<SimulatedPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({
    tokenMint: "",
    tokenSymbol: "",
    initialSolAmount: "1",
    initialTokenAmount: "1000000",
    fee: "0.003"
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchPools();
  }, []);

  const fetchPools = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/pools');
      const data = await response.json();
      
      if (data.success) {
        setPools(data.pools);
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('Error fetching pools:', error);
      toast({
        title: "Error Loading Pools",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const createPool = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      
      const response = await fetch('/api/pools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          tokenMint: createForm.tokenMint,
          tokenSymbol: createForm.tokenSymbol,
          initialSolAmount: Number(createForm.initialSolAmount) * 1e9, // Convert to lamports
          initialTokenAmount: Number(createForm.initialTokenAmount) * 1e6, // Convert to base units
          fee: Number(createForm.fee)
        })
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Pool Created! 🏊",
          description: `${createForm.tokenSymbol}/SOL pool simulation started`,
          duration: 5000
        });
        
        setShowCreateForm(false);
        setCreateForm({
          tokenMint: "",
          tokenSymbol: "",
          initialSolAmount: "1",
          initialTokenAmount: "1000000",
          fee: "0.003"
        });
        
        await fetchPools();
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('Error creating pool:', error);
      toast({
        title: "Pool Creation Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const setMarketConditions = async (conditions: any) => {
    try {
      const response = await fetch('/api/pools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_market_conditions',
          marketConditions: conditions
        })
      });

      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Market Conditions Updated 📊",
          description: "Pool simulations will reflect new market conditions",
          duration: 3000
        });
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('Error setting market conditions:', error);
      toast({
        title: "Failed to Update Market Conditions",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  if (loading && pools.length === 0) {
    return (
      <div className="flex flex-col justify-center items-center h-64 space-y-4">
        <LoadingSpinner />
        <span className="text-gray-600">Loading pool simulations...</span>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Liquidity Pool Simulator</h1>
          <p className="text-gray-600 dark:text-gray-300 mt-2">
            Test trading mechanics for your tokens before creating real pools
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchPools} variant="outline">
            Refresh
          </Button>
          <Button onClick={() => setShowCreateForm(!showCreateForm)}>
            {showCreateForm ? 'Cancel' : 'Create Pool'}
          </Button>
        </div>
      </div>

      {/* Market Conditions Control */}
      <Card>
        <CardHeader>
          <CardTitle>Market Conditions</CardTitle>
          <CardDescription>
            Adjust global market conditions to see how they affect all pools
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button 
              onClick={() => setMarketConditions({ volatility: 0.05, trending: 0.5, liquidity: 1.2 })}
              variant="outline"
              size="sm"
            >
              🚀 Bull Market
            </Button>
            <Button 
              onClick={() => setMarketConditions({ volatility: 0.15, trending: -0.5, liquidity: 0.8 })}
              variant="outline"
              size="sm"
            >
              🐻 Bear Market
            </Button>
            <Button 
              onClick={() => setMarketConditions({ volatility: 0.3, trending: 0, liquidity: 0.6 })}
              variant="outline"
              size="sm"
            >
              💥 High Volatility
            </Button>
            <Button 
              onClick={() => setMarketConditions({ volatility: 0.1, trending: 0, liquidity: 1.0 })}
              variant="outline"
              size="sm"
            >
              📊 Normal Market
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Create Pool Form */}
      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create New Pool Simulation</CardTitle>
            <CardDescription>
              Set up a new liquidity pool for testing trading mechanics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={createPool} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tokenMint">Token Mint Address</Label>
                  <Input
                    id="tokenMint"
                    value={createForm.tokenMint}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, tokenMint: e.target.value }))}
                    placeholder="Token mint address"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tokenSymbol">Token Symbol</Label>
                  <Input
                    id="tokenSymbol"
                    value={createForm.tokenSymbol}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, tokenSymbol: e.target.value }))}
                    placeholder="e.g., TEST"
                    required
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="initialSolAmount">Initial SOL Amount</Label>
                  <Input
                    id="initialSolAmount"
                    type="number"
                    step="0.1"
                    value={createForm.initialSolAmount}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, initialSolAmount: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="initialTokenAmount">Initial Token Amount</Label>
                  <Input
                    id="initialTokenAmount"
                    type="number"
                    value={createForm.initialTokenAmount}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, initialTokenAmount: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fee">Pool Fee (%)</Label>
                  <Input
                    id="fee"
                    type="number"
                    step="0.001"
                    value={createForm.fee}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, fee: e.target.value }))}
                    required
                  />
                </div>
              </div>
              
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? <LoadingSpinner /> : "Create Pool Simulation"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Pools List */}
      {pools.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center">
            <h3 className="text-lg font-medium mb-2">No Pool Simulations</h3>
            <p className="text-gray-500 mb-4">
              Create your first pool simulation to test trading mechanics
            </p>
            <Button onClick={() => setShowCreateForm(true)}>
              Create First Pool
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          <h2 className="text-xl font-semibold">Active Pool Simulations ({pools.length})</h2>
          
          {pools.map((pool) => (
            <Card key={pool.id} className="cursor-pointer hover:shadow-md transition-shadow">
              <CardHeader onClick={() => setSelectedPool(selectedPool === pool.id ? null : pool.id)}>
                <CardTitle className="flex items-center justify-between">
                  <span>{pool.tokenSymbol}/SOL Pool</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                      {(pool.priceHistory[pool.priceHistory.length - 1]?.price * 1e9 / 1e6 || 0).toFixed(6)} SOL
                    </span>
                    <span className="text-xs text-gray-500">
                      {selectedPool === pool.id ? '▼' : '▶'}
                    </span>
                  </div>
                </CardTitle>
                <CardDescription>
                  {pool.transactions.length} transactions • Created {new Date(pool.createdAt).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              
              {selectedPool === pool.id && (
                <CardContent>
                  <PoolAnalyticsComponent 
                    poolId={pool.id}
                    tokenSymbol={pool.tokenSymbol}
                  />
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}