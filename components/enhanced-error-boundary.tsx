"use client";

import React, { Component, ReactNode, ErrorInfo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/components/ui/use-toast";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string;
  retryCount: number;
  lastErrorTime: number;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: React.ComponentType<ErrorFallbackProps>;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  isolateErrors?: boolean;
  maxRetries?: number;
  resetTimeWindow?: number; // Reset retry count after this many ms
}

interface ErrorFallbackProps {
  error: Error;
  errorInfo: ErrorInfo | null;
  onRetry: () => void;
  onReset: () => void;
  onReport: () => void;
  retryCount: number;
  canRetry: boolean;
  suggestions: string[];
}

export class EnhancedErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private retryTimeout: NodeJS.Timeout | null = null;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
      retryCount: 0,
      lastErrorTime: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      lastErrorTime: Date.now()
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const now = Date.now();
    const { resetTimeWindow = 300000 } = this.props; // 5 minutes default

    // Reset retry count if enough time has passed
    const shouldResetRetries = now - this.state.lastErrorTime > resetTimeWindow;

    this.setState(prevState => ({
      errorInfo,
      retryCount: shouldResetRetries ? 1 : prevState.retryCount + 1,
      lastErrorTime: now
    }));

    // Log error with enhanced context
    this.logError(error, errorInfo);

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Send to error reporting service (placeholder)
    this.reportError(error, errorInfo);
  }

  private logError = (error: Error, errorInfo: ErrorInfo) => {
    const errorContext = {
      errorId: this.state.errorId,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      },
      componentStack: errorInfo.componentStack,
      retryCount: this.state.retryCount,
      props: this.props.isolateErrors ? '[ISOLATED]' : Object.keys(this.props)
    };

    console.group(`🚨 Error Boundary Caught Error [${this.state.errorId}]`);
    console.error('Error:', error);
    console.error('Error Info:', errorInfo);
    console.error('Full Context:', errorContext);
    console.groupEnd();

    // Store in session storage for debugging
    try {
      const existingErrors = JSON.parse(sessionStorage.getItem('app_errors') || '[]');
      existingErrors.push(errorContext);
      // Keep only last 10 errors
      if (existingErrors.length > 10) {
        existingErrors.splice(0, existingErrors.length - 10);
      }
      sessionStorage.setItem('app_errors', JSON.stringify(existingErrors));
    } catch {
      // Silent fail if session storage is unavailable
    }
  };

  private reportError = async (error: Error, errorInfo: ErrorInfo) => {
    try {
      // In a real app, this would send to your error reporting service
      const errorReport = {
        errorId: this.state.errorId,
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        retryCount: this.state.retryCount
      };

      console.log('📊 Would report error to service:', errorReport);
      
      // Example: Send to your error reporting endpoint
      // await fetch('/api/errors', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(errorReport)
      // });
    } catch (reportingError) {
      console.error('Failed to report error:', reportingError);
    }
  };

  private handleRetry = () => {
    const { maxRetries = 3 } = this.props;

    if (this.state.retryCount >= maxRetries) {
      console.warn(`Max retries (${maxRetries}) exceeded for error ${this.state.errorId}`);
      return;
    }

    console.log(`🔄 Retrying component (attempt ${this.state.retryCount + 1}/${maxRetries})`);

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: ''
    });
  };

  private handleReset = () => {
    console.log('🔄 Resetting error boundary state');

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: '',
      retryCount: 0,
      lastErrorTime: 0
    });

    // Clear any pending retry timeouts
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
  };

  private handleReport = () => {
    if (this.state.error && this.state.errorInfo) {
      this.reportError(this.state.error, this.state.errorInfo);
      
      // Show user feedback - Note: This would need to be called from a component with toast context
      console.log(`Error ${this.state.errorId} has been reported to our team.`);
    }
  };

  private getSuggestions = (): string[] => {
    const { error } = this.state;
    const suggestions: string[] = [];

    if (!error) return suggestions;

    // Analyze error and provide specific suggestions
    if (error.message.includes('wallet')) {
      suggestions.push('Try reconnecting your wallet');
      suggestions.push('Check if your wallet extension is enabled');
      suggestions.push('Refresh the page and try again');
    }

    if (error.message.includes('network') || error.message.includes('fetch')) {
      suggestions.push('Check your internet connection');
      suggestions.push('Try refreshing the page');
      suggestions.push('The API might be temporarily unavailable');
    }

    if (error.message.includes('timeout')) {
      suggestions.push('The request took too long - try again');
      suggestions.push('Check your network connection');
      suggestions.push('The blockchain might be experiencing delays');
    }

    if (error.message.includes('transaction')) {
      suggestions.push('Check your wallet for any pending transactions');
      suggestions.push('Ensure you have enough SOL for transaction fees');
      suggestions.push('Try increasing the priority fee');
    }

    if (error.name === 'ChunkLoadError' || error.message.includes('Loading chunk')) {
      suggestions.push('Clear your browser cache and refresh');
      suggestions.push('Try using a different browser');
      suggestions.push('The app may have been updated - please refresh');
    }

    if (error.stack && error.stack.includes('Claim')) {
      suggestions.push('Check if the claim period is still active');
      suggestions.push('Verify you have claimable tokens');
      suggestions.push('Try refreshing your claims data');
    }

    // Default suggestions if no specific ones match
    if (suggestions.length === 0) {
      suggestions.push('Try refreshing the page');
      suggestions.push('Clear your browser cache');
      suggestions.push('Try using a different browser');
      suggestions.push('Contact support if the problem persists');
    }

    return suggestions;
  };

  componentWillUnmount() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
  }

  render() {
    if (this.state.hasError) {
      const { maxRetries = 3 } = this.props;
      const canRetry = this.state.retryCount < maxRetries;
      const suggestions = this.getSuggestions();

      // Use custom fallback component if provided
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return (
          <FallbackComponent
            error={this.state.error!}
            errorInfo={this.state.errorInfo}
            onRetry={this.handleRetry}
            onReset={this.handleReset}
            onReport={this.handleReport}
            retryCount={this.state.retryCount}
            canRetry={canRetry}
            suggestions={suggestions}
          />
        );
      }

      // Default error UI
      return (
        <DefaultErrorFallback
          error={this.state.error!}
          errorInfo={this.state.errorInfo}
          onRetry={this.handleRetry}
          onReset={this.handleReset}
          onReport={this.handleReport}
          retryCount={this.state.retryCount}
          canRetry={canRetry}
          suggestions={suggestions}
        />
      );
    }

    return this.props.children;
  }
}

