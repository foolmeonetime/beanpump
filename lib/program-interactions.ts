import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { 
  getProgram, 
  findTakeoverPDA, 
  findContributorPDA, 
  BillionScaleTakeover, 
  ContributorData 
} from "./program";

export interface InitializeBillionScaleParams {
  authority: PublicKey;
  treasury: PublicKey;
  v1TokenMint: PublicKey;
  vault: PublicKey;
  duration: number; // in days
  rewardRateBp: number; // basis points (100 = 1.0x, 200 = 2.0x)
  targetParticipationBp: number; // basis points (1000 = 10%)
  v1MarketPriceLamports: number; // price in lamports
  tokenName?: string;
  imageUrl?: string;
  // ✅ ADDED: Enhanced validation parameters
  v1TokenSupply?: BN; // Total supply for validation
  minContributionLamports?: BN; // Minimum contribution
  maxContributionLamports?: BN; // Maximum contribution per user
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  recommendations: string[];
}

interface EconomicValidationParams {
  totalSupply: BN;
  targetParticipation: number;
  rewardRate: number;
  marketPrice: BN;
  duration: number;
}

export class BillionScaleProgramInteractions {
  private program: Program;
  private connection: Connection;

  // ✅ ENHANCED: Validation constants for safety
  private static readonly VALIDATION_CONSTANTS = {
    // Core limits
    MIN_REWARD_RATE_BP: 100,    // 1.0x minimum
    MAX_REWARD_RATE_BP: 200,    // 2.0x maximum for safety
    MIN_PARTICIPATION_BP: 1,     // 0.01% minimum
    MAX_PARTICIPATION_BP: 10000, // 100% maximum
    MIN_DURATION_DAYS: 1,
    MAX_DURATION_DAYS: 30,
    
    // Economic limits
    MIN_TOKEN_SUPPLY: new BN(1_000_000),      // 1M tokens minimum
    MAX_TOKEN_SUPPLY: new BN('1000000000000000'), // 1T tokens maximum
    MIN_MARKET_PRICE: new BN(1),              // 1 lamport minimum
    MAX_MARKET_PRICE: new BN(1_000_000_000),  // 1 SOL maximum
    
    // Safety factors
    OVERFLOW_SAFETY_FACTOR: 0.98,  // 98% utilization max
    MIN_ECONOMIC_VIABILITY: 0.001, // Min 0.1% of supply
    MAX_ECONOMIC_VIABILITY: 0.5,   // Max 50% of supply
    
    // Precision limits
    MAX_SAFE_INTEGER: new BN(Number.MAX_SAFE_INTEGER),
    LAMPORTS_PER_SOL: new BN(1_000_000_000),
    
    // Duration constraints
    MIN_DURATION_SECONDS: 86400,     // 1 day
    MAX_DURATION_SECONDS: 2592000,   // 30 days
  } as const;

  constructor(connection: Connection, wallet: any) {
    this.program = getProgram(connection, wallet);
    this.connection = connection;
  }

