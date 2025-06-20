import Link from 'next/link';
import { TakeoversList } from '@/components/takeovers-list';

export default function HomePage() {
  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center py-12 bg-white rounded-lg shadow-sm">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Welcome to Takeover System
        </h1>
        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
          A decentralized platform for Solana token takeovers, enabling community-driven 
          token migrations with built-in safety mechanisms and transparent governance.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/takeovers"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            View All Takeovers
          </Link>
          
          <Link
            href="/api/debug"
            className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            System Status
          </Link>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-lg shadow-sm text-center">
          <div className="text-3xl font-bold text-blue-600 mb-2">🚀</div>
          <div className="text-sm text-gray-600">Active</div>
          <div className="text-2xl font-bold text-gray-900">Takeovers</div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm text-center">
          <div className="text-3xl font-bold text-green-600 mb-2">✅</div>
          <div className="text-sm text-gray-600">Successful</div>
          <div className="text-2xl font-bold text-gray-900">Migrations</div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm text-center">
          <div className="text-3xl font-bold text-purple-600 mb-2">💎</div>
          <div className="text-sm text-gray-600">Billion Scale</div>
          <div className="text-2xl font-bold text-gray-900">Support</div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm text-center">
          <div className="text-3xl font-bold text-orange-600 mb-2">🔄</div>
          <div className="text-sm text-gray-600">V2</div>
          <div className="text-2xl font-bold text-gray-900">Migrations</div>
        </div>
      </div>

      {/* Features Section */}
      <div className="bg-white rounded-lg shadow-sm p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          Platform Features
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-4xl mb-4">🛡️</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Secure</h3>
            <p className="text-gray-600 text-sm">
              Built-in safety mechanisms and transparent on-chain execution
            </p>
          </div>
          
          <div className="text-center">
            <div className="text-4xl mb-4">⚡</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Fast</h3>
            <p className="text-gray-600 text-sm">
              Powered by Solana&apos;s high-performance blockchain
            </p>
          </div>
          
          <div className="text-center">
            <div className="text-4xl mb-4">🌐</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Decentralized</h3>
            <p className="text-gray-600 text-sm">
              Community-driven governance and transparent processes
            </p>
          </div>
          
          <div className="text-center">
            <div className="text-4xl mb-4">📊</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Analytics</h3>
            <p className="text-gray-600 text-sm">
              Real-time tracking and comprehensive reporting
            </p>
          </div>
          
          <div className="text-center">
            <div className="text-4xl mb-4">🔄</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Automated</h3>
            <p className="text-gray-600 text-sm">
              Automated token swaps and liquidity pool creation
            </p>
          </div>
          
          <div className="text-center">
            <div className="text-4xl mb-4">💰</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Rewarding</h3>
            <p className="text-gray-600 text-sm">
              Attractive reward mechanisms for participants
            </p>
          </div>
        </div>
      </div>

      {/* Recent Takeovers */}
      <div>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Recent Takeovers</h2>
          <Link
            href="/takeovers"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            View All →
          </Link>
        </div>
        
        <TakeoversList />
      </div>
    </div>
  );
}