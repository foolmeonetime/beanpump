import './globals.css'
import { Inter } from 'next/font/google'
import { WalletContextProvider } from './providers/wallet-provider'
import { ThemeProvider } from '@/components/theme-provider'
import { Header } from '@/components/header'
import { Toaster } from '@/components/ui/toaster'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Community Takeover',
  description: 'Decentralized token migration platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
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
              <main className="container mx-auto px-4">
                {children}
              </main>
            </div>
            <Toaster />
          </WalletContextProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}