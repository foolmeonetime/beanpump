"use client";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton as WalletAdapterMultiButton } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState } from "react";

export function WalletMultiButton() {
  const [mounted, setMounted] = useState(false);
  const wallet = useWallet();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Show loading state until mounted
  if (!mounted) {
    return (
      <div className="h-10 w-32 bg-purple-600 animate-pulse rounded-md flex items-center justify-center">
        <span className="text-white text-sm">Loading...</span>
      </div>
    );
  }

  // Check if wallet context is available
  if (!wallet || typeof wallet.wallets === 'undefined') {
    return (
      <div className="h-10 w-32 bg-red-600 rounded-md flex items-center justify-center">
        <span className="text-white text-sm">Wallet Error</span>
      </div>
    );
  }

  return (
    <div className="wallet-button-container">
      <WalletAdapterMultiButton 
        className="wallet-button"
        style={{
          backgroundColor: '#512da8',
          color: 'white',
          borderRadius: '0.375rem',
          padding: '0.5rem 1rem',
          fontSize: '0.875rem',
          fontWeight: '500',
          border: 'none',
          cursor: 'pointer',
          transition: 'background-color 0.2s ease',
        }}
      />

      {wallet.publicKey && (
        <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Connected: {wallet.publicKey.toString().slice(0, 4)}...{wallet.publicKey.toString().slice(-4)}
        </div>
      )}

      <style jsx global>{`
        .wallet-button:hover {
          background-color: #673ab7 !important;
        }
        
        .wallet-adapter-dropdown-list {
          background-color: white !important;
          color: #333333 !important;
          border: 1px solid #e2e8f0 !important;
          border-radius: 0.5rem !important;
          box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1) !important;
          z-index: 50 !important;
        }
        
        .wallet-adapter-dropdown-list-item {
          padding: 0.75rem 1rem !important;
          transition: background-color 0.1s ease !important;
        }
        
        .wallet-adapter-dropdown-list-item:hover {
          background-color: #f7fafc !important;
        }
        
        .wallet-adapter-modal-wrapper {
          background-color: white !important;
          border-radius: 0.5rem !important;
          z-index: 50 !important;
        }
        
        .wallet-adapter-modal-title {
          color: #333333 !important;
        }
        
        .wallet-adapter-modal-content {
          color: #4a5568 !important;
        }
        
        @media (prefers-color-scheme: dark) {
          .wallet-adapter-dropdown-list {
            background-color: #2d3748 !important;
            color: #e2e8f0 !important;
            border-color: #4a5568 !important;
          }
          
          .wallet-adapter-dropdown-list-item:hover {
            background-color: #4a5568 !important;
          }
          
          .wallet-adapter-modal-wrapper {
            background-color: #2d3748 !important;
          }
          
          .wallet-adapter-modal-title {
            color: #e2e8f0 !important;
          }
          
          .wallet-adapter-modal-content {
            color: #cbd5e0 !important;
          }
        }
      `}</style>
    </div>
  );
}