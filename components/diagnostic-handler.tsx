"use client";

import { useState, useEffect } from 'react';
import { DiagnosticPanel } from './diagnostic-panel';

export function DiagnosticHandler() {
  const [showDebug, setShowDebug] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Check environment and URL parameters
    const isDevelopment = process.env.NODE_ENV === 'development';
    const urlParams = new URLSearchParams(window.location.search);
    const debugMode = urlParams.get('debug') === 'true';
    
    // Show debug panel in development or when debug=true in URL
    setShowDebug(isDevelopment || debugMode);
  }, []);

  // Don't render on server side to avoid hydration mismatch
  if (!mounted) {
    return null;
  }

  // Only render diagnostic panel if conditions are met
  if (!showDebug) {
    return null;
  }

  return <DiagnosticPanel position="bottom" />;
}