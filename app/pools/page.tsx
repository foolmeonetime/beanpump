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
import { Database, TrendingUp, TrendingDown, Activity, DollarSign, RefreshCw } from "lucide-react";

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
      
      // Wait for simulator to sync with API, then get pools
      await globalLPSimulator.syncWithDatabaseViaAPI();
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
          title: "Sync Complete",
          description: `Found ${data.poolsFound} pools from database`,
        });
      } else {
        throw new Error(data.error || 'Sync failed');
      }
      
    } catch (error: any) {
      console.error('Error syncing pools:', error);
      toast({
        title: "Sync Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setSyncing(false);
    }
  };

  const createTestPool = () => {
    try {
      const poolId = globalLPSimulator.createTestPool({
        tokenMint: createForm.tokenMint || "TEST" + Date.now(),
        tokenSymbol: createForm.tokenSymbol || "TEST",
        initialSolAmount: parseFloat(createForm.initialSolAmount) * 1e9, // Convert to lamports
        initialTokenAmount: parseFloat(createForm.initialTokenAmount) * 1e6, // Assume 6 decimals
        fee: parseFloat(createForm.fee)
      });

      // Refresh pools to show the new test pool
      const allPools = globalLPSimulator.getAllPools();
      setPools(allPools);

      toast({
        title: "Test Pool Created",
        description: `Created pool ${createForm.tokenSymbol}/SOL`,
      });

      setShowCreateForm(false);
      setCreateForm({
        tokenMint: "",
        tokenSymbol: "",
        initialSolAmount: "1",
        initialTokenAmount: "1000000",
        fee: "0.003"
      });

    } catch (error: any) {
      console.error('Error creating test pool:', error);
      toast({
        title: "Creation Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  };

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

  const formatNumber = (num: number, decimals: number = 2) => {
    if (num >= 1e9) return (num / 1e9).toFixed(decimals) + "B";
    if (num >= 1e6) return (num / 1e6).toFixed(decimals) + "M";
    if (num >= 1e3) return (num / 1e3).toFixed(decimals) + "K";
    return num.toFixed(decimals);
  };

  const formatSOL = (lamports: number) => {
    return (lamports / 1e9).toFixed(3) + " SOL";
  };

  const formatTokens = (amount: number) => {
    return formatNumber(amount / 1e6) + " tokens";
  };

  if (loading && pools.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-[400px]">
          <LoadingSpinner />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Liquidity Pools</h1>
          <p className="text-muted-foreground">
            Manage and analyze liquidity pools from successful takeovers
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={forceDatabaseSync}
            disabled={syncing}
            variant="outline"
            size="sm"
          >
            {syncing ? <LoadingSpinner className="w-4 h-4 mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Sync Database
          </Button>
          <Button
            onClick={() => setShowCreateForm(true)}
            variant="outline"
            size="sm"
          >
            Create Test Pool
          </Button>
        </div>
      </div>

      {/* Pool Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium">Total Pools</span>
            </div>
            <div className="text-2xl font-bold">{pools.length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium">Database Pools</span>
            </div>
            <div className="text-2xl font-bold">{pools.filter(p => p.isFromDatabase).length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-medium">Test Pools</span>
            </div>
            <div className="text-2xl font-bold">{pools.filter(p => !p.isFromDatabase).length}</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-yellow-600" />
              <span className="text-sm font-medium">Total TVL</span>
            </div>
            <div className="text-2xl font-bold">
              {formatSOL(pools.reduce((sum, pool) => sum + pool.totalValueLocked, 0))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pool Tabs and List */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="all">All Pools ({pools.length})</TabsTrigger>
          <TabsTrigger value="database">Database ({pools.filter(p => p.isFromDatabase).length})</TabsTrigger>
          <TabsTrigger value="simulated">Simulated ({pools.filter(p => !p.isFromDatabase).length})</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-6">
          {filteredPools.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Database className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Pools Found</h3>
                <p className="text-muted-foreground mb-4">
                  {activeTab === "database" 
                    ? "No pools created from successful takeovers yet."
                    : activeTab === "simulated"
                    ? "No test pools created yet."
                    : "No pools available. Try syncing with database or creating a test pool."
                  }
                </p>
                {activeTab !== "simulated" && (
                  <Button onClick={forceDatabaseSync} disabled={syncing}>
                    {syncing ? <LoadingSpinner className="w-4 h-4 mr-2" /> : <Database className="w-4 h-4 mr-2" />}
                    Sync Database
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPools.map((pool) => (
                <Card key={pool.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedPool(pool.id)}>
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{pool.tokenSymbol}/SOL</CardTitle>
                        <CardDescription>
                          {pool.isFromDatabase ? "From Takeover" : "Test Pool"}
                        </CardDescription>
                      </div>
                      <Badge variant={pool.isFromDatabase ? "default" : "secondary"}>
                        {pool.isFromDatabase ? "Live" : "Test"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">SOL Reserve:</span>
                        <span>{formatSOL(pool.solReserve)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Token Reserve:</span>
                        <span>{formatTokens(pool.tokenReserve)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Current Price:</span>
                        <span>{(pool.solReserve / pool.tokenReserve * 1e3).toFixed(6)} SOL</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">TVL:</span>
                        <span>{formatSOL(pool.totalValueLocked)}</span>
                      </div>
                      {pool.volume24h > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">24h Volume:</span>
                          <span>{formatSOL(pool.volume24h)}</span>
                        </div>
                      )}
                    </div>
                    {pool.takeoverAddress && (
                      <div className="mt-3 p-2 bg-muted rounded text-xs">
                        <span className="text-muted-foreground">Takeover: </span>
                        <span className="font-mono">{pool.takeoverAddress.slice(0, 8)}...{pool.takeoverAddress.slice(-8)}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create Test Pool Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Create Test Pool</CardTitle>
              <CardDescription>
                Create a simulated liquidity pool for testing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="tokenSymbol">Token Symbol</Label>
                <Input
                  id="tokenSymbol"
                  value={createForm.tokenSymbol}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, tokenSymbol: e.target.value }))}
                  placeholder="e.g., TEST"
                />
              </div>
              <div>
                <Label htmlFor="tokenMint">Token Mint (optional)</Label>
                <Input
                  id="tokenMint"
                  value={createForm.tokenMint}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, tokenMint: e.target.value }))}
                  placeholder="Will auto-generate if empty"
                />
              </div>
              <div>
                <Label htmlFor="initialSolAmount">Initial SOL Amount</Label>
                <Input
                  id="initialSolAmount"
                  type="number"
                  step="0.1"
                  value={createForm.initialSolAmount}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, initialSolAmount: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="initialTokenAmount">Initial Token Amount</Label>
                <Input
                  id="initialTokenAmount"
                  type="number"
                  value={createForm.initialTokenAmount}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, initialTokenAmount: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="fee">Fee (decimal)</Label>
                <Input
                  id="fee"
                  type="number"
                  step="0.001"
                  value={createForm.fee}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, fee: e.target.value }))}
                />
              </div>
            </CardContent>
            <div className="flex justify-end gap-2 p-6 pt-0">
              <Button variant="outline" onClick={() => setShowCreateForm(false)}>
                Cancel
              </Button>
              <Button onClick={createTestPool}>
                Create Pool
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Pool Analytics Modal */}
      {selectedPool && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-background rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold">Pool Analytics</h2>
                <Button variant="outline" onClick={() => setSelectedPool(null)}>
                  Close
                </Button>
              </div>
              <PoolAnalyticsComponent 
                poolId={selectedPool}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}