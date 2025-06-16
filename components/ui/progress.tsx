"use client";

import * as React from "react";

interface ProgressProps {
  value?: number;
  className?: string;
}

export const Progress: React.FC<ProgressProps> = ({ value = 0, className = "" }) => {
  const clampedValue = Math.min(100, Math.max(0, value));
  
  return (
    <div className={`relative h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700 ${className}`}>
      <div
        className="h-full bg-blue-600 dark:bg-blue-500 transition-all duration-300 ease-in-out rounded-full"
        style={{ width: `${clampedValue}%` }}
      />
    </div>
  );
};