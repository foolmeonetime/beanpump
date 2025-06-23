export interface TakeoverData {
  token_amount_target?: string | number;
  calculated_min_amount?: string | number;
  min_amount?: string | number;
  total_contributed?: string | number;
  v1_total_supply?: string | number;
  target_participation_bp?: number;
  max_safe_total_contribution?: string | number;
  contributor_count?: number;
}

export interface GoalCalculationResult {
  goalTokens: number;
  contributedTokens: number;
  progressPercent: number;
  isGoalMet: boolean;
  remainingTokens: number;
  goalDisplay: string;
  contributedDisplay: string;
  safeSpaceRemaining: number;
}

/**
 * Get the correct goal amount in actual tokens (accounting for decimals)
 */
export function getCorrectGoalAmount(takeover: TakeoverData): number {
  // Get the raw goal value (in lamports/wei format)
  const tokenTarget = parseFloat(takeover.token_amount_target?.toString() || '0');
  const calculatedMin = parseFloat(takeover.calculated_min_amount?.toString() || '0');
  const minAmount = parseFloat(takeover.min_amount?.toString() || '0');
  
  // Priority order: token_amount_target > calculated_min_amount > min_amount
  const rawGoal = tokenTarget > 0 ? tokenTarget : 
                  calculatedMin > 0 ? calculatedMin : minAmount;
  
  // Convert from raw amount to actual tokens (assuming 6 decimals)
  const actualGoal = rawGoal / 1_000_000;
  
  if (process.env.NODE_ENV === 'development') {
    console.log('🎯 Goal Calculation:', {
      token_amount_target: tokenTarget,
      calculated_min_amount: calculatedMin,
      min_amount: minAmount,
      raw_goal: rawGoal,
      actual_goal_tokens: actualGoal,
      v1_total_supply: takeover.v1_total_supply,
      target_participation_bp: takeover.target_participation_bp
    });
  }
  
  return actualGoal;
}

/**
 * Get the correct progress percentage
 */
export function getCorrectProgress(takeover: TakeoverData): number {
  const goalAmount = getCorrectGoalAmount(takeover);
  const contributedRaw = parseFloat(takeover.total_contributed?.toString() || '0');
  const contributedTokens = contributedRaw / 1_000_000; // Convert to actual tokens
  
  if (goalAmount <= 0) return 0;
  
  const progressPercent = (contributedTokens / goalAmount) * 100;
  
  if (process.env.NODE_ENV === 'development') {
    console.log('📊 Progress Calculation:', {
      contributed_raw: contributedRaw,
      contributed_tokens: contributedTokens,
      goal_tokens: goalAmount,
      progress_percent: progressPercent
    });
  }
  
  return Math.min(100, Math.max(0, progressPercent));
}

/**
 * Check if the goal is actually met
 */
export function isGoalActuallyMet(takeover: TakeoverData): boolean {
  const goalAmount = getCorrectGoalAmount(takeover);
  const contributedTokens = parseFloat(takeover.total_contributed?.toString() || '0') / 1_000_000;
  
  const goalMet = contributedTokens >= goalAmount;
  
  if (process.env.NODE_ENV === 'development') {
    console.log('✅ Goal Status Check:', {
      contributed_tokens: contributedTokens,
      goal_tokens: goalAmount,
      is_goal_met: goalMet
    });
  }
  
  return goalMet;
}

/**
 * Get contributed tokens in actual token amount
 */
export function getContributedTokens(takeover: TakeoverData): number {
  const contributedRaw = parseFloat(takeover.total_contributed?.toString() || '0');
  return contributedRaw / 1_000_000;
}

/**
 * Get safe space remaining for contributions
 */
export function getSafeSpaceRemaining(takeover: TakeoverData): number {
  const maxSafeRaw = parseFloat(takeover.max_safe_total_contribution?.toString() || '0');
  const maxSafeTokens = maxSafeRaw / 1_000_000;
  const contributedTokens = getContributedTokens(takeover);
  
  return Math.max(0, maxSafeTokens - contributedTokens);
}

/**
 * Format token amounts for display
 */
export function formatGoalDisplay(goalAmount: number): string {
  if (goalAmount >= 1_000_000) {
    return `${(goalAmount / 1_000_000).toFixed(1)}B`;
  } else if (goalAmount >= 1_000) {
    return `${(goalAmount / 1_000).toFixed(1)}M`;
  } else if (goalAmount >= 1) {
    return `${goalAmount.toFixed(1)}K`;
  } else {
    return goalAmount.toFixed(6);
  }
}

/**
 * Format contributed amounts for display
 */
export function formatContributedDisplay(contributedRaw: number): string {
  const contributed = contributedRaw / 1_000_000;
  return formatGoalDisplay(contributed);
}

/**
 * Get comprehensive goal calculation results
 */
