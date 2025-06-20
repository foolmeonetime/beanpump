import { Inter } from 'next/font/google'
import './globals.css'
import { WalletContextProvider } from '@/app/providers/wallet-provider'
import { Toaster } from '@/components/ui/toaster' // Changed from ToastProvider

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'Takeover System',
  description: 'Solana token takeover system',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <WalletContextProvider>
          {children}
          <Toaster /> {/* Use Toaster instead of ToastProvider */}
        </WalletContextProvider>
      </body>
    </html>
  )
}