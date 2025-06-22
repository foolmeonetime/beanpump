// app/layout.tsx - Updated with diagnostic panel while preserving ALL existing functionality
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from '@/components/ui/toaster';
import { WalletContextProvider } from "@/app/providers/wallet-provider";
import { Header } from '@/components/header';
import { ThemeProvider } from '@/components/theme-provider';
import { DiagnosticHandler } from '@/components/diagnostic-handler';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Takeover System - Billion Scale Token Takeovers",
  description: "Decentralized Solana token takeover platform with billion-scale safety mechanisms",
  keywords: ["solana", "defi", "takeover", "blockchain", "cryptocurrency", "billion-scale"],
  authors: [{ name: "Takeover Team" }],
  viewport: "width=device-width, initial-scale=1",
  openGraph: {
    title: "Takeover System",
    description: "Decentralized Solana token takeover platform",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <WalletContextProvider>
            <div className="min-h-screen bg-background">
              {/* Header with Navigation */}
              <Header />
              
              {/* Main Content */}
              <main>
                {children}
              </main>
              
              {/* Footer - PRESERVED from your original */}
              <footer className="bg-background border-t border-border mt-16">
                <div className="container mx-auto px-4 py-8">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                    <div className="space-y-3">
                      <h3 className="font-semibold text-foreground">Takeover System</h3>
                      <p className="text-sm text-muted-foreground">
                        Decentralized token takeovers with billion-scale safety mechanisms
                      </p>
                    </div>
                    
                    <div className="space-y-3">
                      <h4 className="font-medium text-foreground">Platform</h4>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li><a href="/create" className="hover:text-foreground transition-colors">Create Takeover</a></li>
                        <li><a href="/mint" className="hover:text-foreground transition-colors">Mint Tokens</a></li>
                        <li><a href="/pools" className="hover:text-foreground transition-colors">Pool Simulator</a></li>
                        <li><a href="/claims" className="hover:text-foreground transition-colors">Claims</a></li>
                      </ul>
                    </div>
                    
                    <div className="space-y-3">
                      <h4 className="font-medium text-foreground">Resources</h4>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        <li><a href="/api/debug" className="hover:text-foreground transition-colors">System Status</a></li>
                        <li><a href="https://docs.solana.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Solana Docs</a></li>
                        <li><a href="https://solscan.io" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Solscan</a></li>
                      </ul>
                    </div>
                    
                    <div className="space-y-3">
                      <h4 className="font-medium text-foreground">Network</h4>
                      <div className="flex items-center space-x-2">
                        <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                        <span className="text-sm text-muted-foreground">
                          {process.env.NEXT_PUBLIC_SOLANA_NETWORK?.toUpperCase() || 'DEVNET'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Connected to Solana {process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="border-t border-border mt-8 pt-8 text-center">
                    <p className="text-sm text-muted-foreground">
                      &copy; 2024 Takeover System. Built on Solana with ❤️
                    </p>
                  </div>
                </div>
              </footer>

              {/* NEW: Diagnostic Panel - Shows in development or with debug=true */}
              <DiagnosticHandler />
            </div>
            
            {/* Toast Notifications - PRESERVED in original position */}
            <Toaster />
          </WalletContextProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}