"use client";
import { useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { 
  Keypair, 
  Transaction, 
  SystemProgram,
  TransactionInstruction,
  PublicKey
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";
import { LoadingSpinner } from "@/components/loading-spinner";
import { WalletMultiButton } from "@/components/wallet-multi-button";

interface CreatedToken {
  mint: string;
  name: string;
  supply: string;
  signature: string;
}

// Constants for older spl-token versions
const MINT_SIZE = 82;

// Helper function to create mint instruction (compatible with older versions)
function createInitializeMintInstructionLegacy(
  mint: PublicKey,
  decimals: number,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey | null
): TransactionInstruction {
  const data = Buffer.alloc(67);
  data.writeUInt8(0, 0); // Initialize mint instruction
  data.writeUInt8(decimals, 1);
  mintAuthority.toBuffer().copy(data, 2);
  data.writeUInt8(freezeAuthority ? 1 : 0, 34);
  if (freezeAuthority) {
    freezeAuthority.toBuffer().copy(data, 35);
  }

  return new TransactionInstruction({
    keys: [
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
    ],
    programId: TOKEN_PROGRAM_ID,
    data: data,
  });
}

// Helper function to get associated token address
function getAssociatedTokenAddressLegacy(mint: PublicKey, owner: PublicKey): PublicKey {
  const [address] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL") // Associated Token Program
  );
  return address;
}

// Helper function to create ATA instruction
function createAssociatedTokenAccountInstructionLegacy(
  payer: PublicKey,
  associatedToken: PublicKey,
  owner: PublicKey,
  mint: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: payer, isSigner: true, isWritable: true },
      { pubkey: associatedToken, isSigner: false, isWritable: true },
      { pubkey: owner, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
    ],
    programId: new PublicKey("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"),
    data: Buffer.from([]),
  });
}

