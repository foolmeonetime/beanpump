import { TakeoversList } from "@/components/takeovers-list"
import { UserClaims } from "@/components/user-claims"
import { WalletMultiButton } from "@/components/wallet-multi-button"
import { WalletDebugInfo } from "@/components/wallet-debug-info"
import { SimpleIDLDebug } from "@/components/simple-idl-debug"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ProgramAccountChecker } from "@/components/program-account-checker";
import { ProgramInspector } from "@/components/program-inspect"

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center space-y-8 py-8">
      
      <div className="text-center max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Community Takeover</h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
          Contribute to community takeovers and migrate from V1 to V2 tokens
        </p>

        <div className="flex justify-center mb-8 gap-4 flex-wrap">
          <WalletMultiButton />
          <Link href="/create">
            <Button>Create New Takeover</Button>
          </Link>
          <Link href="/mint">
            <Button variant="outline">Mint Test Tokens</Button>
          </Link>
        </div>

        {/* Quick Actions Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 max-w-2xl mx-auto">
          <Link href="/create">
            <div className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer">
              <div className="text-2xl mb-2">🚀</div>
              <h3 className="font-semibold mb-1">Create Takeover</h3>
              <p className="text-sm text-gray-500">Start a new community takeover campaign</p>
            </div>
          </Link>
          
          <div className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer">
            <div className="text-2xl mb-2">💰</div>
            <h3 className="font-semibold mb-1">Contribute</h3>
            <p className="text-sm text-gray-500">Support active takeover campaigns</p>
          </div>
          
          <div className="p-4 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer">
            <div className="text-2xl mb-2">🎁</div>
            <h3 className="font-semibold mb-1">Claim Rewards</h3>
            <p className="text-sm text-gray-500">Claim V2 tokens or refunds from completed takeovers</p>
          </div>
        </div>
      </div>

      {/* User-specific claims section */}
      <UserClaims />

      {/* All takeovers list */}
      <TakeoversList />
    </div>
  )
}