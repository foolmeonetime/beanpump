export interface SupplyMetrics {
  rawSupply: string;
  decimals: number;
  actualSupply: number;
  goalTokens: number;
  goalFormatted: string;
  targetParticipationPercent: number;
  rewardPoolTokens: number;
  liquidityPoolTokens: number;
  maxSafeContribution: number;
  maxSafeFormatted: string;
  rewardRate: number;
}

export interface GoalPreview {
  supply: number;
  goalTokens: number;
  goalFormatted: string;
  supplyFormatted: string;
  targetPercent: string;
}

export interface ValidationResult {
  valid: boolean;
  message?: string;
}

/**
 * Format token supply with appropriate units (K, M, B)
 */
export function formatTokenSupply(supply: string | number): string {
  const num = typeof supply === 'string' ? parseFloat(supply) : supply;
  if (isNaN(num)) return "0";
  
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1)}B`;
  } else if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  } else if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

/**
 * Calculate comprehensive supply metrics for takeover campaigns
 */
export function calculateSupplyMetrics(
  rawSupply: string,
  decimals: number,
  targetParticipationBp: number,
  rewardRateBp: number
): SupplyMetrics {
  // Convert raw supply to actual circulating supply
  const actualSupply = parseFloat(rawSupply) / Math.pow(10, decimals);
  
  // Calculate goal based on actual supply and target participation
  const targetParticipationDecimal = targetParticipationBp / 10000;
  const goalTokens = Math.floor(actualSupply * targetParticipationDecimal);
  
  // Calculate reward pool and safety limits
  const rewardPoolTokens = Math.floor(actualSupply * 0.80); // 80% for rewards
  const liquidityPoolTokens = Math.floor(actualSupply * 0.20); // 20% for LP
  const rewardRateDecimal = rewardRateBp / 10000;
  const maxSafeContribution = Math.floor((rewardPoolTokens * 0.98) / rewardRateDecimal); // 98% safety
  
  return {
    rawSupply,
    decimals,
    actualSupply,
    goalTokens,
    goalFormatted: formatTokenSupply(goalTokens),
    targetParticipationPercent: targetParticipationDecimal * 100,
    rewardPoolTokens,
    liquidityPoolTokens,
    maxSafeContribution,
    maxSafeFormatted: formatTokenSupply(maxSafeContribution),
    rewardRate: rewardRateBp / 100
  };
}

/**
 * Calculate goal preview for UI display
 */
export function calculateGoalPreview(
  supply: string,
  targetParticipationBp: string
): GoalPreview | null {
  const supplyNum = parseFloat(supply || "0");
  const targetPercent = parseInt(targetParticipationBp || "0") / 100;
  const goalTokens = supplyNum * targetPercent / 100;
  
  if (goalTokens > 0 && supplyNum > 0) {
    return {
      supply: supplyNum,
      goalTokens,
      goalFormatted: formatTokenSupply(goalTokens),
      supplyFormatted: formatTokenSupply(supplyNum),
      targetPercent: targetPercent.toFixed(1)
    };
  }
  return null;
}

/**
 * Validate token supply values
 */
export function validateTokenSupply(supply: string): ValidationResult {
  const supplyNum = parseFloat(supply);
  
  if (isNaN(supplyNum) || supplyNum <= 0) {
    return {
      valid: false,
      message: "Supply must be greater than 0"
    };
  }
  
  if (supplyNum < 1_000_000) {
    return {
      valid: false,
      message: "Supply must be at least 1M tokens for billion-scale operations"
    };
  }
  
  if (supplyNum > 1_000_000_000_000) {
    return {
      valid: false,
      message: "Supply seems too large - please verify (max 1T tokens)"
    };
  }
  
  return { valid: true };
}

/**
 * Validate reward rate in basis points
 */
export function validateRewardRate(rateBp: number): ValidationResult {
  if (rateBp >= 100 && rateBp <= 200) {
    return { valid: true };
  }
  return {
    valid: false,
    message: `Reward rate must be between 100bp and 200bp (1.0x to 2.0x)`
  };
}

/**
 * Validate participation rate in basis points
 */
export function validateParticipationRate(rateBp: number): ValidationResult {
  if (rateBp > 0 && rateBp <= 10000) {
    return { valid: true };
  }
  return {
    valid: false,
    message: 'Participation rate must be between 0.01% and 100%'
  };
}

/**
 * Validate SOL price
 */
export function validateSolPrice(solPrice: string): ValidationResult {
  const price = parseFloat(solPrice);
  
  if (isNaN(price) || price <= 0) {
    return {
      valid: false,
      message: "Price must be greater than 0"
    };
  }
  
  if (price < 0.000000001) {
    return {
      valid: false,
      message: "Price too small (minimum 0.000000001 SOL)"
    };
  }
  
  if (price > 1000) {
    return {
      valid: false,
      message: "Price too large (maximum 1000 SOL)"
    };
  }
  
  return { valid: true };
}

/**
 * Generate enhanced payload for takeover creation API
 */
export function generateEnhancedPayload(
  actualSupply: number,
  decimals: number,
  targetParticipationBp: number,
  rewardRateBp: number,
  additionalFields: Record<string, any> = {}
): Record<string, any> {
  const metrics = calculateSupplyMetrics(
    (actualSupply * Math.pow(10, decimals)).toString(),
    decimals,
    targetParticipationBp,
    rewardRateBp
  );
  
  // Convert to raw values for database storage
  const rawV1Supply = Math.floor(actualSupply * Math.pow(10, decimals));
  const rawTokenTarget = Math.floor(metrics.goalTokens * Math.pow(10, decimals));
  const rawRewardPool = Math.floor(metrics.rewardPoolTokens * Math.pow(10, decimals));
  const rawLiquidityPool = Math.floor(metrics.liquidityPoolTokens * Math.pow(10, decimals));
  const rawMaxSafe = Math.floor(metrics.maxSafeContribution * Math.pow(10, decimals));
  
  return {
    // Core supply fields
    v1_total_supply: rawV1Supply.toString(),
    token_amount_target: rawTokenTarget.toString(),
    v2_total_supply: rawV1Supply.toString(),
    
    // Calculated fields
    reward_pool_tokens: rawRewardPool.toString(),
    liquidity_pool_tokens: rawLiquidityPool.toString(),
    max_safe_total_contribution: rawMaxSafe.toString(),
    
    // Rate fields
    reward_rate_bp: rewardRateBp,
    target_participation_bp: targetParticipationBp,
    custom_reward_rate: rewardRateBp / 100,
    
    // Additional fields
    ...additionalFields
  };
}

/**
 * Parse raw mint data and extract actual supply
 */
export function parseTokenMintData(
  rawSupply: string,
  decimals: number
): { actualSupply: number; formatted: string } {
  const actualSupply = parseFloat(rawSupply) / Math.pow(10, decimals);
  return {
    actualSupply,
    formatted: formatTokenSupply(actualSupply)
  };
}

/**
 * Calculate contribution rewards
 */
export function calculateContributionRewards(
  contributionAmount: number,
  rewardRateBp: number
): {
  v1Tokens: number;
  v2Tokens: number;
  rewardMultiplier: number;
} {
  const rewardMultiplier = rewardRateBp / 10000;
  return {
    v1Tokens: contributionAmount,
    v2Tokens: contributionAmount * rewardMultiplier,
    rewardMultiplier
  };
}

/**
 * Detect token configuration from blockchain data
 */
export interface TokenDetectionResult {
  success: boolean;
  actualSupply?: number;
  decimals?: number;
  formatted?: string;
  error?: string;
}

export function processTokenDetection(
  mintAccountData: any
): TokenDetectionResult {
  try {
    if (!mintAccountData?.value?.data?.parsed?.info) {
      return {
        success: false,
        error: "Invalid mint account data"
      };
    }
    
    const info = mintAccountData.value.data.parsed.info;
    const rawSupply = info.supply;
    const decimals = info.decimals;
    
    if (!rawSupply || decimals === undefined) {
      return {
        success: false,
        error: "Missing supply or decimals information"
      };
    }
    
    const parsed = parseTokenMintData(rawSupply, decimals);
    
    return {
      success: true,
      actualSupply: parsed.actualSupply,
      decimals,
      formatted: parsed.formatted
    };
    
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

/**
 * Test calculations against expected values
 */
export interface TestCase {
  name: string;
  rawSupply: string;
  decimals: number;
  targetParticipationBp: number;
  rewardRateBp: number;
  expected: {
    actualSupply: number;
    goalTokens: number;
    goalFormatted: string;
  };
}

export function runCalculationTest(testCase: TestCase): {
  passed: boolean;
  result: SupplyMetrics;
  discrepancies: string[];
} {
  const result = calculateSupplyMetrics(
    testCase.rawSupply,
    testCase.decimals,
    testCase.targetParticipationBp,
    testCase.rewardRateBp
  );
  
  const discrepancies: string[] = [];
  
  if (result.actualSupply !== testCase.expected.actualSupply) {
    discrepancies.push(`Actual supply: got ${result.actualSupply}, expected ${testCase.expected.actualSupply}`);
  }
  
  if (result.goalTokens !== testCase.expected.goalTokens) {
    discrepancies.push(`Goal tokens: got ${result.goalTokens}, expected ${testCase.expected.goalTokens}`);
  }
  
  if (result.goalFormatted !== testCase.expected.goalFormatted) {
    discrepancies.push(`Goal format: got "${result.goalFormatted}", expected "${testCase.expected.goalFormatted}"`);
  }
  
  return {
    passed: discrepancies.length === 0,
    result,
    discrepancies
  };
}