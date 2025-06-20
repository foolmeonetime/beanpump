import { Program, AnchorProvider, BN } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { idl } from "./idl";

// Type definitions matching the new IDL structure
export interface BillionScaleTakeover {
  authority: PublicKey;
  v1TokenMint: PublicKey;
  vault: PublicKey;
  startTime: BN;
  endTime: BN;
  totalContributed: BN;
  contributorCount: BN;
  isFinalized: boolean;
  isSuccessful: boolean;
  hasV2Mint: boolean;
  v2TokenMint: PublicKey;
  bump: number;
  
  // New billion-scale fields
  v1TotalSupply: BN;
  v2TotalSupply: BN;
  rewardPoolTokens: BN;
  liquidityPoolTokens: BN;
  rewardRateBp: number;
  targetParticipationBp: number;
  calculatedMinAmount: BN;
  maxSafeTotalContribution: BN;
  v1MarketPriceLamports: BN;
  solForLiquidity: BN;
  jupiterSwapCompleted: boolean;
  lpCreated: boolean;
  participationRateBp: number;
}

export interface ContributorData {
  wallet: PublicKey;
  takeover: PublicKey;
  contribution: BN;
  airdropAmount: BN;
  claimed: boolean;
  bump: number;
}

export function getProgram(connection: Connection, wallet: any) {
  const provider = new AnchorProvider(
    connection,
    wallet,
    { 
      commitment: "confirmed",
      preflightCommitment: "confirmed" 
    }
  );
  
  // Anchor 0.31.1 with IDL containing address field
  return new Program(idl as any, provider);
}

// PDA derivation functions
export async function findTakeoverPDA(authority: PublicKey, v1Mint: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("takeover"),
      authority.toBuffer(),
      v1Mint.toBuffer()
    ],
    new PublicKey(PROGRAM_ID)
  );
}

export async function findContributorPDA(takeover: PublicKey, contributor: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("contributor"),
      takeover.toBuffer(),
      contributor.toBuffer()
    ],
    new PublicKey(PROGRAM_ID)
  );
}

// Helper functions for billion-scale operations
export function calculateParticipationRate(totalContributed: BN, v1TotalSupply: BN): number {
  if (v1TotalSupply.isZero()) return 0;
  return (totalContributed.mul(new BN(10000)).div(v1TotalSupply)).toNumber();
}

export function calculateRewardAmount(contribution: BN, rewardRateBp: number): BN {
  return contribution.mul(new BN(rewardRateBp)).div(new BN(10000));
}

export function formatTokenAmount(amount: BN, decimals: number = 6): string {
  const divisor = new BN(10).pow(new BN(decimals));
  const wholePart = amount.div(divisor);
  const fractionalPart = amount.mod(divisor);
  
  if (fractionalPart.isZero()) {
    return wholePart.toString();
  }
  
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  return `${wholePart.toString()}.${fractionalStr.replace(/0+$/, '')}`;
}

export function parseTokenAmount(amount: string, decimals: number = 6): BN {
  const multiplier = new BN(10).pow(new BN(decimals));
  const [whole, fractional = ''] = amount.split('.');
  const wholeBN = new BN(whole || '0');
  const fractionalBN = new BN(fractional.padEnd(decimals, '0').slice(0, decimals));
  return wholeBN.mul(multiplier).add(fractionalBN);
}

// Export IDL for other components
export { idl };