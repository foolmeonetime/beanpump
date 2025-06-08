// app/providers/wallet-provider.tsx - Updated to remove Phantom warning
"use client";
import React, { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { 
  SolflareWalletAdapter
} from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";

// Import CSS
import "@solana/wallet-adapter-react-ui/styles.css";

interface WalletContextProviderProps {
  children: React.ReactNode;
}

export function WalletContextProvider({ children }: WalletContextProviderProps) {
  const network = WalletAdapterNetwork.Devnet;
  
  const endpoint = useMemo(() => {
    return process.env.NEXT_PUBLIC_RPC_URL || clusterApiUrl(network);
  }, [network]);

  // 🔥 UPDATED: Removed PhantomWalletAdapter since Phantom now auto-registers as Standard Wallet
  const wallets = useMemo(() => {
    return [
      // Phantom is now automatically available as a Standard Wallet
      // PhantomWalletAdapter removed to prevent the warning
      new SolflareWalletAdapter()
      // Add other wallet adapters here if needed
    ];
  }, []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        {/* @ts-ignore */}
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}