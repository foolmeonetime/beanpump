"use client";
import { useConnection } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { Button } from "@/components/ui/button";

export function ProgramInspector() {
  const { connection } = useConnection();
  const [result, setResult] = useState<string>("");

  const inspectProgram = async () => {
    try {
      setResult("Inspecting deployed program...");
      
      const programId = new PublicKey("CJxUrvjAXL2PR2bK8vANxLJiWWRXbyaFvzzF9cMgYmfJ");
      
      // Get program account
      const accountInfo = await connection.getAccountInfo(programId);
      
      if (!accountInfo) {
        setResult("Program not found");
        return;
      }
      
      let resultText = `Program Account Info:
- Exists: ✅ Yes
- Executable: ${accountInfo.executable ? '✅ Yes' : '❌ No'}
- Owner: ${accountInfo.owner.toString()}
- Data Length: ${accountInfo.data.length} bytes
- Lamports: ${accountInfo.lamports / 1_000_000_000} SOL

`;

      // Try to get program data account (for upgradeable programs)
      try {
        const [programDataAddress] = PublicKey.findProgramAddressSync(
          [programId.toBuffer()],
          new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111")
        );
        
        const programDataAccount = await connection.getAccountInfo(programDataAddress);
        
        if (programDataAccount) {
          resultText += `Program Data Account:
- Address: ${programDataAddress.toString()}
- Size: ${programDataAccount.data.length} bytes
- Authority: ${programDataAccount.data.length > 45 ? 
  new PublicKey(programDataAccount.data.slice(13, 45)).toString() : 'Unable to parse'}

`;
        }
      } catch (e) {
        resultText += `Program Data: Not found or not upgradeable\n\n`;
      }

      // Check if we can derive PDAs with different program IDs
      const testMint = new PublicKey("So11111111111111111111111111111111111111112");
      const testAuthority = new PublicKey("11111111111111111111111111111111");
      
      const programs = [
        "CJxUrvjAXL2PR2bK8vANxLJiWWRXbyaFvzzF9cMgYmfJ",
        "Ex82LQjgYkAwChStbAoiSxVKdFDVfWisqsq6FreDq4dF"
      ];
      
      resultText += "PDA Tests:\n";
      for (const progId of programs) {
        try {
          const [pda, bump] = PublicKey.findProgramAddressSync(
            [Buffer.from("takeover"), testAuthority.toBuffer(), testMint.toBuffer()],
            new PublicKey(progId)
          );
          resultText += `- ${progId.slice(0, 8)}...: ${pda.toString().slice(0, 8)}... (bump: ${bump})\n`;
        } catch (e) {
          resultText += `- ${progId.slice(0, 8)}...: Error deriving PDA\n`;
        }
      }
      
      setResult(resultText);
      
    } catch (error: any) {
      setResult(`Error: ${error.message}`);
    }
  };

  return (
    <div className="p-4 bg-yellow-50 dark:bg-yellow-950 rounded-lg mb-4">
      <h3 className="font-bold mb-2">Program Inspector:</h3>
      <Button onClick={inspectProgram} className="mb-4">
        Inspect Deployed Program
      </Button>
      {result && (
        <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded overflow-x-auto whitespace-pre-wrap">
          {result}
        </pre>
      )}
    </div>
  );
}