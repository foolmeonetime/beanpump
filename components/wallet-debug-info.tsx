"use client";
import { useWallet } from "@solana/wallet-adapter-react";
import { useEffect, useState } from "react";

export function WalletDebugInfo() {
  const [mounted, setMounted] = useState(false);
  const wallet = useWallet();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm mb-4">
        <h3 className="font-bold mb-2">Wallet Debug Info:</h3>
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg text-sm mb-4">
      <h3 className="font-bold mb-2">Wallet Debug Info:</h3>
      <div className="space-y-1">
        <p>Wallet object exists: {wallet ? 'Yes' : 'No'}</p>
        <p>Wallets array exists: {wallet?.wallets ? 'Yes' : 'No'}</p>
        <p>Available wallets count: {wallet?.wallets?.length || 0}</p>
        <p>Current wallet: {wallet?.wallet?.adapter?.name || 'None'}</p>
        <p>Connected: {wallet?.connected?.toString() || 'Unknown'}</p>
        <p>Connecting: {wallet?.connecting?.toString() || 'Unknown'}</p>
        <p>Public Key: {wallet?.publicKey?.toString() || 'None'}</p>
        {wallet?.wallets && (
          <p>Available: {wallet.wallets.map(w => w.adapter.name).join(', ')}</p>
        )}
      </div>
    </div>
  );
}