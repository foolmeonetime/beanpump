import { TakeoversList } from "@/components/takeovers-list"
import { WalletMultiButton } from "@/components/wallet-multi-button"
import { WalletDebugInfo } from "@/components/wallet-debug-info" // Add this import
import { SimpleIDLDebug } from "@/components/simple-idl-debug"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ProgramAccountChecker } from "@/components/program-account-checker";
import { ProgramInspector } from "@/components/program-inspect"

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center space-y-8 py-8">
      
      <div className="text-center max-w-3xl mx-auto">
        <h1 className="text-4xl font-bold tracking-tight mb-4">Unpump Fun</h1>
        <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
          Contribute to community takeovers and migrate from V1 to V2 tokens
        </p>

        <div className="flex justify-center mb-8 gap-4">
          <WalletMultiButton />
          <Link href="/create">
            <Button>Create New Takeover</Button>
          </Link>
        </div>
      </div>

      <TakeoversList />
    </div>
  )
}