export function getGoalCalculationResults(takeover: TakeoverData): GoalCalculationResult {
  const goalTokens = getCorrectGoalAmount(takeover);
  const contributedTokens = getContributedTokens(takeover);
  const progressPercent = getCorrectProgress(takeover);
  const isGoalMet = isGoalActuallyMet(takeover);
  const remainingTokens = Math.max(0, goalTokens - contributedTokens);
  const goalDisplay = formatGoalDisplay(goalTokens);
  const contributedDisplay = formatGoalDisplay(contributedTokens);
  const safeSpaceRemaining = getSafeSpaceRemaining(takeover);
  
  return {
    goalTokens,
    contributedTokens,
    progressPercent,
    isGoalMet,
    remainingTokens,
    goalDisplay,
    contributedDisplay,
    safeSpaceRemaining
  };
}

/**
 * Validate takeover data and identify issues
 */
export function validateTakeoverData(takeover: TakeoverData): {
  isValid: boolean;
  issues: string[];
  warnings: string[];
} {
  const issues: string[] = [];
  const warnings: string[] = [];
  
  // Check for astronomical values
  const v1Supply = parseFloat(takeover.v1_total_supply?.toString() || '0');
  if (v1Supply > 100_000_000_000_000) {
    issues.push('V1 total supply seems too high: ' + v1Supply.toLocaleString());
  }
  
  // Check for missing target participation
  if (!takeover.target_participation_bp) {
    issues.push('Missing target_participation_bp');
  }
  
  // Check for zero goals
  const goalAmount = getCorrectGoalAmount(takeover);
  if (goalAmount <= 0) {
    issues.push('Goal amount is zero or negative');
  }
  
  // Check for unrealistic goals
  if (goalAmount > 1_000_000) {
    warnings.push('Goal over 1M tokens - verify this is correct');
  }
  
  // Check for missing V1 supply
  if (v1Supply <= 0) {
    warnings.push('V1 total supply is missing or zero');
  }
  
  return {
    isValid: issues.length === 0,
    issues,
    warnings
  };
}

/**
 * Debug function for analyzing takeover goals
 */
export function debugTakeoverGoals(takeover: TakeoverData, label: string = 'Takeover'): void {
  console.log(`🔍 ${label.toUpperCase()} GOAL ANALYSIS:`);
  console.log('================================');
  console.log('Raw Database Values:');
  console.log('  min_amount:', takeover.min_amount);
  console.log('  calculated_min_amount:', takeover.calculated_min_amount);
  console.log('  token_amount_target:', takeover.token_amount_target);
  console.log('  v1_total_supply:', takeover.v1_total_supply);
  console.log('  total_contributed:', takeover.total_contributed);
  console.log('  target_participation_bp:', takeover.target_participation_bp);
  console.log('');
  
  const results = getGoalCalculationResults(takeover);
  console.log('Calculated Results:');
  console.log('  Goal (tokens):', results.goalTokens.toLocaleString());
  console.log('  Contributed (tokens):', results.contributedTokens.toLocaleString());
  console.log('  Progress:', results.progressPercent.toFixed(2) + '%');
  console.log('  Goal Met:', results.isGoalMet);
  console.log('  Display Goal:', results.goalDisplay);
  console.log('  Display Contributed:', results.contributedDisplay);
  console.log('  Remaining:', results.remainingTokens.toLocaleString());
  console.log('  Safe Space:', results.safeSpaceRemaining.toLocaleString());
  console.log('');
  
  const validation = validateTakeoverData(takeover);
  if (validation.issues.length > 0) {
    console.log('🚨 Issues Found:');
    validation.issues.forEach(issue => console.log('  ❌', issue));
    console.log('');
  }
  
  if (validation.warnings.length > 0) {
    console.log('⚠️ Warnings:');
    validation.warnings.forEach(warning => console.log('  ⚠️', warning));
    console.log('');
  }
  
  if (validation.isValid) {
    console.log('✅ No critical issues found');
  }
}

/**
 * Calculate what the goal SHOULD be based on V1 supply and target participation
 */
export function calculateExpectedGoal(
  v1TotalSupply: string | number, 
  targetParticipationBp: number = 2500,
  decimals: number = 6
): number {
  const supply = parseFloat(v1TotalSupply.toString());
  const expectedRawGoal = (supply * targetParticipationBp) / 10000;
  return expectedRawGoal / Math.pow(10, decimals);
}

/**
 * Fix takeover data by calculating correct values
 */
export function generateCorrectedTakeoverData(takeover: TakeoverData): Partial<TakeoverData> {
  const v1Supply = parseFloat(takeover.v1_total_supply?.toString() || '0');
  const targetBp = takeover.target_participation_bp || 2500;
  
  if (v1Supply <= 0) {
    console.warn('Cannot generate corrected data without valid V1 supply');
    return {};
  }
  
  // Calculate correct goal (25% of supply by default)
  const correctedGoalRaw = (v1Supply * targetBp) / 10000;
  
  // Calculate max safe contribution (98% of supply)
  const maxSafeRaw = (v1Supply * 9800) / 10000;
  
  return {
    target_participation_bp: targetBp,
    calculated_min_amount: correctedGoalRaw.toString(),
    token_amount_target: correctedGoalRaw.toString(),
    max_safe_total_contribution: maxSafeRaw.toString()
  };
}

/**
 * Make debug function available globally in development
 */
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).debugTakeoverGoals = debugTakeoverGoals;
  (window as any).getGoalCalculationResults = getGoalCalculationResults;
  (window as any).validateTakeoverData = validateTakeoverData;
}