// Helper function to create mint to instruction
function createMintToInstructionLegacy(
  mint: PublicKey,
  destination: PublicKey,
  authority: PublicKey,
  amount: bigint
): TransactionInstruction {
  const data = Buffer.alloc(9);
  data.writeUInt8(7, 0); // MintTo instruction
  data.writeBigUInt64LE(amount, 1);

  return new TransactionInstruction({
    keys: [
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: destination, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    programId: TOKEN_PROGRAM_ID,
    data: data,
  });
}

export default function TokenMinter() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [createdTokens, setCreatedTokens] = useState<CreatedToken[]>([]);
  const [formData, setFormData] = useState({
    name: "Test Token",
    symbol: "TEST",
    decimals: "6",
    initialSupply: "1000000"
  });

  const createToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publicKey) return;

    try {
      setLoading(true);
      console.log("🪙 Creating new token...");

      // Generate new mint keypair
      const mintKeypair = Keypair.generate();
      console.log("📍 Mint address:", mintKeypair.publicKey.toString());

      // Get minimum lamports for mint account (approximately 1.4 SOL for mint account)
      const lamports = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
      console.log("💰 Required lamports:", lamports);

      // Create associated token account for the creator
      const associatedTokenAddress = getAssociatedTokenAddressLegacy(
        mintKeypair.publicKey,
        publicKey
      );
      console.log("🏦 Associated token account:", associatedTokenAddress.toString());

      // Build transaction
      const transaction = new Transaction();

      // 1. Create mint account
      transaction.add(
        SystemProgram.createAccount({
          fromPubkey: publicKey,
          newAccountPubkey: mintKeypair.publicKey,
          space: MINT_SIZE,
          lamports,
          programId: TOKEN_PROGRAM_ID,
        })
      );

      // 2. Initialize mint
      transaction.add(
        createInitializeMintInstructionLegacy(
          mintKeypair.publicKey,
          parseInt(formData.decimals),
          publicKey, // mint authority
          publicKey  // freeze authority
        )
      );

      // 3. Create associated token account
      transaction.add(
        createAssociatedTokenAccountInstructionLegacy(
          publicKey, // payer
          associatedTokenAddress, // token account
          publicKey, // owner
          mintKeypair.publicKey // mint
        )
      );

      // 4. Mint initial supply to creator
      const initialSupply = BigInt(Number(formData.initialSupply) * Math.pow(10, parseInt(formData.decimals)));
      transaction.add(
        createMintToInstructionLegacy(
          mintKeypair.publicKey,
          associatedTokenAddress,
          publicKey, // mint authority
          initialSupply
        )
      );

      // Set recent blockhash and fee payer
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = publicKey;

      // Sign with mint keypair
      transaction.partialSign(mintKeypair);

      console.log("📤 Sending transaction...");
      const signature = await sendTransaction(transaction, connection);
      
      console.log("⏳ Confirming transaction...");
      await connection.confirmTransaction(signature, "confirmed");

      console.log("✅ Token created successfully!");
      console.log("🔗 Transaction:", signature);

      // Add to created tokens list
      const newToken: CreatedToken = {
        mint: mintKeypair.publicKey.toString(),
        name: formData.name,
        supply: formData.initialSupply,
        signature
      };

      setCreatedTokens(prev => [newToken, ...prev]);

      toast({
        title: "Token Created! 🎉",
        description: `${formData.name} (${formData.symbol}) created successfully!`,
        duration: 5000
      });

      // Reset form
      setFormData({
        name: "Test Token",
        symbol: "TEST", 
        decimals: "6",
        initialSupply: "1000000"
      });

    } catch (error: any) {
      console.error("Token creation failed:", error);
      toast({
        title: "Token Creation Failed",
        description: error.message || "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "Address copied to clipboard"
    });
  };

  if (!publicKey) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <h1 className="text-2xl font-bold">Token Minter</h1>
        <p className="text-muted-foreground">Connect your wallet to create test tokens</p>
        <WalletMultiButton />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-8">
      {/* Token Creator */}
      <Card>
        <CardHeader>
          <CardTitle>Create Test Token</CardTitle>
          <CardDescription>
            Create tokens for testing your takeover campaigns on devnet
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createToken} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Token Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="My Test Token"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="symbol">Symbol</Label>
                <Input
                  id="symbol"
                  value={formData.symbol}
                  onChange={(e) => setFormData(prev => ({ ...prev, symbol: e.target.value }))}
                  placeholder="MTT"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="decimals">Decimals</Label>
                <Input
                  id="decimals"
                  type="number"
                  value={formData.decimals}
                  onChange={(e) => setFormData(prev => ({ ...prev, decimals: e.target.value }))}
                  min="0"
                  max="9"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="initialSupply">Initial Supply</Label>
                <Input
                  id="initialSupply"
                  type="number"
                  value={formData.initialSupply}
                  onChange={(e) => setFormData(prev => ({ ...prev, initialSupply: e.target.value }))}
                  placeholder="1000000"
                  required
                />
              </div>
            </div>

            <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                💡 <strong>Tip:</strong> This will create a real token on Solana devnet. You'll need about 0.002 SOL for transaction fees.
              </p>
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? <LoadingSpinner /> : "Create Token"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Created Tokens */}
      {createdTokens.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your Created Tokens</CardTitle>
            <CardDescription>
              Use these token mint addresses in your takeover campaigns
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {createdTokens.map((token, index) => (
                <div key={index} className="p-4 border rounded-lg space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold">{token.name}</h3>
                      <p className="text-sm text-gray-500">Supply: {Number(token.supply).toLocaleString()}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(token.mint)}
                    >
                      Copy Address
                    </Button>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-gray-500">Mint Address (use this in takeover creation):</p>
                    <code className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded block break-all">
                      {token.mint}
                    </code>
                  </div>
                  <div className="flex gap-2">
                    <a 
                      href={`https://solscan.io/token/${token.mint}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      View on Solscan
                    </a>
                    <span className="text-xs text-gray-400">•</span>
                    <a 
                      href={`https://solscan.io/tx/${token.signature}?cluster=devnet`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      View Transaction
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}