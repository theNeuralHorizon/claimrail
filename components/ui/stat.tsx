import * as React from 'react';
import { cn } from '@/lib/utils';

export interface StatProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  trend?: { delta: number; label?: string } | null;
  icon?: React.ReactNode;
  tone?: 'default' | 'success' | 'warn' | 'danger';
  className?: string;
}

export function Stat({
  label,
  value,
  hint,
  trend,
  icon,
  tone = 'default',
  className,
}: StatProps) {
  const toneClasses: Record<string, string> = {
    default: 'bg-white',
    success: 'bg-gradient-to-br from-brand-50/60 to-white border-brand-200/60',
    warn: 'bg-gradient-to-br from-warn-50/60 to-white border-amber-200/60',
    danger: 'bg-gradient-to-br from-danger-50/60 to-white border-red-200/60',
  };

  return (
    <div
      className={cn(
        'rounded-xl border border-ink-200 p-5 shadow-sm transition-all hover:shadow-md',
        toneClasses[tone],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-medium text-ink-500 uppercase tracking-wider">
          {label}
        </div>
        {icon ? (
          <div className="text-ink-400 [&_svg]:h-4 [&_svg]:w-4">{icon}</div>
        ) : null}
      </div>
      <div className="mt-2 text-3xl font-semibold text-ink-900 tracking-tight tabular-nums">
        {value}
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {trend ? (
          <span
            className={cn(
              'inline-flex items-center gap-1 font-medium',
              trend.delta > 0
                ? 'text-brand-600'
                : trend.delta < 0
                  ? 'text-danger-600'
                  : 'text-ink-500',
            )}
          >
            {trend.delta > 0 ? '▲' : trend.delta < 0 ? '▼' : '•'}
            {Math.abs(trend.delta).toFixed(1)}%
            {trend.label ? <span className="font-normal text-ink-500">{trend.label}</span> : null}
          </span>
        ) : null}
        {hint ? <span className="text-ink-500">{hint}</span> : null}
      </div>
    </div>
  );
}
