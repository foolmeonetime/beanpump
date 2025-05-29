import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { Connection, PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getProgram, findTakeoverPDA, findContributorPDA } from "./program";

export class ProgramInteractions {
  private program: Program;
  private connection: Connection;

  constructor(connection: Connection, wallet: any) {
    this.program = getProgram(connection, wallet);
    this.connection = connection;
  }

  // Initialize takeover
  async createTakeover(
    authority: PublicKey,
    treasury: PublicKey,
    v1TokenMint: PublicKey,
    vault: PublicKey,
    minAmount: BN,
    duration: BN,
    customRewardRate: number
  ) {
    const [takeoverPDA] = await findTakeoverPDA(authority, v1TokenMint);

    return await this.program.methods
      .initialize(minAmount, duration, customRewardRate)
      .accounts({
        authority,
        treasury,
        v1TokenMint,
        takeover: takeoverPDA,
        vault,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .instruction();
  }

  // Get all takeovers
  async getAllTakeovers() {
    try {
      return await this.program.account.takeover.all();
    } catch (error) {
      console.error("Error fetching takeovers:", error);
      return [];
    }
  }

  // Get specific takeover
  async getTakeover(takeoverPubkey: PublicKey) {
    try {
      return await this.program.account.takeover.fetch(takeoverPubkey);
    } catch (error) {
      console.error("Error fetching takeover:", error);
      return null;
    }
  }

  // Contribute to takeover
  async contribute(
    contributor: PublicKey,
    takeover: PublicKey,
    contributorAta: PublicKey,
    vault: PublicKey,
    amount: BN
  ) {
    const [contributorPDA] = await findContributorPDA(takeover, contributor);

    return await this.program.methods
      .contribute(amount)
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

  // Helper methods
  async findTakeoverPDA(authority: PublicKey, v1Mint: PublicKey) {
    return findTakeoverPDA(authority, v1Mint);
  }

  async findContributorPDA(takeover: PublicKey, contributor: PublicKey) {
    return findContributorPDA(takeover, contributor);
  }

  // Get program instance (for advanced usage)
  getProgram(): Program {
    return this.program;
  }
}