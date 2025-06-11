"use client";

import React, { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { LoadingSpinner } from '@/components/loading-spinner';

interface SafeBillionScaleStatusProps {
  takeoverAddress: string;
  tokenName: string;
  isFinalized?: boolean;
  totalContributed: string;
  minAmount: string;
  rewardRate?: number;
  showDetailed?: boolean;
}

// Simple Badge component for compatibility
const StatusBadge = ({ children, type = "default" }: { 
  children: React.ReactNode; 
  type?: "default" | "success" | "warning" | "info";
}) => {
  const getStyles = () => {
    switch (type) {
      case "success": return "bg-green-100 text-green-800";
      case "warning": return "bg-yellow-100 text-yellow-800";
      case "info": return "bg-blue-100 text-blue-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStyles()}`}>
      {children}
    </span>
  );
};

export function SafeBillionScaleStatus({ 
  takeoverAddress,
  tokenName, 
  isFinalized = false,
  totalContributed,
  minAmount,
  rewardRate = 1.5,
  showDetailed = false 
}: SafeBillionScaleStatusProps) {
  const [loading, setLoading] = useState(false);
  const [billionScaleData, setBillionScaleData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Helper functions
  const formatTokenAmount = (amount: string | number, suffix = '') => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    const scaled = num / 1_000_000; // Assuming 6 decimals
    
    if (scaled >= 1_000_000_000) {
      return `${(scaled / 1_000_000_000).toFixed(1)}B${suffix}`;
    } else if (scaled >= 1_000_000) {
      return `${(scaled / 1_000_000).toFixed(1)}M${suffix}`;
    } else if (scaled >= 1_000) {
      return `${(scaled / 1_000).toFixed(1)}K${suffix}`;
    } else {
      return `${scaled.toFixed(2)}${suffix}`;
    }
  };

  const calculateParticipation = () => {
    const contributed = parseFloat(totalContributed);
    const goal = parseFloat(minAmount);
    if (goal === 0) return 0;
    return Math.min((contributed / goal) * 100, 100);
  };

  const isBillionScale = () => {
    const contributed = parseFloat(totalContributed);
    const goal = parseFloat(minAmount);
    return Math.max(contributed, goal) >= 1_000_000_000 * 1_000_000; // 1B tokens with 6 decimals
  };

  const isConservativeMode = () => {
    return rewardRate <= 2.0; // Conservative if reward rate is 2.0x or lower
  };

  const getRiskLevel = () => {
    const participation = calculateParticipation();
    if (participation < 50) return 'Low';
    if (participation < 80) return 'Medium';
    if (participation < 95) return 'High';
    return 'Critical';
  };

  const getRiskColor = (level: string) => {
    switch (level) {
      case 'Low': return 'text-green-600';
      case 'Medium': return 'text-yellow-600';
      case 'High': return 'text-orange-600';
      case 'Critical': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  // Check if this is likely a billion-scale takeover
  const billionScale = isBillionScale();
  const conservative = isConservativeMode();
  const participation = calculateParticipation();
  const riskLevel = getRiskLevel();

  if (!billionScale && !showDetailed) {
    // Don't show for smaller takeovers unless explicitly requested
    return null;
  }

  if (!showDetailed) {
    // Compact view for dashboard cards
    return (
      <div className="space-y-2 mt-2">
        <div className="flex flex-wrap gap-1">
          {billionScale && (
            <StatusBadge type="info">🚀 Billion+</StatusBadge>
          )}
          {conservative && (
            <StatusBadge type="success">🛡️ Conservative</StatusBadge>
          )}
          <StatusBadge type={riskLevel === 'Low' ? 'success' : riskLevel === 'Critical' ? 'warning' : 'default'}>
            {riskLevel} Risk
          </StatusBadge>
        </div>
        
        {billionScale && (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="text-center">
              <div className="text-gray-500">Scale</div>
              <div className="font-medium">{formatTokenAmount(totalContributed)}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-500">Rate</div>
              <div className="font-medium">{rewardRate.toFixed(1)}x</div>
            </div>
            <div className="text-center">
              <div className="text-gray-500">Progress</div>
              <div className="font-medium">{participation.toFixed(1)}%</div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Detailed view
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>🚀 Billion-Scale Analysis</span>
          <div className="flex gap-2">
            {billionScale && (
              <StatusBadge type="info">Billion+ Scale</StatusBadge>
            )}
            {conservative && (
              <StatusBadge type="success">Conservative</StatusBadge>
            )}
          </div>
        </CardTitle>
        <CardDescription>
          Advanced analysis for {tokenName} takeover
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Scale Information */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <h4 className="font-medium text-blue-800 mb-2">Token Scale</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-blue-600">Contributed:</span>
                <span className="font-medium">{formatTokenAmount(totalContributed)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-600">Goal:</span>
                <span className="font-medium">{formatTokenAmount(minAmount)}</span>
              </div>
              <div className="text-xs text-blue-500 mt-2">
                {billionScale ? 'Billion-scale takeover' : 'Standard scale'}
              </div>
            </div>
          </div>

          <div className="p-4 bg-green-50 rounded-lg">
            <h4 className="font-medium text-green-800 mb-2">Safety Features</h4>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-green-600">Reward Rate:</span>
                <span className="font-medium">{rewardRate.toFixed(1)}x</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-600">Mode:</span>
                <span className="font-medium">{conservative ? 'Conservative' : 'Aggressive'}</span>
              </div>
              <div className="text-xs text-green-500 mt-2">
                {conservative ? '🛡️ Built-in safety limits' : '⚡ High reward potential'}
              </div>
            </div>
          </div>
        </div>

        {/* Progress Analysis */}
        <div className="space-y-3">
          <h4 className="font-medium flex items-center justify-between">
            <span>Progress Analysis</span>
            <span className={`text-sm ${getRiskColor(riskLevel)}`}>
              {riskLevel} Risk
            </span>
          </h4>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Completion Progress</span>
              <span>{participation.toFixed(1)}%</span>
            </div>
            <Progress value={participation} className="h-2" />
            <div className="flex justify-between text-xs text-gray-500">
              <span>Target achievement rate</span>
              <span>{formatTokenAmount(totalContributed)} / {formatTokenAmount(minAmount)}</span>
            </div>
          </div>
        </div>

        {/* Conservative Features (if applicable) */}
        {conservative && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <h4 className="font-medium text-green-800 mb-3">🛡️ Conservative Safety Features</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-green-600">Max Reward Rate:</span>
                <div className="font-medium">{rewardRate.toFixed(1)}x (≤ 2.0x)</div>
              </div>
              <div>
                <span className="text-green-600">Overflow Protection:</span>
                <div className="font-medium">Built-in Safety</div>
              </div>
            </div>
            <p className="text-xs text-green-600 mt-3">
              💡 Conservative mode ensures sustainable token economics and prevents overflow
            </p>
          </div>
        )}

        {/* Billion Scale Features (if applicable) */}
        {billionScale && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-medium text-blue-800 mb-3">🚀 Billion-Scale Features</h4>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-blue-600">Scale Type:</span>
                <span className="font-medium ml-2">Billion+ Token Economy</span>
              </div>
              <div>
                <span className="text-blue-600">Architecture:</span>
                <span className="font-medium ml-2">Advanced Liquidity Integration</span>
              </div>
              <div>
                <span className="text-blue-600">Safety Systems:</span>
                <span className="font-medium ml-2">Multi-layer Overflow Protection</span>
              </div>
            </div>
            <p className="text-xs text-blue-600 mt-3">
              🌊 Includes Jupiter integration and automated liquidity pool creation
            </p>
          </div>
        )}

        {/* Risk Assessment */}
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-600">Risk Assessment:</span>
            <span className={`font-medium ${getRiskColor(riskLevel)}`}>
              {riskLevel} Risk Level
            </span>
          </div>
          <div className="text-xs text-gray-500">
            {riskLevel === 'Low' && 'Low utilization, safe to contribute'}
            {riskLevel === 'Medium' && 'Moderate utilization, contributions welcome'}
            {riskLevel === 'High' && 'High utilization, large contributions may be scaled'}
            {riskLevel === 'Critical' && 'Near capacity, contributions limited'}
          </div>
        </div>

        {/* Integration Status */}
        <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
          <h4 className="font-medium text-purple-800 mb-2">🔗 Integration Status</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-purple-600">Takeover Address:</span>
              <span className="font-mono text-xs">{takeoverAddress.slice(0, 8)}...{takeoverAddress.slice(-4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-purple-600">Status:</span>
              <span className="font-medium">{isFinalized ? '✅ Finalized' : '🔄 Active'}</span>
            </div>
          </div>
          <p className="text-xs text-purple-600 mt-2">
            Full billion-scale features available when using advanced liquidity mode
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// Simple indicator for existing takeover cards
export function BillionScaleIndicator({ 
  totalContributed,
  minAmount,
  rewardRate = 1.5,
  className = ""
}: { 
  totalContributed: string;
  minAmount: string;
  rewardRate?: number;
  className?: string;
}) {
  const isBillionScale = () => {
    const contributed = parseFloat(totalContributed);
    const goal = parseFloat(minAmount);
    return Math.max(contributed, goal) >= 1_000_000_000 * 1_000_000; // 1B tokens with 6 decimals
  };

  const isConservative = () => rewardRate <= 2.0;

  if (!isBillionScale() && !isConservative()) return null;

  return (
    <div className={`flex gap-1 ${className}`}>
      {isBillionScale() && (
        <StatusBadge type="info">🚀 Billion+</StatusBadge>
      )}
      {isConservative() && (
        <StatusBadge type="success">🛡️ Conservative</StatusBadge>
      )}
    </div>
  );
}