"use client";

import React, { useState, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingSpinner } from '@/components/loading-spinner';

interface DiagnosticResults {
  wallet: {
    connected: boolean;
    publicKey: string | null;
    adapter: string | null;
    adapters: string[];
    solBalance: number;
    sufficientForFees: boolean;
  };
  connection: {
    rpcEndpoint: string;
    healthy: boolean;
    currentSlot?: number;
    error?: string;
  };
  api: Record<string, {
    status: 'ok' | 'error';
    responseTime: string;
    httpStatus?: number;
    error?: string;
  }>;
  claimsTest?: {
    status: number;
    ok: boolean;
    dataType: string;
    success?: boolean;
    claimsCount: number;
    error?: string;
    rawPreview: string;
  };
}

interface DiagnosticPanelProps {
  showByDefault?: boolean;
  position?: 'top' | 'bottom';
  compact?: boolean;
}

export function DiagnosticPanel({ 
  showByDefault = false, 
  position = 'bottom',
  compact = false 
}: DiagnosticPanelProps) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [isVisible, setIsVisible] = useState(showByDefault);
  const [diagnostics, setDiagnostics] = useState<DiagnosticResults | null>(null);
  const [testing, setTesting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const runDiagnostics = async () => {
    setTesting(true);
    const results: DiagnosticResults = {
      wallet: {
        connected: false,
        publicKey: null,
        adapter: null,
        adapters: [],
        solBalance: 0,
        sufficientForFees: false
      },
      connection: {
        rpcEndpoint: '',
        healthy: false
      },
      api: {}
    };

    try {
      // 1. Wallet Tests
      results.wallet = {
        connected: !!wallet.connected,
        publicKey: wallet.publicKey?.toString() || null,
        adapter: wallet.wallet?.adapter?.name || null,
        adapters: wallet.wallets?.map(w => w.adapter.name) || [],
        solBalance: 0,
        sufficientForFees: false
      };

      // 2. Connection Tests
      try {
        const slot = await connection.getSlot();
        const rpcHealth = !!slot;
        results.connection = {
          rpcEndpoint: connection.rpcEndpoint,
          healthy: rpcHealth,
          currentSlot: slot
        };
      } catch (connError: any) {
        results.connection = {
          rpcEndpoint: connection.rpcEndpoint,
          healthy: false,
          error: connError.message
        };
      }

      // 3. SOL Balance Test
      if (wallet.publicKey) {
        try {
          const balance = await connection.getBalance(wallet.publicKey);
          results.wallet.solBalance = balance / 1e9;
          results.wallet.sufficientForFees = balance >= 5000;
        } catch (balanceError: any) {
          console.warn('Could not get SOL balance:', balanceError);
        }
      }

      // 4. API Tests
      const apiEndpoints = ['/api/takeovers', '/api/claims', '/api/contributions'];
      
      for (const endpoint of apiEndpoints) {
        try {
          const startTime = Date.now();
          const response = await fetch(endpoint, { 
            method: 'HEAD',
            cache: 'no-store'
          });
          const responseTime = Date.now() - startTime;
          
          results.api[endpoint] = {
            status: response.ok ? 'ok' : 'error',
            responseTime: `${responseTime}ms`,
            httpStatus: response.status,
            ...(response.ok ? {} : { error: `HTTP ${response.status}` })
          };
        } catch (apiError: any) {
          results.api[endpoint] = {
            status: 'error',
            responseTime: '0ms',
            error: apiError.message
          };
        }
      }

      // 5. Claims API Specific Test
      if (wallet.publicKey) {
        try {
          const claimsUrl = `/api/claims?contributor=${wallet.publicKey.toString()}`;
          const claimsResponse = await fetch(claimsUrl, {
            cache: 'no-store',
            headers: { 'Accept': 'application/json' }
          });
          
          const responseText = await claimsResponse.text();
          let claimsData = null;
          
          try {
            claimsData = JSON.parse(responseText);
          } catch (parseError: any) {
            claimsData = { parseError: parseError.message, rawResponse: responseText.slice(0, 200) };
          }
          
          results.claimsTest = {
            status: claimsResponse.status,
            ok: claimsResponse.ok,
            dataType: typeof claimsData,
            success: claimsData?.success,
            claimsCount: claimsData?.claims?.length || 0,
            error: claimsData?.error || null,
            rawPreview: responseText.slice(0, 100)
          };
        } catch (claimsError: any) {
          results.claimsTest = {
            status: 0,
            ok: false,
            dataType: 'error',
            claimsCount: 0,
            error: claimsError.message,
            rawPreview: ''
          };
        }
      }

      setDiagnostics(results);
    } catch (error: any) {
      console.error('Diagnostics failed:', error);
      setDiagnostics({
        ...results,
        connection: {
          ...results.connection,
          error: error.message
        }
      });
    } finally {
      setTesting(false);
    }
  };

  const testTransaction = async () => {
    if (!wallet.publicKey || !wallet.sendTransaction) {
      alert('Wallet not connected');
      return;
    }

    try {
      const { Transaction, TransactionInstruction, PublicKey } = await import('@solana/web3.js');
      
      const transaction = new Transaction();
      
      // Add a memo instruction (safe test)
      const memoInstruction = new TransactionInstruction({
        keys: [],
        programId: new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
        data: Buffer.from('Test transaction from diagnostic tool', 'utf8')
      });
      
      transaction.add(memoInstruction);
      
      // Get fresh blockhash
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey;
      
      // Simulate first
      const simulation = await connection.simulateTransaction(transaction);
      console.log('Transaction simulation:', simulation);
      
      if (simulation.value.err) {
        alert(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}`);
        return;
      }
      
      // If user confirms, send the test transaction
      if (confirm('Send test transaction? (Small fee required)')) {
        const signature = await wallet.sendTransaction(transaction, connection);
        alert(`Test transaction sent successfully! Signature: ${signature}`);
      }
      
    } catch (error: any) {
      console.error('Transaction test failed:', error);
      alert(`Transaction test failed: ${error.message}`);
    }
  };

  useEffect(() => {
    if (isVisible && wallet.connected) {
      runDiagnostics();
    }
  }, [isVisible, wallet.connected, wallet.publicKey]);

  if (!mounted) {
    return null;
  }

  const StatusIndicator = ({ condition, trueText, falseText }: {
    condition: boolean;
    trueText: string;
    falseText: string;
  }) => (
    <Badge variant={condition ? "default" : "destructive"} className="text-xs">
      {condition ? `✅ ${trueText}` : `❌ ${falseText}`}
    </Badge>
  );

  const togglePanel = () => {
    setIsVisible(!isVisible);
    if (!isVisible) {
      runDiagnostics();
    }
  };

  const floatingButtonClass = `
    fixed ${position === 'top' ? 'top-4' : 'bottom-4'} right-4 
    z-50 p-3 bg-blue-600 text-white rounded-full shadow-lg 
    hover:bg-blue-700 transition-all duration-200
    ${isVisible ? 'bg-gray-600' : ''}
  `;

  const panelClass = `
    fixed ${position === 'top' ? 'top-16' : 'bottom-16'} right-4 
    z-40 w-96 max-h-96 overflow-y-auto
    transition-all duration-300 ease-in-out
    ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}
  `;

  return (
    <>
      {/* Floating Debug Button */}
      <Button
        onClick={togglePanel}
        className={floatingButtonClass}
        size="sm"
        title="Toggle Debug Panel"
      >
        🔧
      </Button>

      {/* Debug Panel */}
      <div className={panelClass}>
        <Card className="shadow-xl border-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center justify-between">
              🔧 Debug Panel
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setIsVisible(false)}
              >
                ×
              </Button>
            </CardTitle>
            <CardDescription>System diagnostics and health check</CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {/* Control Buttons */}
            <div className="flex gap-2">
              <Button 
                onClick={runDiagnostics}
                disabled={testing}
                size="sm"
                className="flex-1"
              >
                {testing ? <LoadingSpinner className="w-3 h-3" /> : '🔄'} Test
              </Button>
              
              <Button 
                onClick={testTransaction}
                disabled={!wallet.connected}
                size="sm"
                variant="outline"
                className="flex-1"
              >
                📤 TX Test
              </Button>
            </div>

            {/* Quick Status Overview */}
            {diagnostics && (
              <div className="grid grid-cols-1 gap-2">
                <StatusIndicator 
                  condition={diagnostics.wallet.connected} 
                  trueText="Wallet OK" 
                  falseText="No Wallet" 
                />
                <StatusIndicator 
                  condition={diagnostics.connection.healthy} 
                  trueText="RPC OK" 
                  falseText="RPC Error" 
                />
                <StatusIndicator 
                  condition={diagnostics.wallet.sufficientForFees} 
                  trueText="SOL OK" 
                  falseText="Low SOL" 
                />
                <StatusIndicator 
                  condition={diagnostics.claimsTest?.ok || false} 
                  trueText="API OK" 
                  falseText="API Error" 
                />
              </div>
            )}

            {/* Detailed Results */}
            {diagnostics && !compact && (
              <div className="space-y-3 text-xs">
                {/* Wallet Details */}
                <div className="p-2 bg-gray-50 rounded">
                  <div className="font-medium mb-1">Wallet</div>
                  <div>Adapter: {diagnostics.wallet.adapter || 'None'}</div>
                  <div>SOL: {diagnostics.wallet.solBalance.toFixed(6)}</div>
                  <div>Connected: {diagnostics.wallet.connected ? 'Yes' : 'No'}</div>
                </div>

                {/* Connection Details */}
                <div className="p-2 bg-gray-50 rounded">
                  <div className="font-medium mb-1">Network</div>
                  <div>RPC: {diagnostics.connection.rpcEndpoint.slice(-20)}...</div>
                  <div>Slot: {diagnostics.connection.currentSlot || 'Error'}</div>
                  <div>Health: {diagnostics.connection.healthy ? 'Good' : 'Bad'}</div>
                </div>

                {/* API Status */}
                <div className="p-2 bg-gray-50 rounded">
                  <div className="font-medium mb-1">APIs</div>
                  {Object.entries(diagnostics.api).map(([endpoint, status]) => (
                    <div key={endpoint} className="flex justify-between">
                      <span>{endpoint.split('/').pop()}:</span>
                      <span className={status.status === 'ok' ? 'text-green-600' : 'text-red-600'}>
                        {status.status === 'ok' ? '✓' : '✗'} {status.responseTime}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Claims Test Result */}
                {diagnostics.claimsTest && (
                  <div className="p-2 bg-gray-50 rounded">
                    <div className="font-medium mb-1">Claims API</div>
                    <div>Status: {diagnostics.claimsTest.status}</div>
                    <div>Claims: {diagnostics.claimsTest.claimsCount}</div>
                    {diagnostics.claimsTest.error && (
                      <div className="text-red-600">Error: {diagnostics.claimsTest.error}</div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Error Alerts */}
            {diagnostics && (
              <>
                {!diagnostics.wallet.sufficientForFees && diagnostics.wallet.connected && (
                  <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                    ⚠️ Low SOL balance. Need at least 0.000005 SOL for fees.
                  </div>
                )}

                {!diagnostics.connection.healthy && (
                  <div className="p-2 bg-red-50 border border-red-200 rounded text-xs">
                    🚨 RPC connection issues. Try switching endpoints.
                  </div>
                )}

                {diagnostics.claimsTest?.error && (
                  <div className="p-2 bg-red-50 border border-red-200 rounded text-xs">
                    🚨 Claims API error: {diagnostics.claimsTest.error}
                  </div>
                )}
              </>
            )}

            {/* Instructions */}
            {!compact && (
              <div className="text-xs text-gray-500 p-2 bg-gray-50 rounded">
                <div className="font-medium mb-1">Usage:</div>
                <div>• Click &quot;Test&quot; to run diagnostics</div>
                <div>• Click &quot;TX Test&quot; to test wallet transactions</div>
                <div>• Red indicators show issues to investigate</div>
                <div>• Check browser console for detailed logs</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

// Simplified version for embedding in pages
export function InlineDebugPanel() {
  return <DiagnosticPanel compact={true} showByDefault={true} />;
}

// Hook for programmatic diagnostics
export function useDiagnostics() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [lastResults, setLastResults] = useState<DiagnosticResults | null>(null);

  const runQuickCheck = async () => {
    const results: Partial<DiagnosticResults> = {
      wallet: {
        connected: !!wallet.connected,
        publicKey: wallet.publicKey?.toString() || null,
        adapter: wallet.wallet?.adapter?.name || null,
        adapters: wallet.wallets?.map(w => w.adapter.name) || [],
        solBalance: 0,
        sufficientForFees: false
      }
    };

    if (wallet.publicKey) {
      try {
        const balance = await connection.getBalance(wallet.publicKey);
        results.wallet!.solBalance = balance / 1e9;
        results.wallet!.sufficientForFees = balance >= 5000;
      } catch (error) {
        console.warn('Quick balance check failed:', error);
      }
    }

    setLastResults(results as DiagnosticResults);
    return results;
  };

  return {
    lastResults,
    runQuickCheck,
    hasIssues: () => {
      if (!lastResults) return false;
      return !lastResults.wallet.connected || 
             !lastResults.wallet.sufficientForFees ||
             !lastResults.connection?.healthy;
    }
  };
}