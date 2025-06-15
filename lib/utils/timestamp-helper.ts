export function normalizeTimestamp(value: any): string {
  if (value === null || value === undefined) {
    return '0';
  }
  
  // If it's already a string, return it
  if (typeof value === 'string') {
    return value;
  }
  
  // If it's a number or bigint, convert to string
  if (typeof value === 'number' || typeof value === 'bigint') {
    return value.toString();
  }
  
  // If it's a Date object, convert to Unix timestamp
  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000).toString();
  }
  
  // Fallback
  return '0';
}

export function createTimestamp(): string {
  return Math.floor(Date.now() / 1000).toString();
}

export function createFutureTimestamp(daysFromNow: number): string {
  const future = Date.now() + (daysFromNow * 24 * 60 * 60 * 1000);
  return Math.floor(future / 1000).toString();
}

// Update your takeover-calculations.ts to use this helper:

// In processTakeoverCalculations function, replace timestamp handling with:
const startTime = normalizeTimestamp(rawTakeover.start_time);
const endTime = normalizeTimestamp(rawTakeover.end_time);