"use client";

import { useState, useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { LoadingSpinner } from '@/components/loading-spinner';
import { useLiquidityMode } from '@/lib/liquidity-mode';
import type { ContributionPreview } from '@/lib/liquidity-mode';

interface LiquidityContributionFormProps {
  takeoverAddress: PublicKey;
  tokenName: string;
  userTokenBalance?: number;
}

export function LiquidityContributionForm({ 
  takeoverAddress, 
  tokenName,
  userTokenBalance = 0 
}: LiquidityContributionFormProps) {
  const [amount, setAmount] = useState('');
  const [preview, setPreview] = useState<ContributionPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [contributing, setContributing] = useState(false);
  
  const { 
    status, 
    loading,
    error,
    previewContribution, 
    contribute, 
    isOverflowRisk,
    canContribute,
    participationLevel,
    isConservativeMode,
    safetyMargin
  } = useLiquidityMode(takeoverAddress);

  // Auto-preview when amount changes
  useEffect(() => {
    const debounceTimer = setTimeout(async () => {
      const numAmount = parseFloat(amount);
      if (numAmount > 0 && status) {
        try {
          setPreviewLoading(true);
          const newPreview = await previewContribution(numAmount * 1_000_000); // Convert to lamports
          setPreview(newPreview);
        } catch (err: any) {
          console.error('Preview failed:', err);
          setPreview(null);
        } finally {
          setPreviewLoading(false);
        }
      } else {
        setPreview(null);
      }
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [amount, status, previewContribution]);

  const handleContribute = async () => {
    if (!preview || preview.amount <= 0) return;
    
    try {
      setContributing(true);
      await contribute(preview.amount);
      setAmount('');
      setPreview(null);
    } catch (err: any) {
      console.error('Contribution failed:', err.message);
    } finally {
      setContributing(false);
    }
  };

  const formatTokenAmount = (amount: number, suffix = '') => {
    if (amount >= 1_000_000_000) {
      return `${(amount / 1_000_000_000).toFixed(1)}B${suffix}`;
    } else if (amount >= 1_000_000) {
      return `${(amount / 1_000_000).toFixed(1)}M${suffix}`;
    } else if (amount >= 1_000) {
      return `${(amount / 1_000).toFixed(1)}K${suffix}`;
    } else {
      return `${amount.toFixed(2)}${suffix}`;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <LoadingSpinner />
          <p className="text-sm text-gray-500 mt-2">Loading billion-scale liquidity status...</p>
        </CardContent>
      </Card>
    );
  }

  if (error || !status) {
    return (
      <Card className="border-red-200">
        <CardContent className="pt-6 text-center">
          <p className="text-red-600 mb-4">
            {error || 'Failed to load liquidity status'}
          </p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!canContribute) {
    return (
      <Card className="border-gray-200 bg-gray-50 dark:bg-gray-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🚫 Contributions Paused
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-600 dark:text-gray-400">
            {status.maxSafeContribution <= 0 
              ? 'Reward pool is at capacity with conservative safety limits'
              : 'This takeover is not accepting contributions at this time'
            }
          </p>
          {status.isLiquidityMode && (
            <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg">
              <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-1">Liquidity Mode Active</h4>
              <p className="text-sm text-blue-600 dark:text-blue-300">
                This billion-scale takeover uses conservative safety limits and Jupiter integration for optimal liquidity.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>🌊 Contribute to Billion-Scale Takeover</span>
          {isConservativeMode && (
            <span className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full">
              🛡️ Conservative Mode
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Contribute to {tokenName} with billion-scale safety and liquidity features
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Safety Overview */}
        {isConservativeMode && (
          <div className="p-4 bg-green-50 dark:bg-green-900 border border-green-200 dark:border-green-700 rounded-lg">
            <h4 className="font-medium text-green-800 dark:text-green-200 mb-2">🛡️ Conservative Safety Features</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-green-600 dark:text-green-300">Max Reward Rate:</span>
                <div className="font-medium">2.0x (Conservative)</div>
              </div>
              <div>
                <span className="text-green-600 dark:text-green-300">Safety Margin:</span>
                <div className="font-medium">2% Built-in Cushion</div>
              </div>
            </div>
            <p className="text-xs text-green-600 dark:text-green-300 mt-2">
              💡 This ensures no overflow risk and sustainable token economics
            </p>
          </div>
        )}

        {/* Overflow Risk Warning */}
        {isOverflowRisk && (
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900 border border-yellow-200 dark:border-yellow-700 rounded-lg">
            <h4 className="font-medium text-yellow-800 dark:text-yellow-200 mb-2">⚠️ High Utilization Warning</h4>
            <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-2">
              Reward pool is {(status.rewardPoolUtilization * 100).toFixed(1)}% utilized. 
              Large contributions may be scaled down for safety.
            </p>
          </div>
        )}

        {/* Safety Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Pool Safety Utilization</span>
            <span>{(status.rewardPoolUtilization * 100).toFixed(1)}%</span>
          </div>
          <Progress 
            value={status.rewardPoolUtilization * 100} 
            className={`h-2 ${status.rewardPoolUtilization > 0.9 ? 'bg-yellow-200 dark:bg-yellow-800' : ''}`}
          />
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Conservative safety limit applied</span>
            <span>Max: 98% (2% safety cushion)</span>
          </div>
        </div>

        {/* Amount Input */}
        <div className="space-y-2">
          <Label htmlFor="amount">
            Contribution Amount ({tokenName} tokens)
          </Label>
          <Input
            id="amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount..."
            disabled={contributing}
            max={Math.min(
              userTokenBalance, 
              status.maxSafeContribution / 1_000_000,
              100_000_000 // 100M max per transaction
            )}
            step="0.000001"
          />
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>
              Available: {formatTokenAmount(userTokenBalance)} {tokenName}
            </span>
            <span>
              Max safe: {formatTokenAmount(status.maxSafeContribution / 1_000_000)}
            </span>
          </div>
        </div>

        {/* Contribution Preview */}
        {(preview || previewLoading) && (
          <div className="space-y-3 p-4 bg-blue-50 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 rounded-lg">
            <h4 className="font-medium text-blue-800 dark:text-blue-200 flex items-center gap-2">
              📊 Conservative Contribution Preview
              {previewLoading && <LoadingSpinner />}
            </h4>
            
            {preview && (
              <>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-blue-600 dark:text-blue-300">You'll Receive:</span>
                    <div className="font-medium">
                      {formatTokenAmount(preview.expectedV2Allocation / 1_000_000)} V2
                    </div>
                  </div>
                  <div>
                    <span className="text-blue-600 dark:text-blue-300">Effective Rate:</span>
                    <div className="font-medium">
                      {(preview.scalingFactor * (status.rewardRateBp / 100)).toFixed(2)}x
                    </div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-blue-600 dark:text-blue-300">Participation After:</span>
                    <div className="font-medium">
                      {(preview.participationRateAfter * 100).toFixed(2)}%
                    </div>
                  </div>
                  <div>
                    <span className="text-blue-600 dark:text-blue-300">Pool Utilization:</span>
                    <div className="font-medium">
                      {(preview.rewardPoolUtilizationAfter * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
                
                {preview.isScaled && preview.warningMessage && (
                  <div className="p-2 bg-yellow-100 dark:bg-yellow-800 border border-yellow-300 dark:border-yellow-600 rounded text-xs text-yellow-700 dark:text-yellow-300">
                    ⚠️ {preview.warningMessage}
                  </div>
                )}
                
                {!preview.isScaled && (
                  <div className="p-2 bg-green-100 dark:bg-green-800 border border-green-300 dark:border-green-600 rounded text-xs text-green-700 dark:text-green-300">
                    ✅ Full allocation - no scaling required
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Jupiter Integration Info */}
        {status.isLiquidityMode && (
          <div className="p-3 bg-purple-50 dark:bg-purple-900 border border-purple-200 dark:border-purple-700 rounded-lg">
            <h4 className="font-medium text-purple-800 dark:text-purple-200 mb-1">🔄 Jupiter Integration Ready</h4>
            <p className="text-sm text-purple-600 dark:text-purple-300">
              This takeover includes automatic V1→SOL swapping and liquidity pool creation for optimal token economics.
            </p>
            {status.jupiterSwapCompleted && (
              <p className="text-xs text-purple-500 dark:text-purple-400 mt-1">
                ✅ Jupiter swap completed • LP creation pending
              </p>
            )}
          </div>
        )}

        {/* Contribute Button */}
        <Button
          onClick={handleContribute}
          disabled={
            !preview || 
            preview.amount <= 0 || 
            preview.wouldCauseOverflow || 
            contributing ||
            parseFloat(amount) > userTokenBalance
          }
          className="w-full"
        >
          {contributing ? (
            <div className="flex items-center">
              <LoadingSpinner />
              <span className="ml-2">Contributing with Safety Checks...</span>
            </div>
          ) : preview?.wouldCauseOverflow ? (
            'Would Exceed Safe Limits'
          ) : parseFloat(amount) > userTokenBalance ? (
            'Insufficient Balance'
          ) : (
            `🛡️ Contribute ${amount || '0'} ${tokenName} (Conservative)`
          )}
        </Button>

        {/* Additional Info */}
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs text-gray-600 dark:text-gray-400">
          <div className="flex justify-between mb-1">
            <span>V1 Total Supply:</span>
            <span>{formatTokenAmount(status.v1TotalSupply / 1_000_000)} {tokenName}</span>
          </div>
          <div className="flex justify-between mb-1">
            <span>Reward Pool:</span>
            <span>{formatTokenAmount(status.rewardPoolTokens / 1_000_000)} V2 (80%)</span>
          </div>
          <div className="flex justify-between">
            <span>Liquidity Pool:</span>
            <span>{formatTokenAmount(status.liquidityPoolTokens / 1_000_000)} V2 (20%)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}