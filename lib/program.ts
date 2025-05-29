import { Program, AnchorProvider } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "./constants";
import { idl } from "./idl";

export function getProgram(connection: Connection, wallet: any) {
  const provider = new AnchorProvider(
    connection,
    wallet,
    { 
      commitment: "confirmed",
      preflightCommitment: "confirmed" 
    }
  );
  
  return new Program(
    idl as any,
    new PublicKey(PROGRAM_ID),
    provider
  );
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

// Export IDL for other components
export { idl };