// ✅ ENHANCED: Default error fallback with comprehensive recovery options
const DefaultErrorFallback: React.FC<ErrorFallbackProps> = ({
  error,
  errorInfo,
  onRetry,
  onReset,
  onReport,
  retryCount,
  canRetry,
  suggestions
}) => {
  const isDevelopment = process.env.NODE_ENV === 'development';

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="text-red-800 flex items-center gap-2">
            🚨 Something went wrong
            <span className="text-sm font-normal text-red-600">
              (Attempt {retryCount}/3)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTitle>Error Details</AlertTitle>
            <AlertDescription className="font-mono text-sm">
              {error.name}: {error.message}
            </AlertDescription>
          </Alert>

          {/* Recovery Actions */}
          <div className="flex flex-wrap gap-2">
            {canRetry && (
              <Button onClick={onRetry} variant="default">
                🔄 Try Again
              </Button>
            )}
            <Button onClick={onReset} variant="outline">
              🔄 Reset Page
            </Button>
            <Button onClick={() => window.location.reload()} variant="outline">
              🔄 Refresh Browser
            </Button>
            <Button onClick={onReport} variant="outline">
              📊 Report Error
            </Button>
          </div>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div className="bg-white p-4 rounded border border-red-200">
              <h4 className="font-semibold text-red-800 mb-2">💡 Try these solutions:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm text-red-700">
                {suggestions.map((suggestion, index) => (
                  <li key={index}>{suggestion}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="bg-white border-red-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-red-800">🏠 Navigation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button 
                  onClick={() => window.location.href = '/'} 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                >
                  Go to Home
                </Button>
                <Button 
                  onClick={() => window.location.href = '/claims'} 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                >
                  View Claims
                </Button>
                <Button 
                  onClick={() => window.location.href = '/takeovers'} 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                >
                  Browse Takeovers
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-white border-red-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-red-800">🛠️ Troubleshooting</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button 
                  onClick={() => {
                    localStorage.clear();
                    sessionStorage.clear();
                    window.location.reload();
                  }}
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                >
                  Clear Cache & Reload
                </Button>
                <Button 
                  onClick={() => window.open('https://docs.solana.com/wallet-guide', '_blank')}
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                >
                  Wallet Help
                </Button>
                <Button 
                  onClick={() => {
                    const errors = sessionStorage.getItem('app_errors');
                    if (errors) {
                      navigator.clipboard.writeText(errors);
                      alert('Error logs copied to clipboard');
                    }
                  }}
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                >
                  Copy Error Logs
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Developer Information */}
          {isDevelopment && errorInfo && (
            <details className="bg-gray-100 p-4 rounded border">
              <summary className="cursor-pointer font-semibold text-gray-800">
                🔧 Developer Information (Development Mode)
              </summary>
              <div className="mt-2 space-y-2">
                <div>
                  <strong>Error Stack:</strong>
                  <pre className="text-xs bg-gray-200 p-2 rounded overflow-auto max-h-40">
                    {error.stack}
                  </pre>
                </div>
                <div>
                  <strong>Component Stack:</strong>
                  <pre className="text-xs bg-gray-200 p-2 rounded overflow-auto max-h-40">
                    {errorInfo.componentStack}
                  </pre>
                </div>
              </div>
            </details>
          )}

          {/* Help Links */}
          <div className="flex flex-wrap gap-4 text-sm text-red-600">
            <a 
              href="mailto:support@yourapp.com" 
              className="hover:underline"
            >
              📧 Email Support
            </a>
            <a 
              href="/docs/troubleshooting" 
              className="hover:underline"
            >
              📚 Troubleshooting Guide
            </a>
            <a 
              href="/status" 
              className="hover:underline"
            >
              🟢 System Status
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// ✅ ENHANCED: Specialized error boundaries for different contexts
export const WalletErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <EnhancedErrorBoundary
      maxRetries={5}
      resetTimeWindow={60000} // 1 minute
      fallback={({ error, onRetry, onReset, canRetry, suggestions }) => (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader>
            <CardTitle className="text-yellow-800">🔌 Wallet Connection Issue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertDescription>
                {error.message}
              </AlertDescription>
            </Alert>
            
            <div className="space-y-2">
              <h4 className="font-semibold text-yellow-800">Quick Fixes:</h4>
              <ul className="list-disc list-inside text-sm text-yellow-700">
                <li>Refresh the page and reconnect your wallet</li>
                <li>Check if your wallet extension is enabled</li>
                <li>Try switching to a different wallet</li>
                <li>Clear your browser cache and cookies</li>
              </ul>
            </div>
            
            <div className="flex gap-2">
              {canRetry && (
                <Button onClick={onRetry} variant="default">
                  Reconnect Wallet
                </Button>
              )}
              <Button onClick={() => window.location.reload()} variant="outline">
                Refresh Page
              </Button>
              <Button onClick={onReset} variant="outline">
                Reset Connection
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    >
      {children}
    </EnhancedErrorBoundary>
  );
};

export const TransactionErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <EnhancedErrorBoundary
      maxRetries={3}
      resetTimeWindow={120000} // 2 minutes
      fallback={({ error, onRetry, onReset, canRetry }) => (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader>
            <CardTitle className="text-orange-800">⚡ Transaction Failed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertDescription>
                {error.message}
              </AlertDescription>
            </Alert>
            
            <div className="space-y-2">
              <h4 className="font-semibold text-orange-800">Common Solutions:</h4>
              <ul className="list-disc list-inside text-sm text-orange-700">
                <li>Check your SOL balance for transaction fees</li>
                <li>Wait for network congestion to clear</li>
                <li>Try increasing the priority fee</li>
                <li>Check if the transaction already completed</li>
              </ul>
            </div>
            
            <div className="flex gap-2">
              {canRetry && (
                <Button onClick={onRetry} variant="default">
                  Retry Transaction
                </Button>
              )}
              <Button onClick={() => window.open('https://explorer.solana.com', '_blank')} variant="outline">
                Check Solana Explorer
              </Button>
              <Button onClick={onReset} variant="outline">
                Start Over
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    >
      {children}
    </EnhancedErrorBoundary>
  );
};

export const ClaimsErrorBoundary: React.FC<{ children: ReactNode }> = ({ children }) => {
  return (
    <EnhancedErrorBoundary
      maxRetries={5}
      resetTimeWindow={180000} // 3 minutes
      fallback={({ error, onRetry, onReset, canRetry }) => (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-blue-800">🎁 Claims Processing Issue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertDescription>
                {error.message}
              </AlertDescription>
            </Alert>
            
            <div className="space-y-2">
              <h4 className="font-semibold text-blue-800">Possible Causes:</h4>
              <ul className="list-disc list-inside text-sm text-blue-700">
                <li>Claims may not be ready yet (takeover needs to be finalized)</li>
                <li>You may have already claimed these tokens</li>
                <li>Network congestion causing delays</li>
                <li>Temporary API issues</li>
              </ul>
            </div>
            
            <div className="flex gap-2">
              {canRetry && (
                <Button onClick={onRetry} variant="default">
                  Retry Claims
                </Button>
              )}
              <Button onClick={() => window.location.href = '/claims'} variant="outline">
                Refresh Claims
              </Button>
              <Button onClick={onReset} variant="outline">
                Reset Claims View
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    >
      {children}
    </EnhancedErrorBoundary>
  );
};

// ✅ ADDED: Hook for manual error reporting
export const useErrorReporting = () => {
  const reportError = async (error: Error, context?: any) => {
    try {
      const errorReport = {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        context
      };

      console.log('📊 Manual error report:', errorReport);
      
      // In a real app, send to your error reporting service
      // await fetch('/api/errors', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(errorReport)
      // });

      return { success: true };
    } catch (reportingError) {
      console.error('Failed to report error:', reportingError);
      return { success: false, error: reportingError };
    }
  };

  return { reportError };
};

// ✅ ADDED: Error monitoring hook
export const useErrorMonitoring = () => {
  const getErrorStats = () => {
    try {
      const errors = JSON.parse(sessionStorage.getItem('app_errors') || '[]');
      const now = Date.now();
      const oneHourAgo = now - (60 * 60 * 1000);
      
      const recentErrors = errors.filter((error: any) => 
        new Date(error.timestamp).getTime() > oneHourAgo
      );

      return {
        totalErrors: errors.length,
        recentErrors: recentErrors.length,
        errorTypes: [...new Set(errors.map((e: any) => e.error?.name || 'Unknown'))],
        lastError: errors[errors.length - 1] || null
      };
    } catch {
      return {
        totalErrors: 0,
        recentErrors: 0,
        errorTypes: [],
        lastError: null
      };
    }
  };

  const clearErrorHistory = () => {
    try {
      sessionStorage.removeItem('app_errors');
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  };

  return { getErrorStats, clearErrorHistory };
};