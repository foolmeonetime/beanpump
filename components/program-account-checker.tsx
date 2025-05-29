"use client";
import { useConnection } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";

export function ProgramAccountChecker() {
  const { connection } = useConnection();
  const [results, setResults] = useState<any>({});

  useEffect(() => {
    const checkPrograms = async () => {
      const programIds = [
        "Ex82LQjgYkAwChStbAoiSxVKdFDVfWisqsq6FreDq4dF", // From your Rust code
        "CJxUrvjAXL2PR2bK8vANxLJiWWRXbyaFvzzF9cMgYmfJ", // From your original constants
      ];

      const results: any = {};

      for (const programId of programIds) {
        try {
          const pubkey = new PublicKey(programId);
          const accountInfo = await connection.getAccountInfo(pubkey);
          
          results[programId] = {
            exists: !!accountInfo,
            executable: accountInfo?.executable || false,
            owner: accountInfo?.owner.toString() || "N/A",
            lamports: accountInfo?.lamports || 0,
            dataLength: accountInfo?.data.length || 0
          };
        } catch (error) {
          results[programId] = {
            exists: false,
            error: (error as Error).message
          };
        }
      }

      setResults(results);
    };

    checkPrograms();
  }, [connection]);

  return (
    <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg text-sm mb-4">
      <h3 className="font-bold mb-2">Program Account Check:</h3>
      <div className="space-y-2">
        {Object.entries(results).map(([programId, info]: [string, any]) => (
          <div key={programId} className="border-l-2 border-gray-300 pl-3">
            <p className="font-mono text-xs break-all">{programId}</p>
            <p>Exists: {info.exists ? '✅ Yes' : '❌ No'}</p>
            {info.exists && (
              <>
                <p>Executable: {info.executable ? '✅ Yes' : '❌ No'}</p>
                <p>Owner: {info.owner}</p>
                <p>Balance: {(info.lamports / 1_000_000_000).toFixed(4)} SOL</p>
                <p>Size: {info.dataLength} bytes</p>
              </>
            )}
            {info.error && <p className="text-red-600">Error: {info.error}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}