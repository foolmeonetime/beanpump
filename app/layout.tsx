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
              <Header />
              <main>{children}</main>
              {/* Footer and other content... */}
              <DiagnosticHandler />
            </div>
            <Toaster />
          </WalletContextProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}