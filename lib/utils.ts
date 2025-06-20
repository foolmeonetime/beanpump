import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Additional utility functions for your takeover platform
export function formatSolAmount(lamports: string | number): string {
  const sol = Number(lamports) / 1_000_000_000;
  if (sol === 0) return "0";
  if (sol < 0.0001) return sol.toExponential(2);
  if (sol < 1) return sol.toFixed(4);
  return sol.toFixed(2);
}

export function formatTimeRemaining(seconds: number): string {
  if (seconds <= 0) return "0s";
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function calculateProgress(current: string | number, target: string | number): number {
  const currentNum = typeof current === 'string' ? Number(current) : current;
  const targetNum = typeof target === 'string' ? Number(target) : target;
  
  if (targetNum === 0) return 0;
  return Math.min((currentNum / targetNum) * 100, 100);
}