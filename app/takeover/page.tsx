"use client";

import { TakeoversList } from '@/components/takeovers-list';

export default function TakeoversPage() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          All Takeovers
        </h1>
        <p className="text-gray-600 max-w-2xl mx-auto">
          Browse all active, completed, and upcoming token takeovers. 
          Participate in community-driven token migrations with built-in safety mechanisms.
        </p>
      </div>
      
      <TakeoversList />
    </div>
  );
}