  // ✅ COMPLETELY REWRITTEN: Comprehensive validation with edge case handling
  validateBillionScaleParams(params: InitializeBillionScaleParams): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    try {
      // ✅ ENHANCED: Basic parameter validation with null/undefined checks
      this.validateBasicParameters(params, errors);
      
      // ✅ ENHANCED: Numerical range validation with overflow protection
      this.validateNumericalRanges(params, errors, warnings);
      
      // ✅ ENHANCED: Economic feasibility validation
      if (params.v1TokenSupply) {
        this.validateEconomicFeasibility({
          totalSupply: params.v1TokenSupply,
          targetParticipation: params.targetParticipationBp / 10000,
          rewardRate: params.rewardRateBp / 10000,
          marketPrice: new BN(params.v1MarketPriceLamports),
          duration: params.duration
        }, errors, warnings, recommendations);
      }
      
      // ✅ ENHANCED: Cross-parameter consistency validation
      this.validateParameterConsistency(params, errors, warnings);
      
      // ✅ ENHANCED: Precision and overflow validation
      this.validatePrecisionAndOverflow(params, errors, warnings);
      
      // ✅ ENHANCED: Smart contract constraints validation
      this.validateSmartContractConstraints(params, errors, warnings);

    } catch (validationError: any) {
      errors.push(`Validation system error: ${validationError.message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      recommendations
    };
  }

  // ✅ NEW: Basic parameter validation
  private validateBasicParameters(params: InitializeBillionScaleParams, errors: string[]): void {
    // Check for required parameters
    if (!params.authority) errors.push("Authority is required");
    if (!params.treasury) errors.push("Treasury is required");
    if (!params.v1TokenMint) errors.push("V1 token mint is required");
    if (!params.vault) errors.push("Vault is required");
    
    // Check for valid PublicKey format
    try {
      if (params.authority) new PublicKey(params.authority);
    } catch {
      errors.push("Invalid authority address format");
    }
    
    try {
      if (params.treasury) new PublicKey(params.treasury);
    } catch {
      errors.push("Invalid treasury address format");
    }
    
    try {
      if (params.v1TokenMint) new PublicKey(params.v1TokenMint);
    } catch {
      errors.push("Invalid V1 token mint address format");
    }
    
    // Check for undefined/null numerical values
    if (params.duration == null) errors.push("Duration is required");
    if (params.rewardRateBp == null) errors.push("Reward rate is required");
    if (params.targetParticipationBp == null) errors.push("Target participation is required");
    if (params.v1MarketPriceLamports == null) errors.push("Market price is required");
  }

  // ✅ NEW: Numerical range validation with edge cases
  private validateNumericalRanges(params: InitializeBillionScaleParams, errors: string[], warnings: string[]): void {
    const { VALIDATION_CONSTANTS } = BillionScaleProgramInteractions;
    
    // Reward rate validation with floating point handling
    if (!Number.isInteger(params.rewardRateBp)) {
      errors.push("Reward rate must be an integer (no decimal places)");
    }
    
    if (params.rewardRateBp < VALIDATION_CONSTANTS.MIN_REWARD_RATE_BP || 
        params.rewardRateBp > VALIDATION_CONSTANTS.MAX_REWARD_RATE_BP) {
      errors.push(`Reward rate must be between ${VALIDATION_CONSTANTS.MIN_REWARD_RATE_BP}bp (1.0x) and ${VALIDATION_CONSTANTS.MAX_REWARD_RATE_BP}bp (2.0x)`);
    }
    
    if (params.rewardRateBp > 180) {
      warnings.push("Reward rates above 1.8x may discourage conservative participation");
    }

    // Participation rate validation with precision handling
    if (!Number.isInteger(params.targetParticipationBp)) {
      errors.push("Target participation must be an integer (no decimal places)");
    }
    
    if (params.targetParticipationBp <= VALIDATION_CONSTANTS.MIN_PARTICIPATION_BP || 
        params.targetParticipationBp > VALIDATION_CONSTANTS.MAX_PARTICIPATION_BP) {
      errors.push(`Target participation must be between ${VALIDATION_CONSTANTS.MIN_PARTICIPATION_BP}bp (0.01%) and ${VALIDATION_CONSTANTS.MAX_PARTICIPATION_BP}bp (100%)`);
    }
    
    if (params.targetParticipationBp > 5000) {
      warnings.push("Target participation above 50% may be difficult to achieve");
    }

    // Duration validation with boundary checks
    if (!Number.isInteger(params.duration)) {
      errors.push("Duration must be a whole number of days");
    }
    
    if (params.duration < VALIDATION_CONSTANTS.MIN_DURATION_DAYS || 
        params.duration > VALIDATION_CONSTANTS.MAX_DURATION_DAYS) {
      errors.push(`Duration must be between ${VALIDATION_CONSTANTS.MIN_DURATION_DAYS} and ${VALIDATION_CONSTANTS.MAX_DURATION_DAYS} days`);
    }

    // Market price validation with overflow protection
    if (!Number.isInteger(params.v1MarketPriceLamports)) {
      errors.push("Market price must be an integer number of lamports");
    }
    
    if (params.v1MarketPriceLamports <= 0) {
      errors.push("Market price must be greater than 0 lamports");
    }
    
    const priceBN = new BN(params.v1MarketPriceLamports);
    if (priceBN.lt(VALIDATION_CONSTANTS.MIN_MARKET_PRICE) || 
        priceBN.gt(VALIDATION_CONSTANTS.MAX_MARKET_PRICE)) {
      errors.push(`Market price must be between ${VALIDATION_CONSTANTS.MIN_MARKET_PRICE} and ${VALIDATION_CONSTANTS.MAX_MARKET_PRICE} lamports`);
    }
  }

  // ✅ NEW: Economic feasibility validation
  private validateEconomicFeasibility(
    params: EconomicValidationParams, 
    errors: string[], 
    warnings: string[], 
    recommendations: string[]
  ): void {
    const { VALIDATION_CONSTANTS } = BillionScaleProgramInteractions;
    
    // Token supply validation
    if (params.totalSupply.lt(VALIDATION_CONSTANTS.MIN_TOKEN_SUPPLY)) {
      errors.push(`Token supply too small: minimum ${VALIDATION_CONSTANTS.MIN_TOKEN_SUPPLY.toString()} tokens required`);
    }
    
    if (params.totalSupply.gt(VALIDATION_CONSTANTS.MAX_TOKEN_SUPPLY)) {
      errors.push(`Token supply too large: maximum ${VALIDATION_CONSTANTS.MAX_TOKEN_SUPPLY.toString()} tokens allowed`);
    }

    // Calculate target token amount
    const targetTokens = params.totalSupply.muln(params.targetParticipation);
    
    // Economic viability checks
    const supplyRatio = targetTokens.toNumber() / params.totalSupply.toNumber();
    if (supplyRatio < VALIDATION_CONSTANTS.MIN_ECONOMIC_VIABILITY) {
      warnings.push("Target participation may be too small to generate meaningful impact");
    }
    
    if (supplyRatio > VALIDATION_CONSTANTS.MAX_ECONOMIC_VIABILITY) {
      warnings.push("Target participation may be too large and difficult to achieve");
    }

    // Reward pool calculations with overflow protection
    try {
      const rewardPool = params.totalSupply.muln(0.15); // 15% reward pool
      const maxSafeContribution = rewardPool.muln(VALIDATION_CONSTANTS.OVERFLOW_SAFETY_FACTOR).divn(params.rewardRate);
      
      if (targetTokens.gt(maxSafeContribution)) {
        errors.push("Target participation exceeds safe reward pool capacity - risk of overflow");
        recommendations.push(`Reduce target participation to max ${maxSafeContribution.toString()} tokens or lower reward rate`);
      }
    } catch (calculationError) {
      errors.push("Overflow detected in reward pool calculations - parameters too large");
    }

    // Duration vs. economic parameters
    if (params.duration < 3 && supplyRatio > 0.1) {
      warnings.push("Short duration with high participation target may be too aggressive");
    }
    
    if (params.duration > 14 && supplyRatio < 0.05) {
      warnings.push("Long duration with low participation target may lose momentum");
    }

    // Market price feasibility
    const totalValueLamports = targetTokens.mul(params.marketPrice);
    const totalValueSOL = totalValueLamports.div(VALIDATION_CONSTANTS.LAMPORTS_PER_SOL);
    
    if (totalValueSOL.gt(new BN(1000))) {
      warnings.push(`High total value (${totalValueSOL.toString()} SOL) may be difficult to achieve`);
    }
    
    if (totalValueSOL.lt(new BN(1))) {
      warnings.push(`Low total value (${totalValueSOL.toString()} SOL) may not attract sufficient participants`);
    }
  }

  // ✅ NEW: Parameter consistency validation
  private validateParameterConsistency(params: InitializeBillionScaleParams, errors: string[], warnings: string[]): void {
    // Check reward rate vs. participation rate consistency
    const rewardMultiplier = params.rewardRateBp / 10000;
    const participationRate = params.targetParticipationBp / 10000;
    
    if (rewardMultiplier > 1.8 && participationRate > 0.3) {
      warnings.push("High reward rate with high participation may exhaust reward pool");
    }
    
    if (rewardMultiplier < 1.2 && participationRate < 0.05) {
      warnings.push("Low reward rate with low participation may not attract contributors");
    }

    // Duration vs. reward rate consistency
    if (params.duration <= 3 && rewardMultiplier < 1.3) {
      warnings.push("Short duration may require higher reward rate to attract quick participation");
    }
    
    if (params.duration >= 21 && rewardMultiplier > 1.7) {
      warnings.push("Long duration with high rewards may be unnecessarily generous");
    }

    // Same addresses validation
    if (params.authority.equals(params.treasury)) {
      warnings.push("Authority and treasury are the same address - consider separation for security");
    }
    
    if (params.authority.equals(params.vault)) {
      errors.push("Authority cannot be the same as vault address");
    }
  }

  // ✅ NEW: Precision and overflow validation
  private validatePrecisionAndOverflow(params: InitializeBillionScaleParams, errors: string[], warnings: string[]): void {
    const { VALIDATION_CONSTANTS } = BillionScaleProgramInteractions;
    
    // Check for potential integer overflow in calculations
    try {
      const durationSeconds = new BN(params.duration).muln(86400);
      if (durationSeconds.gt(VALIDATION_CONSTANTS.MAX_SAFE_INTEGER)) {
        errors.push("Duration calculation overflow - value too large");
      }
    } catch {
      errors.push("Duration value causes integer overflow");
    }

    // Check reward rate precision
    if (params.rewardRateBp % 1 !== 0) {
      errors.push("Reward rate basis points must be whole numbers");
    }
    
    // Check participation rate precision
    if (params.targetParticipationBp % 1 !== 0) {
      errors.push("Participation rate basis points must be whole numbers");
    }

    // Validate BigInt operations won't overflow
    try {
      const priceBN = new BN(params.v1MarketPriceLamports);
      const testMultiplication = priceBN.muln(params.targetParticipationBp);
      
      if (testMultiplication.gt(VALIDATION_CONSTANTS.MAX_SAFE_INTEGER)) {
        warnings.push("Large values may cause precision loss in calculations");
      }
    } catch {
      errors.push("Parameter combination causes calculation overflow");
    }
  }

  // ✅ NEW: Smart contract constraints validation
  private validateSmartContractConstraints(params: InitializeBillionScaleParams, errors: string[], warnings: string[]): void {
    // Solana transaction size limits
    const parameterDataSize = 
      32 + // authority
      32 + // treasury
      32 + // v1TokenMint
      32 + // vault
      8 +  // duration
      2 +  // rewardRateBp
      2 +  // targetParticipationBp
      8 +  // v1MarketPriceLamports
      (params.tokenName?.length || 0) +
      (params.imageUrl?.length || 0);
    
    if (parameterDataSize > 1000) {
      warnings.push("Parameter data size may be too large for single transaction");
    }

    // Token name constraints
    if (params.tokenName) {
      if (params.tokenName.length > 32) {
        errors.push("Token name must be 32 characters or less");
      }
      
      if (!/^[a-zA-Z0-9\s-_]+$/.test(params.tokenName)) {
        warnings.push("Token name contains special characters that may cause issues");
      }
    }

    // Image URL constraints
    if (params.imageUrl) {
      if (params.imageUrl.length > 200) {
        errors.push("Image URL must be 200 characters or less");
      }
      
      try {
        new URL(params.imageUrl);
      } catch {
        errors.push("Image URL format is invalid");
      }
    }

    // Blockchain constraints
    const endTime = Math.floor(Date.now() / 1000) + (params.duration * 86400);
    const maxFutureTime = Math.floor(Date.now() / 1000) + (365 * 86400); // 1 year from now
    
    if (endTime > maxFutureTime) {
      warnings.push("End time is very far in the future - may cause timestamp issues");
    }
  }

  // ✅ ENHANCED: Overflow detection with proper safety checks
  async wouldCauseOverflow(takeoverPubkey: PublicKey, additionalContribution: BN): Promise<{
    wouldOverflow: boolean;
    currentUtilization: number;
    newUtilization: number;
    safetyMargin: number;
    recommendation?: string;
  }> {
    try {
      const takeover = await this.getBillionScaleTakeover(takeoverPubkey);
      if (!takeover) {
        return {
          wouldOverflow: true,
          currentUtilization: 0,
          newUtilization: 0,
          safetyMargin: 0,
          recommendation: "Takeover not found"
        };
      }

      const currentTotal = takeover.totalContributed;
      const maxSafe = takeover.maxSafeTotalContribution;
      const newTotal = currentTotal.add(additionalContribution);
      
      const currentUtilization = maxSafe.isZero() ? 0 : currentTotal.toNumber() / maxSafe.toNumber();
      const newUtilization = maxSafe.isZero() ? 0 : newTotal.toNumber() / maxSafe.toNumber();
      const safetyMargin = Math.max(0, 1 - newUtilization);
      
      const wouldOverflow = newTotal.gt(maxSafe);
      
      let recommendation: string | undefined;
      if (wouldOverflow) {
        const maxAllowed = maxSafe.sub(currentTotal);
        recommendation = `Maximum additional contribution: ${maxAllowed.toString()} tokens`;
      } else if (newUtilization > 0.95) {
        recommendation = "Approaching capacity limit - consider smaller contribution";
      } else if (newUtilization > 0.8) {
        recommendation = "High utilization - monitor for safety";
      }

      return {
        wouldOverflow,
        currentUtilization,
        newUtilization,
        safetyMargin,
        recommendation
      };
    } catch (error: any) {
      console.error("Error checking overflow:", error);
      return {
        wouldOverflow: true,
        currentUtilization: 0,
        newUtilization: 0,
        safetyMargin: 0,
        recommendation: `Error checking overflow: ${error.message}`
      };
    }
  }

  // ✅ ENHANCED: Initialize with comprehensive validation
  async initializeBillionScale(params: InitializeBillionScaleParams) {
    // Validate parameters before creating instruction
    const validation = this.validateBillionScaleParams(params);
    
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
    }
    
    // Log warnings if any
    if (validation.warnings.length > 0) {
      console.warn("⚠️ Validation warnings:", validation.warnings);
    }
    
    // Log recommendations if any
    if (validation.recommendations.length > 0) {
      console.info("💡 Recommendations:", validation.recommendations);
    }

    const [takeoverPDA] = await findTakeoverPDA(params.authority, params.v1TokenMint);
    
    // Convert duration from days to seconds with overflow protection
    const durationSeconds = new BN(params.duration).muln(86400);
    
    return await this.program.methods
      .initializeBillionScale(
        durationSeconds,
        params.rewardRateBp,
        params.targetParticipationBp,
        new BN(params.v1MarketPriceLamports)
      )
      .accounts({
        authority: params.authority,
        treasury: params.treasury,
        v1TokenMint: params.v1TokenMint,
        takeover: takeoverPDA,
        vault: params.vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .instruction();
  }

  // ✅ ENHANCED: Get takeover with proper error handling
  async getBillionScaleTakeover(takeoverPubkey: PublicKey): Promise<BillionScaleTakeover | null> {
    try {
      // Try different account access patterns based on IDL structure
      let account;
      try {
        account = await (this.program.account as any).takeover.fetch(takeoverPubkey);
      } catch (e1) {
        try {
          account = await (this.program.account as any).Takeover.fetch(takeoverPubkey);
        } catch (e2) {
          try {
            account = await (this.program.account as any).billionScaleTakeover.fetch(takeoverPubkey);
          } catch (e3) {
            console.error("All account fetch attempts failed:", { e1, e2, e3 });
            return null;
          }
        }
      }
      return account as BillionScaleTakeover;
    } catch (error: any) {
      console.error("Error fetching takeover:", error);
      return null;
    }
  }

  // Helper to get safe contribution amount
  async getSafeContributionAmount(takeoverPubkey: PublicKey, desiredAmount: BN): Promise<BN> {
    const overflowCheck = await this.wouldCauseOverflow(takeoverPubkey, desiredAmount);
    
    if (!overflowCheck.wouldOverflow) {
      return desiredAmount;
    }
    
    // Return safe amount (95% of remaining capacity)
    const takeover = await this.getBillionScaleTakeover(takeoverPubkey);
    if (!takeover) return new BN(0);
    
    const remaining = takeover.maxSafeTotalContribution.sub(takeover.totalContributed);
    return remaining.muln(0.95);
  }

  // Get program instance for advanced usage
  getProgram(): Program {
    return this.program;
  }

  // Helper PDAs
  async findTakeoverPDA(authority: PublicKey, v1Mint: PublicKey) {
    return findTakeoverPDA(authority, v1Mint);
  }

  async findContributorPDA(takeover: PublicKey, contributor: PublicKey) {
    return findContributorPDA(takeover, contributor);
  }
}

// Export interfaces and types
export type { BillionScaleTakeover, ContributorData };
export type { ValidationResult as ProgramValidationResult, EconomicValidationParams as ProgramEconomicValidationParams };

// Also export with the original name for backward compatibility
export { BillionScaleProgramInteractions as ProgramInteractions };