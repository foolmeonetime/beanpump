import { RawTakeoverData } from './takeover-calculations';

export interface TimestampInfo {
  startTime: number;
  endTime: number;
  currentTime: number;
  duration: number;
  timeElapsed: number;
  timeRemaining: number;
  isStarted: boolean;
  isExpired: boolean;
  progressPercent: number;
}

export interface FormattedTimeInfo {
  startDate: string;
  endDate: string;
  currentDate: string;
  timeRemainingFormatted: string;
  durationFormatted: string;
  status: 'upcoming' | 'active' | 'expired';
}

/**
 * Parse timestamp from various formats
 */
export function parseTimestamp(value: any): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const num = parseInt(value, 10);
    return isNaN(num) ? 0 : num;
  }
  if (typeof value === 'bigint') return Number(value);
  return 0;
}

/**
 * Get current Unix timestamp in seconds
 */
export function getCurrentTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

/**
 * Calculate timestamp information for a takeover
 */
export function calculateTimestampInfo(rawTakeover: RawTakeoverData): TimestampInfo {
  const startTime = parseTimestamp(rawTakeover.start_time);
  const endTime = parseTimestamp(rawTakeover.end_time);
  const currentTime = getCurrentTimestamp();
  
  const duration = endTime - startTime;
  const timeElapsed = Math.max(0, currentTime - startTime);
  const timeRemaining = Math.max(0, endTime - currentTime);
  
  const isStarted = currentTime >= startTime;
  const isExpired = currentTime > endTime;
  
  // Calculate progress percentage (0-100)
  let progressPercent = 0;
  if (duration > 0 && isStarted) {
    progressPercent = Math.min(100, (timeElapsed / duration) * 100);
  }
  
  return {
    startTime,
    endTime,
    currentTime,
    duration,
    timeElapsed,
    timeRemaining,
    isStarted,
    isExpired,
    progressPercent,
  };
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return '0 seconds';
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  
  const parts: string[] = [];
  
  if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
  if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
  if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
  if (remainingSeconds > 0 && parts.length < 2) {
    parts.push(`${remainingSeconds} second${remainingSeconds !== 1 ? 's' : ''}`);
  }
  
  return parts.slice(0, 2).join(', ');
}

/**
 * Format timestamp as readable date
 */
export function formatTimestamp(timestamp: number, options: Intl.DateTimeFormatOptions = {}): string {
  if (timestamp <= 0) return 'Invalid date';
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
    ...options,
  };
  
  return new Date(timestamp * 1000).toLocaleDateString('en-US', defaultOptions);
}

/**
 * Get formatted time information for display
 */
export function getFormattedTimeInfo(rawTakeover: RawTakeoverData): FormattedTimeInfo {
  const timestampInfo = calculateTimestampInfo(rawTakeover);
  
  const startDate = formatTimestamp(timestampInfo.startTime);
  const endDate = formatTimestamp(timestampInfo.endTime);
  const currentDate = formatTimestamp(timestampInfo.currentTime);
  
  const timeRemainingFormatted = timestampInfo.isExpired 
    ? 'Expired' 
    : formatDuration(timestampInfo.timeRemaining);
  
  const durationFormatted = formatDuration(timestampInfo.duration);
  
  let status: 'upcoming' | 'active' | 'expired';
  if (timestampInfo.isExpired) {
    status = 'expired';
  } else if (timestampInfo.isStarted) {
    status = 'active';
  } else {
    status = 'upcoming';
  }
  
  return {
    startDate,
    endDate,
    currentDate,
    timeRemainingFormatted,
    durationFormatted,
    status,
  };
}

/**
 * Check if a takeover is active
 */
export function isTakeoverActive(rawTakeover: RawTakeoverData): boolean {
  const timestampInfo = calculateTimestampInfo(rawTakeover);
  return timestampInfo.isStarted && !timestampInfo.isExpired;
}

/**
 * Check if a takeover has expired
 */
export function isTakeoverExpired(rawTakeover: RawTakeoverData): boolean {
  const timestampInfo = calculateTimestampInfo(rawTakeover);
  return timestampInfo.isExpired;
}

/**
 * Get time until start for upcoming takeovers
 */
export function getTimeUntilStart(rawTakeover: RawTakeoverData): number {
  const startTime = parseTimestamp(rawTakeover.start_time);
  const currentTime = getCurrentTimestamp();
  return Math.max(0, startTime - currentTime);
}

/**
 * Create a countdown timer string
 */
export function createCountdownString(rawTakeover: RawTakeoverData): string {
  const timestampInfo = calculateTimestampInfo(rawTakeover);
  
  if (timestampInfo.isExpired) {
    return 'Expired';
  }
  
  if (!timestampInfo.isStarted) {
    const timeUntilStart = getTimeUntilStart(rawTakeover);
    return `Starts in ${formatDuration(timeUntilStart)}`;
  }
  
  return `${formatDuration(timestampInfo.timeRemaining)} remaining`;
}

/**
 * Validate timestamp range
 */
export function validateTimestampRange(startTime: number, endTime: number): boolean {
  if (startTime <= 0 || endTime <= 0) return false;
  if (startTime >= endTime) return false;
  
  const currentTime = getCurrentTimestamp();
  if (endTime <= currentTime) return false; // End time is in the past
  
  const maxDuration = 365 * 24 * 60 * 60; // 1 year in seconds
  if (endTime - startTime > maxDuration) return false; // Duration too long
  
  return true;
}

/**
 * Get suggested end time based on start time and duration type
 */
export function getSuggestedEndTime(startTime: number, durationType: 'hours' | 'days' | 'weeks'): number {
  const durations = {
    hours: 3600,
    days: 86400,
    weeks: 604800,
  };
  
  const duration = durations[durationType] || durations.days;
  return startTime + duration;
}

/**
 * Convert timestamp to ISO string
 */
export function timestampToISO(timestamp: number): string {
  if (timestamp <= 0) return '';
  return new Date(timestamp * 1000).toISOString();
}

/**
 * Convert ISO string to timestamp
 */
export function isoToTimestamp(isoString: string): number {
  if (!isoString) return 0;
  const date = new Date(isoString);
  return Math.floor(date.getTime() / 1000);
}

/**
 * Get timezone offset in seconds
 */
export function getTimezoneOffset(): number {
  return new Date().getTimezoneOffset() * 60;
}

/**
 * Adjust timestamp for local timezone
 */
export function adjustForTimezone(timestamp: number): number {
  return timestamp - getTimezoneOffset();
}

/**
 * Constants for common durations
 */
export const DURATION_CONSTANTS = {
  MINUTE: 60,
  HOUR: 3600,
  DAY: 86400,
  WEEK: 604800,
  MONTH: 2629746, // Average month (30.44 days)
  YEAR: 31556952, // Average year (365.25 days)
} as const;