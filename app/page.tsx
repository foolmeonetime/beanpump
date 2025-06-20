"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@/components/wallet-multi-button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  Users, 
  Target, 
  Plus, 
  Wallet,
  Settings,
  Bell,
  BarChart3,
  RefreshCw,
  Coins,
  Award,
  Activity
} from 'lucide-react';
import { BillionScaleTakeoversList } from '@/components/billion-scale-takeovers-list';
import { UserClaims } from '@/components/user-claims';
import { LoadingSpinner } from '@/components/loading-spinner';
import { useToast } from '@/components/ui/use-toast';

interface DashboardStats {
  totalTakeovers: number;
  activeTakeovers: number;
  totalVolume: string;
  successRate: number;
  userContributions: string;
  readyForFinalization: number;
}

const StatsCard = ({ 
  title, 
  value, 
  description, 
  icon, 
  trend 
}: { 
  title: string; 
  value: string | number; 
  description: string; 
  icon: React.ReactNode;
  trend?: { value: number; isPositive: boolean };
}) => (
  <Card className="p-6 hover:shadow-lg transition-shadow">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{value}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
        {trend && (
          <div className={`flex items-center text-xs mt-1 ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
            <TrendingUp className="w-3 h-3 mr-1" />
            {trend.isPositive ? '+' : '-'}{trend.value}%
          </div>
        )}
      </div>
      <div className="text-blue-600 dark:text-blue-400">
        {icon}
      </div>
    </div>
  </Card>
);

const QuickActionCard = ({ 
  title, 
  description, 
  icon, 
  href, 
  badge 
}: { 
  title: string; 
  description: string; 
  icon: React.ReactNode;
  href: string;
  badge?: string;
}) => (
  <Card className="p-6 hover:shadow-lg transition-all hover:scale-105 cursor-pointer">
    <Link href={href} className="block">
      <div className="flex items-start justify-between mb-4">
        <div className="text-blue-600 dark:text-blue-400">
          {icon}
        </div>
        {badge && (
          <Badge variant="secondary" className="text-xs">
            {badge}
          </Badge>
        )}
      </div>
      <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </Link>
  </Card>
);

export default function HomePage() {
  const { publicKey } = useWallet();
  const { toast } = useToast();
  const [stats, setStats] = useState<DashboardStats>({
    totalTakeovers: 0,
    activeTakeovers: 0,
    totalVolume: '0',
    successRate: 0,
    userContributions: '0',
    readyForFinalization: 0
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch dashboard stats
  const fetchStats = async () => {
    try {
      const response = await fetch('/api/takeovers');
      if (!response.ok) throw new Error('Failed to fetch stats');
      
      const data = await response.json();
      const takeovers = data.data?.takeovers || [];

      const activeTakeovers = takeovers.filter((t: any) => !t.isFinalized).length;
      const successfulTakeovers = takeovers.filter((t: any) => t.isFinalized && t.isSuccessful).length;
      const totalVolume = takeovers.reduce((sum: number, t: any) => sum + Number(t.totalContributed), 0);
      const readyCount = takeovers.filter((t: any) => !t.isFinalized && t.readyToFinalize).length;

      setStats({
        totalTakeovers: takeovers.length,
        activeTakeovers,
        totalVolume: (totalVolume / 1e9).toFixed(2),
        successRate: takeovers.length > 0 ? Math.round((successfulTakeovers / takeovers.length) * 100) : 0,
        userContributions: '0', // Would need user-specific data
        readyForFinalization: readyCount
      });
    } catch (error: any) {
      console.error('Failed to fetch stats:', error);
      toast({
        title: "Error Loading Stats",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStats();
    setTimeout(() => setRefreshing(false), 1000);
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner className="mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Takeover Dashboard
              </h1>
              <Badge variant="outline" className="hidden sm:inline-flex">
                v2.0
              </Badge>
            </div>
            
            <div className="flex items-center space-x-3">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              </Button>
              <Button variant="ghost" size="sm">
                <Bell className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm">
                <Settings className="w-4 h-4" />
              </Button>
              <WalletMultiButton />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        {!publicKey ? (
          <div className="text-center py-12 mb-8">
            <div className="max-w-2xl mx-auto">
              <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
                Welcome to Takeover System
              </h1>
              <p className="text-xl text-gray-600 dark:text-gray-300 mb-8">
                A decentralized platform for Solana token takeovers with billion-scale safety mechanisms
              </p>
              <WalletMultiButton />
            </div>
          </div>
        ) : (
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Welcome back! 👋
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              Here's what's happening with your takeovers today.
            </p>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatsCard
            title="Total Takeovers"
            value={stats.totalTakeovers}
            description="All time"
            icon={<Target className="w-6 h-6" />}
            trend={{ value: 12, isPositive: true }}
          />
          
          <StatsCard
            title="Active Takeovers"
            value={stats.activeTakeovers}
            description="Currently running"
            icon={<Activity className="w-6 h-6" />}
          />
          
          <StatsCard
            title="Total Volume"
            value={`${stats.totalVolume} SOL`}
            description="All contributions"
            icon={<BarChart3 className="w-6 h-6" />}
            trend={{ value: 8, isPositive: true }}
          />
          
          <StatsCard
            title="Success Rate"
            value={`${stats.successRate}%`}
            description="Completion rate"
            icon={<Award className="w-6 h-6" />}
            trend={{ value: 3, isPositive: true }}
          />
        </div>

        {/* Ready for Finalization Alert */}
        {stats.readyForFinalization > 0 && (
          <Card className="mb-8 border-orange-200 bg-orange-50 dark:bg-orange-900/20">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900 rounded-lg">
                    <Target className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-orange-900 dark:text-orange-100">
                      Ready for Finalization
                    </h3>
                    <p className="text-sm text-orange-700 dark:text-orange-300">
                      {stats.readyForFinalization} takeover{stats.readyForFinalization !== 1 ? 's' : ''} ready to be finalized
                    </p>
                  </div>
                </div>
                <Button variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-100">
                  View All
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Quick Actions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <QuickActionCard
              title="Create Takeover"
              description="Start a new community takeover campaign"
              icon={<Plus className="w-6 h-6" />}
              href="/create"
              badge="New"
            />
            
            <QuickActionCard
              title="Mint Tokens"
              description="Create new SPL tokens for testing"
              icon={<Coins className="w-6 h-6" />}
              href="/mint"
            />
            
            <QuickActionCard
              title="View Claims"
              description="Check your pending token claims"
              icon={<Award className="w-6 h-6" />}
              href="/claims"
            />
            
            <QuickActionCard
              title="Pool Simulator"
              description="Simulate liquidity pool scenarios"
              icon={<BarChart3 className="w-6 h-6" />}
              href="/pools"
            />
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Takeovers List */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Recent Takeovers
              </h2>
              <Link href="/takeover" className="text-blue-600 hover:text-blue-800 font-medium">
                View All →
              </Link>
            </div>
            
            <BillionScaleTakeoversList />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* User Claims (if wallet connected) */}
            {publicKey && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Award className="w-5 h-5" />
                    <span>Your Claims</span>
                  </CardTitle>
                  <CardDescription>
                    Pending rewards and refunds
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <UserClaims />
                </CardContent>
              </Card>
            )}

            {/* Getting Started Guide */}
            <Card>
              <CardHeader>
                <CardTitle>Getting Started</CardTitle>
                <CardDescription>
                  New to takeovers? Learn the basics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">1. Connect Your Wallet</h4>
                  <p className="text-xs text-muted-foreground">
                    Use Phantom, Solflare, or any Solana wallet
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">2. Browse Takeovers</h4>
                  <p className="text-xs text-muted-foreground">
                    Find active takeover campaigns to participate in
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">3. Contribute Tokens</h4>
                  <p className="text-xs text-muted-foreground">
                    Contribute V1 tokens to receive V2 rewards
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">4. Claim Rewards</h4>
                  <p className="text-xs text-muted-foreground">
                    Claim your V2 tokens when takeover succeeds
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  {[
                    { action: 'BONK takeover finalized', time: '2 hours ago' },
                    { action: 'New WIF takeover created', time: '4 hours ago' },
                    { action: 'SAMO takeover funded', time: '6 hours ago' },
                    { action: 'COPE takeover completed', time: '1 day ago' },
                  ].map((activity, index) => (
                    <div key={index} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                      <span className="text-gray-700 dark:text-gray-300">{activity.action}</span>
                      <span className="text-xs text-muted-foreground">{activity.time}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}