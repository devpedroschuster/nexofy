// src/components/shared/Loading.jsx
import React from 'react';
import { RefreshCw } from 'lucide-react';

export function Spinner({ size = 24, className = "text-primary" }) {
  return <RefreshCw className={`animate-spin ${className}`} size={size} />;
}

export function TableSkeleton({ rows = 5, cols = 2 }) {
  return (
    <div className="w-full animate-pulse space-y-4 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <div className="h-12 w-12 bg-gray-100 dark:bg-zinc-800 rounded-full transition-colors" />
          <div className="flex-1 space-y-2 py-1">
            {Array.from({ length: cols }).map((_, j) => (
              <div
                key={j}
                className={`h-4 bg-gray-100 dark:bg-zinc-800 rounded transition-colors ${
                  j === 0 ? 'w-1/4' : 'w-3/4'
                }`}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white dark:bg-[#1A1A1A] p-8 rounded-[40px] border border-gray-100 dark:border-zinc-800 shadow-sm h-[180px] flex flex-col justify-between animate-pulse transition-colors">
      <div className="flex justify-between">
        <div className="w-12 h-12 bg-gray-100 dark:bg-zinc-800 rounded-2xl transition-colors" />
        <div className="w-16 h-6 bg-gray-100 dark:bg-zinc-800 rounded-full transition-colors" />
      </div>
      <div>
        <div className="h-8 w-32 bg-gray-100 dark:bg-zinc-800 rounded-lg mb-2 transition-colors" />
        <div className="h-4 w-20 bg-gray-100 dark:bg-zinc-800 rounded-lg transition-colors" />
      </div>
    </div>
  );
}

export function ChartSkeleton() {
  // useState (não useMemo) de propósito: Math.random() é impuro e não deve
  // ser chamado durante o render — só na inicialização preguiçosa do state.
  const [heights] = React.useState(() => Array.from({ length: 7 }, () => Math.random() * 80 + 20));
  return (
    <div className="bg-white dark:bg-[#1A1A1A] p-8 rounded-[40px] border border-gray-100 dark:border-zinc-800 shadow-sm h-[400px] animate-pulse transition-colors">
      <div className="h-6 w-48 bg-gray-100 dark:bg-zinc-800 rounded-lg mb-8 transition-colors" />
      <div className="flex items-end gap-4 h-[300px] pb-4 border-b border-gray-50 dark:border-zinc-800/50 transition-colors">
        {heights.map((h, i) => (
          <div
            key={i}
            className="flex-1 bg-gray-100 dark:bg-zinc-800 rounded-t-lg transition-colors"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}