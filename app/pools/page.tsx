"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import { LoadingSpinner } from "@/components/loading-spinner";
import { PoolAnalyticsComponent } from "@/components/pool-analytics";
import { globalLPSimulator, type EnhancedSimulatedPool } from "@/lib/enhanced-lp-simulator";
import { Database, TrendingUp, TrendingDown, Activity, DollarSign } from "lucide-react";

export default function PoolsPage() {
  const [pools, setPools] = useState<EnhancedSimulatedPool[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
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
    
    // Auto-refresh every 30 seconds to catch newly finalized takeovers
    const interval = setInterval(fetchPools, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchPools = async () => {
    try {
      setLoading(true);
      
      // Get pools from enhanced simulator (automatically syncs with database)
      const allPools = globalLPSimulator.getAllPools();
      setPools(allPools);
      
      console.log(`📊 Loaded ${allPools.length} pools (${allPools.filter(p => p.isFromDatabase).length} from database)`);
      
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

  const forceDatabaseSync = async () => {
    try {
      setSyncing(true);
      
      // Force database sync through API
      const response = await fetch('/api/pools/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const data = await response.json();
      
      if (data.success) {
        await fetchPools();
        toast({
          title: "🔄 Database Sync Complete",
          description: `Synchronized ${data.poolsFound || 0} pools from finalized takeovers`,
          duration: 5000
        });
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('Error syncing database:', error);
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSyncing(false);
    }
  };

  const createPool = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      
      // Create pool through simulator API
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

  // Filter pools based on active tab
  const filteredPools = pools.filter(pool => {
    switch (activeTab) {
      case "database":
        return pool.isFromDatabase;
      case "simulated":
        return !pool.isFromDatabase;
      default:
        return true;
    }
  });

  const databasePools = pools.filter(p => p.isFromDatabase);
  const simulatedPools = pools.filter(p => !p.isFromDatabase);

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
            Monitor real takeover pools and test trading mechanics
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={forceDatabaseSync} 
            variant="outline"
            disabled={syncing}
          >
            {syncing ? <LoadingSpinner className="mr-2" /> : <Database className="w-4 h-4 mr-2" />}
            Sync Database
          </Button>
          <Button onClick={fetchPools} variant="outline" disabled={loading}>
            Refresh
          </Button>
          <Button onClick={() => setShowCreateForm(!showCreateForm)}>
            {showCreateForm ? 'Cancel' : 'Create Pool'}
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Database className="w-5 h-5 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{databasePools.length}</p>
                <p className="text-sm text-gray-600">Real Takeover Pools</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{simulatedPools.length}</p>
                <p className="text-sm text-gray-600">Test Simulations</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <DollarSign className="w-5 h-5 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">
                  {databasePools.reduce((sum, pool) => sum + pool.totalValueLocked, 0).toFixed(1)}
                </p>
                <p className="text-sm text-gray-600">Total TVL (SOL)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <TrendingUp className="w-5 h-5 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">
                  {pools.reduce((sum, pool) => sum + pool.transactions.length, 0)}
                </p>
                <p className="text-sm text-gray-600">Total Transactions</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Market Conditions Control */}
      <Card>
        <CardHeader>
          <CardTitle>Market Conditions</CardTitle>
          <CardDescription>
            Adjust global market conditions to see how they affect all pool simulations
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
              Set up a new liquidity pool for testing trading mechanics (this won't affect real pools)
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
                {loading ? <LoadingSpinner /> : "Create Test Pool Simulation"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Pools List with Tabs */}
      <Card>
        <CardHeader>
          <CardTitle>Pool Overview</CardTitle>
          <CardDescription>
            Real pools are automatically created from successful takeovers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all">All Pools ({pools.length})</TabsTrigger>
              <TabsTrigger value="database">
                Real Pools ({databasePools.length})
              </TabsTrigger>
              <TabsTrigger value="simulated">
                Test Pools ({simulatedPools.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-4 mt-6">
              <PoolsList pools={filteredPools} selectedPool={selectedPool} setSelectedPool={setSelectedPool} />
            </TabsContent>

            <TabsContent value="database" className="space-y-4 mt-6">
              {databasePools.length === 0 ? (
                <div className="text-center py-8">
                  <Database className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Real Pools Yet</h3>
                  <p className="text-gray-500 mb-4">
                    Pools will appear here automatically when takeovers are finalized successfully
                  </p>
                  <Button onClick={forceDatabaseSync} variant="outline">
                    <Database className="w-4 h-4 mr-2" />
                    Check for New Pools
                  </Button>
                </div>
              ) : (
                <PoolsList pools={databasePools} selectedPool={selectedPool} setSelectedPool={setSelectedPool} />
              )}
            </TabsContent>

            <TabsContent value="simulated" className="space-y-4 mt-6">
              {simulatedPools.length === 0 ? (
                <div className="text-center py-8">
                  <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Test Pools</h3>
                  <p className="text-gray-500 mb-4">
                    Create test pools to experiment with trading mechanics
                  </p>
                  <Button onClick={() => setShowCreateForm(true)}>
                    Create Test Pool
                  </Button>
                </div>
              ) : (
                <PoolsList pools={simulatedPools} selectedPool={selectedPool} setSelectedPool={setSelectedPool} />
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

// Separate component for pools list to reduce complexity
function PoolsList({ 
  pools, 
  selectedPool, 
  setSelectedPool 
}: { 
  pools: EnhancedSimulatedPool[];
  selectedPool: string | null;
  setSelectedPool: (id: string | null) => void;
}) {
  if (pools.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No pools found in this category</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pools.map((pool) => {
        const currentPrice = pool.priceHistory[pool.priceHistory.length - 1]?.price || 0;
        const priceDisplay = (currentPrice * 1e9 / 1e6).toFixed(6);
        
        return (
          <Card key={pool.id} className="cursor-pointer hover:shadow-md transition-shadow">
            <CardHeader onClick={() => setSelectedPool(selectedPool === pool.id ? null : pool.id)}>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span>{pool.tokenSymbol}/SOL</span>
                  {pool.isFromDatabase ? (
                    <Badge variant="default" className="bg-blue-100 text-blue-800">
                      <Database className="w-3 h-3 mr-1" />
                      Real Pool
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <Activity className="w-3 h-3 mr-1" />
                      Test Pool
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                    {priceDisplay} SOL
                  </span>
                  <span className="text-xs text-gray-500">
                    {selectedPool === pool.id ? '▼' : '▶'}
                  </span>
                </div>
              </CardTitle>
              <CardDescription className="flex items-center justify-between">
                <span>
                  {pool.transactions.length} transactions • TVL: {pool.totalValueLocked.toFixed(2)} SOL
                </span>
                {pool.isFromDatabase && pool.takeoverAddress && (
                  <span className="text-xs font-mono">
                    {pool.takeoverAddress.slice(0, 8)}...
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            
            {selectedPool === pool.id && (
              <CardContent>
                <PoolAnalyticsComponent 
                  poolId={pool.id}
                  tokenSymbol={pool.tokenSymbol}
                />
                
                {pool.isFromDatabase && (
                  <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                      🎯 Real Takeover Pool
                    </h4>
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                      This pool was automatically created from a successful takeover. 
                      Trading data reflects real potential market conditions.
                    </p>
                    {pool.takeoverAddress && (
                      <p className="text-xs text-blue-700 dark:text-blue-300 mt-2 font-mono">
                        Takeover: {pool.takeoverAddress}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}