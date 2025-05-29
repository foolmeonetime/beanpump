import * as web3 from "@solana/web3.js";
import { 
  Token,
  TOKEN_PROGRAM_ID 
} from "@solana/spl-token";
import * as fs from "fs";
import path from "path";

// Configuration
const RECIPIENT_WALLET = "HAgkhS9wSUnG6Qbbh2C7t7RRCqriNwmeJbbjsYk4YgSg";
const TOKEN_DECIMALS = 6;
const MINT_AMOUNT = 1000000; // 1,000,000 tokens with 6 decimals

async function main() {
  try {
    // Connect to devnet
    const connection = new web3.Connection(
      web3.clusterApiUrl("devnet"),
      "confirmed"
    );

    console.log("1. Loading or creating keypair...");

    // Keypair management
    const keypairFile = path.resolve("keypair.json");
    let payer: web3.Keypair;

    if (fs.existsSync(keypairFile)) {
      const keypairData = JSON.parse(fs.readFileSync(keypairFile, "utf-8"));
      payer = web3.Keypair.fromSecretKey(new Uint8Array(keypairData));
      console.log("Loaded existing keypair");
    } else {
      payer = web3.Keypair.generate();
      fs.writeFileSync(keypairFile, JSON.stringify(Array.from(payer.secretKey)));
      console.log("Generated new keypair and saved to keypair.json");
    }

    console.log("Payer address:", payer.publicKey.toString());

    // Check balance and request airdrop if needed
    const balance = await connection.getBalance(payer.publicKey);
    console.log("Current balance:", balance / web3.LAMPORTS_PER_SOL, "SOL");

    if (balance < web3.LAMPORTS_PER_SOL) {
      console.log("2. Requesting airdrop...");
      const signature = await connection.requestAirdrop(
        payer.publicKey,
        web3.LAMPORTS_PER_SOL * 2
      );
      await connection.confirmTransaction(signature);
      console.log("Airdrop received");

      const newBalance = await connection.getBalance(payer.publicKey);
      console.log("New balance:", newBalance / web3.LAMPORTS_PER_SOL, "SOL");
    } else {
      console.log("2. Sufficient balance found, skipping airdrop");
    }

    // Create token mint
    console.log("3. Creating token mint...");
    const mintAccount = new web3.Keypair();
    const token = await Token.createMint(
      connection,
      payer,
      payer.publicKey,
      payer.publicKey,
      TOKEN_DECIMALS,
      TOKEN_PROGRAM_ID
    );

    console.log("Token mint created:", token.publicKey.toString());

    // Create associated token account
    console.log("4. Creating token account for recipient...");
    const recipientPublicKey = new web3.PublicKey(RECIPIENT_WALLET);
    const recipientTokenAccount = await token.getOrCreateAssociatedAccountInfo(
      recipientPublicKey
    );

    console.log(
      "Recipient token account:",
      recipientTokenAccount.address.toString()
    );

    // Mint tokens
    console.log("5. Minting tokens to recipient...");
    const mintAmount = MINT_AMOUNT * Math.pow(10, TOKEN_DECIMALS);
    await token.mintTo(
      recipientTokenAccount.address,
      payer.publicKey,
      [],
      mintAmount
    );

    console.log(
      `Successfully minted ${MINT_AMOUNT} tokens to ${RECIPIENT_WALLET}`
    );
    console.log("Token Mint Address:", token.publicKey.toString());
    console.log("\nUse this mint address in your dApp for testing!");

    // Save mint address
    fs.writeFileSync("mint-address.txt", token.publicKey.toString());
    console.log("Mint address saved to mint-address.txt");
  } catch (error) {
    console.error("Error:", error);
  }
}

main();