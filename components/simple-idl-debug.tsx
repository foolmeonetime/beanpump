"use client";
import { idl } from "@/lib/program";

export function SimpleIDLDebug() {
  return (
    <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg text-sm mb-4">
      <h3 className="font-bold mb-2">IDL Status:</h3>
      <div className="space-y-1">
        <p>IDL loaded: {idl ? '✅ Yes' : '❌ No'}</p>
        <p>Program name: {idl?.metadata?.name || 'Unknown'}</p>
        <p>Instructions count: {idl?.instructions?.length || 0}</p>
        {idl?.instructions && (
          <p>Available methods: {idl.instructions.map((i: any) => i.name).join(', ')}</p>
        )}
      </div>
    </div>
  );
}