// components/header.tsx - Fixed navigation structure
"use client";
import { useState, useEffect } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { WalletMultiButton } from "./wallet-multi-button";
import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";

export function Header() {
  const { theme, setTheme } = useTheme();
  const { publicKey } = useWallet();
  const [mounted, setMounted] = useState(false);
  const [claimCount, setClaimCount] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch user's claim count for notification badge
  useEffect(() => {
    const fetchClaimCount = async () => {
      if (!publicKey) {
        setClaimCount(0);
        return;
      }

      try {
        const response = await fetch(`/api/claims?contributor=${publicKey.toString()}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            const unclaimedCount = data.claims.filter((claim: any) => !claim.isClaimed).length;
            setClaimCount(unclaimedCount);
          }
        }
      } catch (error) {
        console.error('Failed to fetch claim count:', error);
      }
    };

    fetchClaimCount();
    
    // Refresh claim count every 30 seconds
    const interval = setInterval(fetchClaimCount, 30000);
    return () => clearInterval(interval);
  }, [publicKey]);

  return (
    <header className="border-b border-gray-200 dark:border-gray-800">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center space-x-2 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center">
            <span className="text-white font-bold">CT</span>
          </div>
          <span className="font-bold text-lg">Community Takeover</span>
        </Link>

        <div className="flex items-center space-x-4">
          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-4">
            <Link href="/" className="text-sm hover:text-purple-600 transition-colors">
              Home
            </Link>
            <Link href="/create" className="text-sm hover:text-purple-600 transition-colors">
              Create
            </Link>
            <Link href="/mint" className="text-sm hover:text-purple-600 transition-colors">
              Mint Tokens
            </Link>
            <Link href="/pools" className="text-sm hover:text-purple-600 transition-colors">
              Pool Simulator
            </Link>
            {publicKey && (
              <Link href="/claims" className="relative text-sm hover:text-purple-600 transition-colors">
                Claims
                {claimCount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-green-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center animate-pulse">
                    {claimCount > 9 ? '9+' : claimCount}
                  </span>
                )}
              </Link>
            )}
          </nav>

          {/* Mobile Navigation Dropdown */}
          <div className="md:hidden">
            <select 
              onChange={(e) => window.location.href = e.target.value}
              className="text-sm bg-transparent border border-gray-300 rounded px-2 py-1"
              defaultValue=""
            >
              <option value="">Menu</option>
              <option value="/">Home</option>
              <option value="/create">Create</option>
              <option value="/mint">Mint Tokens</option>
              <option value="/pools">Pool Simulator</option>
              {publicKey && (
                <option value="/claims">
                  Claims {claimCount > 0 ? `(${claimCount})` : ''}
                </option>
              )}
            </select>
          </div>

          {/* Wallet Connection */}
          <WalletMultiButton />
          
          {/* Theme Toggle */}
          {mounted && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
            </Button>
          )}
        </div>
      </div>

      {/* Mobile Navigation Links (when logged in) */}
      {publicKey && (
        <div className="md:hidden border-t border-gray-200 dark:border-gray-800 px-4 py-2">
          <div className="flex space-x-4 text-sm">
            <Link href="/" className="hover:text-purple-600 transition-colors">
              Home
            </Link>
            <Link href="/create" className="hover:text-purple-600 transition-colors">
              Create
            </Link>
            <Link href="/mint" className="hover:text-purple-600 transition-colors">
              Mint
            </Link>
            <Link href="/pools" className="hover:text-purple-600 transition-colors">
              Pools
            </Link>
            <Link href="/claims" className="relative hover:text-purple-600 transition-colors">
              Claims
              {claimCount > 0 && (
                <span className="ml-1 bg-green-500 text-white text-xs rounded-full px-1">
                  {claimCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}