import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Progress, CircularProgress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { Clock, Target, Users, TrendingUp, ExternalLink, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ProcessedTakeoverData {
  id: string;
  tokenName: string;
  tokenSymbol: string;
  tokenMint: string;
  totalContributed: string;
  minAmount: string;
  maxAmount?: string;
  startTime: string;
  endTime: string;
  isFinalized: boolean;
  isSuccessful?: boolean;
  canFinalize: boolean;
  participantCount?: number;
  tokenImage?: string;
  description?: string;
  v1MarketPrice?: string;
  rewardRate?: number;
}

interface TakeoverCardProps {
  takeover: ProcessedTakeoverData;
  onParticipate?: (takeoverId: string) => void;
  onFinalize?: (takeoverId: string) => void;
  onViewDetails?: (takeoverId: string) => void;
  variant?: 'compact' | 'detailed' | 'featured';
  showActions?: boolean;
  className?: string;
}

export const TakeoverCard: React.FC<TakeoverCardProps> = ({
  takeover,
  onParticipate,
  onFinalize,
  onViewDetails,
  variant = 'detailed',
  showActions = true,
  className
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isParticipating, setIsParticipating] = useState(false);
  const { toast } = useToast();

  // Calculate progress and status
  const progress = useMemo(() => {
    const contributed = BigInt(takeover.totalContributed);
    const minimum = BigInt(takeover.minAmount);
    const maximum = takeover.maxAmount ? BigInt(takeover.maxAmount) : minimum * 2n;
    
    const percentage = Number((contributed * 100n) / minimum);
    const isGoalReached = contributed >= minimum;
    const isOverfunded = takeover.maxAmount ? contributed >= BigInt(takeover.maxAmount) : false;
    
    return {
      percentage: Math.min(percentage, 100),
      contributed,
      minimum,
      maximum,
      isGoalReached,
      isOverfunded,
    };
  }, [takeover.totalContributed, takeover.minAmount, takeover.maxAmount]);

  // Calculate time remaining
  const timeInfo = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const startTime = parseInt(takeover.startTime);
    const endTime = parseInt(takeover.endTime);
    
    const isStarted = now >= startTime;
    const isEnded = now >= endTime;
    const timeRemaining = endTime - now;
    
    let timeDisplay = '';
    if (!isStarted) {
      const timeToStart = startTime - now;
      timeDisplay = `Starts in ${formatTimeRemaining(timeToStart)}`;
    } else if (!isEnded) {
      timeDisplay = formatTimeRemaining(timeRemaining);
    } else {
      timeDisplay = 'Ended';
    }
    
    return {
      isStarted,
      isEnded,
      timeRemaining,
      timeDisplay,
      urgency: timeRemaining < 3600 ? 'critical' : timeRemaining < 86400 ? 'warning' : 'normal'
    };
  }, [takeover.startTime, takeover.endTime]);

  // Determine card status and styling
  const status = useMemo(() => {
    if (takeover.isFinalized) {
      return {
        type: takeover.isSuccessful ? 'success' : 'failed',
        label: takeover.isSuccessful ? 'Successful' : 'Failed',
        variant: (takeover.isSuccessful ? 'success' : 'destructive') as "success" | "destructive",
        icon: takeover.isSuccessful ? CheckCircle2 : AlertCircle
      };
    }
    
    if (timeInfo.isEnded || progress.isGoalReached) {
      return {
        type: 'ready',
        label: 'Ready to Finalize',
        variant: 'warning' as "warning",
        icon: Target
      };
    }
    
    if (!timeInfo.isStarted) {
      return {
        type: 'upcoming',
        label: 'Upcoming',
        variant: 'secondary' as "secondary",
        icon: Clock
      };
    }
    
    return {
      type: 'active',
      label: 'Active',
      variant: 'default' as "default",
      icon: TrendingUp
    };
  }, [takeover.isFinalized, takeover.isSuccessful, timeInfo.isEnded, progress.isGoalReached, timeInfo.isStarted]);

  // Format amounts for display
  const formatAmount = (lamports: string): string => {
    const sol = Number(lamports) / 1_000_000_000;
    return sol < 0.01 ? sol.toExponential(2) : sol.toFixed(sol < 1 ? 4 : 2);
  };

  const formatTimeRemaining = (seconds: number): string => {
    if (seconds <= 0) return '0s';
    
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const handleParticipate = async () => {
    if (!onParticipate) return;
    
    setIsParticipating(true);
    try {
      await onParticipate(takeover.id);
      toast({
        title: "Participation Successful!",
        description: `You've joined the ${takeover.tokenSymbol} takeover.`,
        variant: "default",
      });
    } catch (error: any) {
      toast({
        title: "Participation Failed",
        description: error.message || "Failed to participate in takeover",
        variant: "destructive",
      });
    } finally {
      setIsParticipating(false);
    }
  };

  const handleFinalize = async () => {
    if (!onFinalize) return;
    
    try {
      await onFinalize(takeover.id);
      toast({
        title: "Finalization Successful!",
        description: `${takeover.tokenSymbol} takeover has been finalized.`,
        variant: "default",
      });
    } catch (error: any) {
      toast({
        title: "Finalization Failed", 
        description: error.message || "Failed to finalize takeover",
        variant: "destructive",
      });
    }
  };

  // Compact variant for list views
  if (variant === 'compact') {
    return (
      <Card 
        interactive 
        className={`group transition-all duration-200 hover:shadow-md ${className}`}
        onClick={() => onViewDetails?.(takeover.id)}
      >
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              {takeover.tokenImage && (
                <img 
                  src={takeover.tokenImage} 
                  alt={takeover.tokenSymbol}
                  className="w-10 h-10 rounded-full"
                />
              )}
              <div>
                <h3 className="font-semibold">{takeover.tokenSymbol}</h3>
                <p className="text-sm text-gray-600">{formatAmount(takeover.totalContributed)} SOL</p>
              </div>
            </div>
            <div className="text-right">
              <Badge variant={status.variant}>{status.label}</Badge>
              <p className="text-xs text-gray-500 mt-1">{timeInfo.timeDisplay}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Featured variant for hero sections
  if (variant === 'featured') {
    return (
      <Card className={`relative overflow-hidden ${className}`}>
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20" />
        
        <CardHeader className="relative z-10 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-4">
              {takeover.tokenImage && (
                <img 
                  src={takeover.tokenImage} 
                  alt={takeover.tokenSymbol}
                  className="w-16 h-16 rounded-full border-4 border-white shadow-lg"
                />
              )}
              <div>
                <CardTitle level={2} className="text-2xl">
                  {takeover.tokenName}
                </CardTitle>
                <CardDescription className="text-lg font-medium text-primary">
                  ${takeover.tokenSymbol}
                </CardDescription>
                <Badge variant={status.variant} className="mt-2">
                  <status.icon className="w-3 h-3 mr-1" />
                  {status.label}
                </Badge>
              </div>
            </div>
            
            <div className="text-right">
              <div className="text-3xl font-bold text-primary">
                {progress.percentage.toFixed(1)}%
              </div>
              <div className="text-sm text-gray-600">
                {formatAmount(takeover.totalContributed)} / {formatAmount(takeover.minAmount)} SOL
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="relative z-10 space-y-6">
          {/* Large progress bar */}
          <Progress 
            value={progress.percentage} 
            variant={progress.isGoalReached ? "success" : "default"}
            size="lg"
            animated
            label="Funding Progress"
          />

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-white/50 rounded-lg">
              <Users className="w-5 h-5 mx-auto mb-1 text-gray-600" />
              <div className="text-lg font-semibold">{takeover.participantCount || 0}</div>
              <div className="text-xs text-gray-600">Participants</div>
            </div>
            <div className="text-center p-3 bg-white/50 rounded-lg">
              <Clock className="w-5 h-5 mx-auto mb-1 text-gray-600" />
              <div className="text-lg font-semibold">{timeInfo.timeDisplay}</div>
              <div className="text-xs text-gray-600">Remaining</div>
            </div>
            <div className="text-center p-3 bg-white/50 rounded-lg">
              <Target className="w-5 h-5 mx-auto mb-1 text-gray-600" />
              <div className="text-lg font-semibold">{takeover.rewardRate || 0}%</div>
              <div className="text-xs text-gray-600">Reward Rate</div>
            </div>
          </div>

          {showActions && (
            <div className="flex space-x-3">
              {!takeover.isFinalized && timeInfo.isStarted && !timeInfo.isEnded && (
                <Button 
                  onClick={handleParticipate}
                  disabled={isParticipating}
                  className="flex-1"
                  size="lg"
                >
                  {isParticipating ? "Participating..." : "Participate"}
                </Button>
              )}
              
              {takeover.canFinalize && (
                <Button 
                  onClick={handleFinalize}
                  variant="outline"
                  className="flex-1"
                  size="lg"
                >
                  Finalize
                </Button>
              )}
              
              <Button 
                onClick={() => onViewDetails?.(takeover.id)}
                variant="ghost"
                size="lg"
              >
                <ExternalLink className="w-4 h-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // Default detailed variant
  return (
    <Card 
      interactive={!!onViewDetails} 
      className={`group transition-all duration-200 ${className}`}
    >
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            {takeover.tokenImage && (
              <img 
                src={takeover.tokenImage} 
                alt={takeover.tokenSymbol}
                className="w-12 h-12 rounded-full"
              />
            )}
            <div>
              <CardTitle level={3} className="group-hover:text-primary transition-colors">
                {takeover.tokenName}
              </CardTitle>
              <CardDescription>
                ${takeover.tokenSymbol} • {takeover.participantCount || 0} participants
              </CardDescription>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Badge variant={status.variant}>
              <status.icon className="w-3 h-3 mr-1" />
              {status.label}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Progress section */}
        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">Progress</span>
            <span className="font-medium">
              {formatAmount(takeover.totalContributed)} / {formatAmount(takeover.minAmount)} SOL
            </span>
          </div>
          
          <Progress 
            value={progress.percentage} 
            variant={progress.isGoalReached ? "success" : "default"}
            animated
            showPercentage
          />
          
          {progress.isGoalReached && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center space-x-2 text-green-600 text-sm"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Goal reached!</span>
            </motion.div>
          )}
        </div>

        {/* Time and stats */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center space-x-2">
            <Clock className="w-4 h-4 text-gray-500" />
            <span className={`${timeInfo.urgency === 'critical' ? 'text-red-600' : 
              timeInfo.urgency === 'warning' ? 'text-yellow-600' : 'text-gray-600'}`}>
              {timeInfo.timeDisplay}
            </span>
          </div>
          
          <div className="flex items-center space-x-2">
            <Target className="w-4 h-4 text-gray-500" />
            <span className="text-gray-600">
              Min: {formatAmount(takeover.minAmount)} SOL
            </span>
          </div>
        </div>

        {/* Description (if expanded) */}
        <AnimatePresence>
          {isExpanded && takeover.description && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-3 border-t text-sm text-gray-600">
                {takeover.description}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>

      {showActions && (
        <CardFooter className="flex-wrap gap-2">
          {!takeover.isFinalized && timeInfo.isStarted && !timeInfo.isEnded && (
            <Button 
              onClick={handleParticipate}
              disabled={isParticipating}
              className="flex-1 min-w-[120px]"
            >
              {isParticipating ? "Participating..." : "Participate"}
            </Button>
          )}
          
          {takeover.canFinalize && (
            <Button 
              onClick={handleFinalize}
              variant="outline"
              className="flex-1 min-w-[120px]"
            >
              Finalize
            </Button>
          )}
          
          <div className="flex space-x-2">
            {takeover.description && (
              <Button 
                onClick={() => setIsExpanded(!isExpanded)}
                variant="ghost"
                size="sm"
              >
                {isExpanded ? 'Less' : 'More'}
              </Button>
            )}
            
            <Button 
              onClick={() => onViewDetails?.(takeover.id)}
              variant="ghost"
              size="sm"
            >
              <ExternalLink className="w-4 h-4" />
            </Button>
          </div>
        </CardFooter>
      )}
    </Card>
  );
};

export default TakeoverCard;