// lib/utils/takeover-calculations.ts

export function safeParseFloat(value: any, fallback: number = 0): number {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const parsed = parseFloat(value);
  return isNaN(parsed) ? fallback : parsed;
}

export function safeParseInt(value: any, fallback: number = 0): number {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const parsed = parseInt(value);
  return isNaN(parsed) ? fallback : parsed;
}

export function safeDivide(numerator: number, denominator: number, fallback: number = 0): number {
  if (denominator === 0 || denominator === null || denominator === undefined || isNaN(denominator)) {
    return fallback;
  }
  const result = numerator / denominator;
  return isNaN(result) ? fallback : result;
}

export function safePercentage(current: number, total: number): number {
  return Math.min(100, Math.max(0, safeDivide(current, total, 0) * 100));
}

export function calculateMinAmountFromParticipation(v1Supply: number, targetParticipationBp: number): number {
  if (targetParticipationBp === 0) return 1_000_000; // Default 1M tokens
  return Math.floor(v1Supply * (targetParticipationBp / 10000));
}

export function processTakeoverCalculations(row: any) {
  // Safe numeric conversions
  const totalContributed = safeParseFloat(row.total_contributed, 0);
  const minAmount = safeParseFloat(row.min_amount, 0);
  const calculatedMinAmount = safeParseFloat(row.calculated_min_amount, 0);
  const maxSafeTotal = safeParseFloat(row.max_safe_total_contribution, 0);
  const endTime = safeParseInt(row.end_time, 0);
  
  // Determine effective minimum (prefer calculated for billion-scale, fallback to legacy)
  const effectiveMinAmount = calculatedMinAmount > 0 ? calculatedMinAmount : 
                            minAmount > 0 ? minAmount : 
                            calculateMinAmountFromParticipation(
                              safeParseFloat(row.v1_total_supply, 1_000_000_000_000_000),
                              safeParseInt(row.target_participation_bp, 1000)
                            );
  
  // Safe calculations
  const progressPercentage = safePercentage(totalContributed, effectiveMinAmount);
  const safetyUtilization = safePercentage(totalContributed, maxSafeTotal);
  
  // Goal and time status
  const isGoalMet = totalContributed >= effectiveMinAmount;
  const currentTime = Math.floor(Date.now() / 1000);
  const isExpired = endTime > 0 ? currentTime > endTime : false;
  const readyToFinalize = isExpired;
  
  // Expected outcome
  let expectedOutcome: 'success' | 'failed' | 'active' = 'active';
  if (isExpired) {
    expectedOutcome = isGoalMet ? 'success' : 'failed';
  }
  
  // Safe billion-scale calculations
  const v1TotalSupply = safeParseFloat(row.v1_total_supply, 0);
  const v1SupplyBillions = safeDivide(v1TotalSupply, 1_000_000_000_000_000, 0);
  
  // Safe metadata
  const customRewardRate = safeParseFloat(row.custom_reward_rate, 1.0);
  const rewardRateBp = safeParseInt(row.reward_rate_bp, 100);
  const targetParticipationBp = safeParseInt(row.target_participation_bp, 1000);
  const contributorCount = safeParseInt(row.contributor_count, 0);

  return {
    // Original row data
    id: row.id,
    address: row.address,
    authority: row.authority,
    v1_token_mint: row.v1_token_mint,
    vault: row.vault,
    token_name: row.token_name || '',
    image_url: row.image_url || '',
    signature: row.signature || '',
    created_at: row.created_at,
    is_finalized: row.is_finalized || false,
    is_successful: row.is_successful || false,
    
    // Safely converted numeric fields
    totalContributed: totalContributed.toString(),
    minAmount: minAmount.toString(),
    calculatedMinAmount: calculatedMinAmount.toString(),
    maxSafeTotalContribution: maxSafeTotal.toString(),
    startTime: safeParseInt(row.start_time, 0).toString(),
    endTime: endTime.toString(),
    
    // Safe calculated fields
    progressPercentage: Math.round(progressPercentage * 100) / 100,
    safetyUtilization: Math.round(safetyUtilization * 100) / 100,
    
    // Status fields
    isGoalMet,
    readyToFinalize,
    expectedOutcome,
    isExpired,
    
    // Billion-scale metadata
    v1SupplyBillions: Math.round(v1SupplyBillions * 10) / 10,
    
    // Rate and participation data
    customRewardRate,
    rewardRateBp,
    targetParticipationBp,
    contributorCount,
    
    // Additional derived fields
    tokenName: row.token_name || '',
    imageUrl: row.image_url || '',
    v1TokenMint: row.v1_token_mint,
    
    // Legacy compatibility
    min_amount: minAmount.toString(),
    total_contributed: totalContributed.toString(),
    start_time: safeParseInt(row.start_time, 0).toString(),
    end_time: endTime.toString(),
    custom_reward_rate: customRewardRate,
  };
}