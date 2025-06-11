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
}

export class BillionScaleProgramInteractions {
  private program: Program;
  private connection: Connection;

  constructor(connection: Connection, wallet: any) {
    this.program = getProgram(connection, wallet);
    this.connection = connection;
  }

  // Initialize billion-scale takeover with conservative parameters
  async initializeBillionScale(params: InitializeBillionScaleParams) {
    const [takeoverPDA] = await findTakeoverPDA(params.authority, params.v1TokenMint);
    
    // Convert duration from days to seconds
    const durationSeconds = new BN(params.duration * 86400);
    
    // Validate parameters for billion-scale safety
    if (params.rewardRateBp < 100 || params.rewardRateBp > 200) {
      throw new Error("Reward rate must be between 1.0x (100bp) and 2.0x (200bp) for safety");
    }
    
    if (params.targetParticipationBp <= 0 || params.targetParticipationBp > 10000) {
      throw new Error("Target participation must be between 0.01% and 100%");
    }

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

  // Get all billion-scale takeovers with proper type conversion
  async getAllBillionScaleTakeovers(): Promise<(BillionScaleTakeover & { publicKey: PublicKey })[]> {
    try {
      const accounts = await this.program.account.takeover.all();
      
      return accounts.map(account => {
        // Properly convert raw account data to our interface
        const rawAccount = account.account as unknown as BillionScaleTakeover;
        return {
          ...rawAccount,
          publicKey: account.publicKey
        };
      });
    } catch (error) {
      console.error("Error fetching billion-scale takeovers:", error);
      return [];
    }
  }

  // Get specific takeover with billion-scale data and proper typing
  async getBillionScaleTakeover(takeoverPubkey: PublicKey): Promise<BillionScaleTakeover | null> {
    try {
      const account = await this.program.account.takeover.fetch(takeoverPubkey);
      // Cast to our interface with proper type conversion
      return account as unknown as BillionScaleTakeover;
    } catch (error) {
      console.error("Error fetching billion-scale takeover:", error);
      return null;
    }
  }

  // Contribute with billion-scale overflow protection
  async contributeBillionScale(
    contributor: PublicKey,
    takeover: PublicKey,
    contributorAta: PublicKey,
    vault: PublicKey,
    amount: BN
  ) {
    const [contributorPDA] = await findContributorPDA(takeover, contributor);

    return await this.program.methods
      .contributeBillionScale(amount)
      .accounts({
        contributor,
        takeover,
        contributorAta,
        vault,
        contributorAccount: contributorPDA,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  // Finalize takeover (unchanged from original)
  async finalizeTakeover(
    takeover: PublicKey,
    authority: PublicKey,
    v2Mint: PublicKey
  ) {
    return await this.program.methods
      .finalizeTakeover()
      .accounts({
        takeover,
        authority,
        v2Mint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .instruction();
  }

  // Claim V2 tokens with liquidity mode support
  async airdropV2Liquidity(
    authority: PublicKey,
    contributor: PublicKey,
    takeover: PublicKey,
    v2Mint: PublicKey,
    contributorAta: PublicKey,
    vault: PublicKey
  ) {
    const [contributorPDA] = await findContributorPDA(takeover, contributor);

    return await this.program.methods
      .airdropV2Liquidity()
      .accounts({
        authority,
        contributor,
        takeover,
        contributorAccount: contributorPDA,
        v2Mint,
        contributorAta,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .instruction();
  }

  // Jupiter swap completion (new feature)
  async completeJupiterSwap(
    authority: PublicKey,
    takeover: PublicKey,
    solDestination: PublicKey,
    solReceived: BN
  ) {
    return await this.program.methods
      .completeJupiterSwap(solReceived)
      .accounts({
        authority,
        takeover,
        solDestination,
      })
      .instruction();
  }

  // Create liquidity pool (new feature)
  async createLiquidityPool(
    authority: PublicKey,
    takeover: PublicKey,
    v2Mint: PublicKey,
    liquidityPool: PublicKey,
    lpTokenMint: PublicKey,
    poolType: 'Raydium' | 'Orca' | 'Meteora'
  ) {
    // Convert string to enum format expected by program
    const poolTypeEnum = { [poolType.toLowerCase()]: {} };

    return await this.program.methods
      .createLiquidityPool(poolTypeEnum)
      .accounts({
        authority,
        takeover,
        v2Mint,
        liquidityPool,
        lpTokenMint,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
  }

  // Helper methods for billion-scale calculations
  calculateProportionateMinAmount(
    v1TotalSupply: BN,
    rewardRateBp: number,
    targetParticipationBp: number,
    rewardPoolTokens: BN
  ): BN {
    const rewardRate = rewardRateBp / 10000;
    const targetParticipation = targetParticipationBp / 10000;
    
    // Method 1: Based on target participation
    const participationBasedAmount = v1TotalSupply.muln(targetParticipation);
    
    // Method 2: Based on reward pool capacity with 2% safety cushion
    const safetyMultiplier = 0.98; // 98% of capacity
    const safeRewardPool = rewardPoolTokens.muln(safetyMultiplier);
    const capacityBasedAmount = safeRewardPool.divn(rewardRate);
    
    // Use the smaller of the two for safety
    return BN.min(participationBasedAmount, capacityBasedAmount);
  }

  calculateMaxSafeContribution(rewardPoolTokens: BN, rewardRateBp: number): BN {
    const rewardRate = rewardRateBp / 10000;
    const safetyMultiplier = 0.98; // 98% of capacity
    const safeRewardPool = rewardPoolTokens.muln(safetyMultiplier);
    return safeRewardPool.divn(rewardRate);
  }

  // Validation helpers
  validateBillionScaleParams(params: InitializeBillionScaleParams): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate reward rate (1.0x to 2.0x for safety)
    if (params.rewardRateBp < 100 || params.rewardRateBp > 200) {
      errors.push("Reward rate must be between 1.0x (100bp) and 2.0x (200bp)");
    }

    // Validate participation rate (0.01% to 100%)
    if (params.targetParticipationBp <= 0 || params.targetParticipationBp > 10000) {
      errors.push("Target participation must be between 0.01% and 100%");
    }

    // Validate duration (1 to 30 days)
    if (params.duration < 1 || params.duration > 30) {
      errors.push("Duration must be between 1 and 30 days");
    }

    // Validate price
    if (params.v1MarketPriceLamports <= 0) {
      errors.push("V1 market price must be greater than 0");
    }

    return { valid: errors.length === 0, errors };
  }

  // Helper to check if takeover would cause overflow
  async wouldCauseOverflow(takeoverPubkey: PublicKey, additionalContribution: BN): Promise<boolean> {
    const takeover = await this.getBillionScaleTakeover(takeoverPubkey);
    if (!takeover) return true;

    const newTotal = takeover.totalContributed.add(additionalContribution);
    return newTotal.gt(takeover.maxSafeTotalContribution);
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

// Also export with the original name for backward compatibility
export { BillionScaleProgramInteractions as ProgramInteractions };