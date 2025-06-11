import { TakeoversList } from "@/components/takeovers-list"
import { UserClaims } from "@/components/user-claims"
import { ManualFinalize } from "@/components/manual-finalize"
import { WalletMultiButton } from "@/components/wallet-multi-button"
import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center space-y-8 py-8">
      
      <div className="text-center max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          🚀 Community Takeover Platform
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 mb-4">
          Decentralized token migration with enhanced safety features and manual finalization
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">
          ✨ Enhanced with manual finalization, conservative reward rates, and overflow protection
        </p>

        <div className="flex justify-center mb-8 gap-4 flex-wrap">
          <WalletMultiButton />
          <Link href="/create">
            <Button className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700">
              🚀 Create Takeover
            </Button>
          </Link>
          <Link href="/mint">
            <Button variant="outline">
              🪙 Mint Test Tokens
            </Button>
          </Link>
        </div>

        {/* Enhanced Features Showcase */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 max-w-4xl mx-auto">
          <Link href="/create">
            <div className="p-6 border border-purple-200 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-950 transition-colors cursor-pointer group">
              <div className="text-3xl mb-3 group-hover:scale-110 transition-transform">🚀</div>
              <h3 className="font-semibold mb-2 text-purple-800 dark:text-purple-200">Create Campaign</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Launch secure takeover campaigns with built-in safety features
              </p>
            </div>
          </Link>
          
          <div className="p-6 border border-green-200 rounded-lg hover:bg-green-50 dark:hover:bg-green-950 transition-colors cursor-pointer group">
            <div className="text-3xl mb-3 group-hover:scale-110 transition-transform">💰</div>
            <h3 className="font-semibold mb-2 text-green-800 dark:text-green-200">Safe Contribute</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Contribute with overflow protection and safety mechanisms
            </p>
          </div>
          
          <div className="p-6 border border-blue-200 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors cursor-pointer group">
            <div className="text-3xl mb-3 group-hover:scale-110 transition-transform">🎁</div>
            <h3 className="font-semibold mb-2 text-blue-800 dark:text-blue-200">Enhanced Rewards</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Claim V2 tokens with conservative reward rates
            </p>
          </div>

          <div className="p-6 border border-orange-200 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-950 transition-colors cursor-pointer group">
            <div className="text-3xl mb-3 group-hover:scale-110 transition-transform">⚡</div>
            <h3 className="font-semibold mb-2 text-orange-800 dark:text-orange-200">Manual Control</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Manual finalization with creator control
            </p>
          </div>
        </div>

        {/* Safety Features */}
        <div className="p-6 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950 rounded-lg mb-8 max-w-4xl mx-auto">
          <h2 className="text-xl font-bold mb-4 text-blue-800 dark:text-blue-200">
            🛡️ Enhanced Safety Features
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center">
              <div className="font-semibold text-blue-700 dark:text-blue-300">Manual Finalization</div>
              <div className="text-gray-600 dark:text-gray-400">Creator-controlled completion</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-purple-700 dark:text-purple-300">Overflow Protection</div>
              <div className="text-gray-600 dark:text-gray-400">Built-in safety limits</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-green-700 dark:text-green-300">Conservative Rates</div>
              <div className="text-gray-600 dark:text-gray-400">Sustainable reward systems</div>
            </div>
            <div className="text-center">
              <div className="font-semibold text-orange-700 dark:text-orange-300">Enhanced Security</div>
              <div className="text-gray-600 dark:text-gray-400">Advanced safety checks</div>
            </div>
          </div>
        </div>
      </div>

      {/* Manual finalization component */}
      <ManualFinalize />

      {/* User-specific claims section */}
      <UserClaims />

      {/* All takeovers list */}
      <TakeoversList />
    </div>
  )
}