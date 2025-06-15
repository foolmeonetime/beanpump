import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Takeover System",
  description: "Solana Token Takeover Platform",
  keywords: ["solana", "defi", "takeover", "blockchain", "cryptocurrency"],
  authors: [{ name: "Takeover Team" }],
  viewport: "width=device-width, initial-scale=1",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-gray-50">
          {/* Navigation Header */}
          <header className="bg-white shadow-sm border-b border-gray-200">
            <div className="container mx-auto px-4 py-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center space-x-4">
                  <h1 className="text-2xl font-bold text-gray-900">
                    Takeover System
                  </h1>
                  <nav className="hidden md:flex space-x-6">
                    <a href="/" className="text-gray-600 hover:text-gray-900 transition-colors">
                      Home
                    </a>
                    <a href="/takeovers" className="text-gray-600 hover:text-gray-900 transition-colors">
                      Takeovers
                    </a>
                    <a href="/api/debug" className="text-gray-600 hover:text-gray-900 transition-colors">
                      Debug
                    </a>
                  </nav>
                </div>
                
                <div className="flex items-center space-x-4">
                  <div className="text-sm text-gray-500">
                    {process.env.NEXT_PUBLIC_SOLANA_NETWORK?.toUpperCase() || 'DEVNET'}
                  </div>
                  <div className="h-2 w-2 bg-green-500 rounded-full" title="System Online"></div>
                </div>
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="container mx-auto px-4 py-8">
            {children}
          </main>

          {/* Footer */}
          <footer className="bg-white border-t border-gray-200 mt-16">
            <div className="container mx-auto px-4 py-8">
              <div className="text-center text-gray-600">
                <p>&copy; 2024 Takeover System. Built on Solana.</p>
                <div className="mt-2 text-sm">
                  <a href="/api/debug" className="text-blue-600 hover:text-blue-800">
                    System Status
                  </a>
                  {" | "}
                  <a href="https://solana.com" className="text-blue-600 hover:text-blue-800" target="_blank" rel="noopener noreferrer">
                    Solana Network
                  </a>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}