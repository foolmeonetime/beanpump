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

  // ✅ FIXED: Fetch user's claim count with proper error handling
  useEffect(() => {
    const fetchClaimCount = async () => {
      if (!publicKey) {
        setClaimCount(0);
        return;
      }

      try {
        console.log('🔍 Header: Fetching claim count for:', publicKey.toString());
        
        const response = await fetch(`/api/claims?contributor=${publicKey.toString()}`, {
          cache: 'no-store'
        });
        
        if (!response.ok) {
          console.warn('❌ Header: Failed to fetch claims:', response.status);
          return;
        }
        
        const data = await response.json();
        console.log('📊 Header: Received data:', data);
        
        if (!data.success) {
          console.warn('❌ Header: API returned error:', data.error);
          return;
        }
        
        // ✅ DEFENSIVE: Handle different possible API response structures
        let claimsArray: any[] = [];
        
        if (Array.isArray(data.claims)) {
          claimsArray = data.claims;
        } else if (data.data && Array.isArray(data.data.claims)) {
          claimsArray = data.data.claims;
        } else if (data.data && Array.isArray(data.data)) {
          claimsArray = data.data;
        } else {
          console.warn('⚠️ Header: Unexpected API response structure:', data);
          claimsArray = [];
        }
        
        console.log('📊 Header: Processing claims array:', claimsArray.length);
        
        // ✅ FIXED: Safe filtering with proper null checks
        const unclaimedCount = claimsArray.filter((claim: any) => {
          return claim && !claim.isClaimed;
        }).length;
        
        console.log('📊 Header: Unclaimed count:', unclaimedCount);
        setClaimCount(unclaimedCount);
        
      } catch (error: any) {
        console.error('❌ Header: Failed to fetch claim count:', error);
        // Don't throw the error, just log it and continue
        setClaimCount(0);
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
          <nav className="hidden md:flex items-center space-x-6">
            <Link href="/takeover" className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-colors">
              Takeovers
            </Link>
            <Link href="/create" className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-colors">
              Create
            </Link>
            
            {/* ✅ ENHANCED: Claims link with notification badge */}
            <Link href="/claims" className="relative text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white transition-colors">
              Claims
              {claimCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {claimCount > 9 ? '9+' : claimCount}
                </span>
              )}
            </Link>
          </nav>

          {/* Theme toggle */}
          {mounted && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? (
                <MoonIcon className="h-4 w-4" />
              ) : (
                <SunIcon className="h-4 w-4" />
              )}
            </Button>
          )}

          {/* Wallet connection */}
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}