import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Card, 
  StatsCard, 
  FeatureCard, 
  ExpandableCard 
} from '@/components/ui/card';
import { Progress, CircularProgress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import TakeoverCard from '@/components/takeover-card';
import { 
  TrendingUp, 
  Users, 
  Target, 
  Clock, 
  Plus, 
  Search, 
  Filter,
  RefreshCw,
  BarChart3,
  Wallet,
  Settings,
  Bell
} from 'lucide-react';

interface DashboardStats {
  totalTakeovers: number;
  activeTakeovers: number;
  totalVolume: string;
  successRate: number;
  userContributions: string;
  readyForFinalization: number;
}

interface DashboardProps {
  stats: DashboardStats;
  takeovers: any[];
  loading?: boolean;
  onCreateTakeover?: () => void;
  onRefresh?: () => void;
}

const ModernDashboard: React.FC<DashboardProps> = ({
  stats,
  takeovers,
  loading = false,
  onCreateTakeover,
  onRefresh
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'ready' | 'completed'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filter takeovers based on search and status
  const filteredTakeovers = takeovers.filter(takeover => {
    const matchesSearch = !searchTerm || 
      takeover.tokenName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      takeover.tokenSymbol.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterStatus === 'all' || 
      (filterStatus === 'active' && !takeover.isFinalized) ||
      (filterStatus === 'ready' && takeover.canFinalize) ||
      (filterStatus === 'completed' && takeover.isFinalized);
    
    return matchesSearch && matchesFilter;
  });

  const handleRefresh = async () => {
    if (!onRefresh) return;
    
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setTimeout(() => setIsRefreshing(false), 1000); // Minimum animation time
    }
  };

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
              <Button variant="ghost" size="sm">
                <Bell className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm">
                <Settings className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm">
                <Wallet className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8"
        >
          <StatsCard
            title="Total Takeovers"
            value={stats.totalTakeovers}
            description="All time"
            trend={{ value: 12, isPositive: true }}
            icon={<Target className="w-6 h-6" />}
          />
          
          <StatsCard
            title="Active Takeovers"
            value={stats.activeTakeovers}
            description="Currently running"
            icon={<TrendingUp className="w-6 h-6" />}
          />
          
          <StatsCard
            title="Total Volume"
            value={`${stats.totalVolume} SOL`}
            description="All contributions"
            trend={{ value: 8, isPositive: true }}
            icon={<BarChart3 className="w-6 h-6" />}
          />
          
          <StatsCard
            title="Success Rate"
            value={`${stats.successRate}%`}
            description="Completion rate"
            trend={{ value: 3, isPositive: true }}
            icon={<Users className="w-6 h-6" />}
          />
        </motion.div>

        {/* Quick Actions & Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8"
        >
          <div className="flex items-center space-x-4">
            <Button onClick={onCreateTakeover} className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700">
              <Plus className="w-4 h-4 mr-2" />
              Create Takeover
            </Button>
            
            <Button 
              variant="outline" 
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          
          <div className="flex items-center space-x-3 w-full sm:w-auto">
            {/* Search */}
            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search takeovers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full sm:w-64"
              />
            </div>
            
            {/* Filter */}
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="ready">Ready</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>
        </motion.div>

        {/* Featured Takeover (if any ready for finalization) */}
        {stats.readyForFinalization > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-8"
          >
            <Card className="bg-gradient-to-r from-orange-50 to-red-50 border-orange-200">
              <div className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-orange-900 mb-1">
                      🎯 Ready for Finalization
                    </h3>
                    <p className="text-orange-700">
                      {stats.readyForFinalization} takeover{stats.readyForFinalization > 1 ? 's' : ''} ready to be finalized
                    </p>
                  </div>
                  <Button variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-100">
                    Auto-Finalize All
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Takeovers List */}
          <div className="lg:col-span-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Takeovers ({filteredTakeovers.length})
                </h2>
                
                <div className="flex space-x-2">
                  <Button variant="ghost" size="sm">
                    Grid
                  </Button>
                  <Button variant="ghost" size="sm">
                    List
                  </Button>
                </div>
              </div>

              {loading ? (
                <div className="grid gap-6">
                  {[1, 2, 3].map((i) => (
                    <Card key={i} loading className="h-64" />
                  ))}
                </div>
              ) : filteredTakeovers.length === 0 ? (
                <Card className="p-12 text-center">
                  <Target className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No takeovers found
                  </h3>
                  <p className="text-gray-600 mb-4">
                    {searchTerm || filterStatus !== 'all' 
                      ? 'Try adjusting your search or filter criteria.'
                      : 'Get started by creating your first takeover.'
                    }
                  </p>
                  {!searchTerm && filterStatus === 'all' && (
                    <Button onClick={onCreateTakeover}>
                      Create First Takeover
                    </Button>
                  )}
                </Card>
              ) : (
                <motion.div 
                  className="grid gap-6"
                  layout
                >
                  <AnimatePresence mode="popLayout">
                    {filteredTakeovers.map((takeover, index) => (
                      <motion.div
                        key={takeover.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3, delay: index * 0.05 }}
                        layout
                      >
                        <TakeoverCard
                          takeover={takeover}
                          variant="detailed"
                          onParticipate={async (id) => console.log('Participate:', id)}
                          onFinalize={async (id) => console.log('Finalize:', id)}
                          onViewDetails={(id) => console.log('View details:', id)}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}
            </motion.div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Stats */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              <Card>
                <div className="p-6 text-center">
                  <h3 className="text-lg font-semibold mb-4">Your Contributions</h3>
                  <CircularProgress
                    value={75}
                    size={120}
                    variant="default"
                    label="Portfolio"
                  />
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Total Contributed</span>
                      <span className="font-medium">{stats.userContributions} SOL</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Active Positions</span>
                      <span className="font-medium">8</span>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* Recent Activity */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              <ExpandableCard
                title="Recent Activity"
                description="Latest takeover events"
                defaultExpanded={false}
              >
                <div className="space-y-3">
                  {[
                    { action: 'Participated in BONK takeover', time: '2 hours ago' },
                    { action: 'SAMO takeover finalized', time: '5 hours ago' },
                    { action: 'Created WIF takeover', time: '1 day ago' },
                  ].map((activity, index) => (
                    <div key={index} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                      <span className="text-sm text-gray-700">{activity.action}</span>
                      <span className="text-xs text-gray-500">{activity.time}</span>
                    </div>
                  ))}
                </div>
              </ExpandableCard>
            </motion.div>

            {/* Market Insights */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.6 }}
            >
              <FeatureCard
                title="Market Insights"
                description="AI-powered analysis of current takeover trends and opportunities"
                icon={<BarChart3 className="w-5 h-5" />}
                badge={{ label: "Beta", variant: "warning" }}
                action={{
                  label: "View Insights",
                  onClick: () => console.log('View insights')
                }}
              />
            </motion.div>

            {/* Learning Resources */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.7 }}
            >
              <FeatureCard
                title="Learn Takeovers"
                description="New to takeovers? Learn the basics and advanced strategies"
                icon={<Users className="w-5 h-5" />}
                action={{
                  label: "Start Learning",
                  onClick: () => console.log('Start learning')
                }}
              />
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModernDashboard;