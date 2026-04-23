import * as React from 'react';
import { cn } from '@/lib/utils';

export interface StatProps {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  trend?: { delta: number; label?: string } | null;
  icon?: React.ReactNode;
  tone?: 'default' | 'success' | 'warn' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Optional chart sliver rendered at the bottom of an `lg` card. */
  sparkline?: React.ReactNode;
}

/**
 * Stat card. Three sizes:
 *   - sm  tight row metric
 *   - md  default dashboard card
 *   - lg  hero metric — 5xl value + optional sparkline area
 */
export function Stat({
  label,
  value,
  hint,
  trend,
  icon,
  tone = 'default',
  size = 'md',
  sparkline,
  className,
}: StatProps) {
  const toneClasses: Record<string, string> = {
    default:
      'bg-white dark:bg-ink-900 border-ink-200 dark:border-ink-800',
    success:
      'bg-gradient-to-br from-brand-50 via-white to-white dark:from-brand-900/30 dark:via-ink-900 dark:to-ink-900 border-brand-200/80 dark:border-brand-800/70',
    warn:
      'bg-gradient-to-br from-warn-50/70 via-white to-white dark:from-amber-900/20 dark:via-ink-900 dark:to-ink-900 border-amber-200/80 dark:border-amber-800/60',
    danger:
      'bg-gradient-to-br from-danger-50/70 via-white to-white dark:from-red-900/25 dark:via-ink-900 dark:to-ink-900 border-red-200/80 dark:border-red-800/60',
  };

  if (size === 'lg') {
    return (
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border p-6 shadow-sm',
          toneClasses[tone],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-ink-400">
              {label}
            </div>
            <div className="mt-2 text-5xl font-semibold tracking-tight tabular-nums text-ink-900 dark:text-ink-50">
              {value}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-600 dark:text-ink-300">
              {trend ? <TrendPill trend={trend} /> : null}
              {hint ? <span>{hint}</span> : null}
            </div>
          </div>
          {icon ? (
            <div className="rounded-xl bg-white/70 dark:bg-ink-800/70 border border-ink-200 dark:border-ink-700 p-2 text-ink-500 dark:text-ink-300 [&_svg]:h-4 [&_svg]:w-4">
              {icon}
            </div>
          ) : null}
        </div>
        {sparkline ? <div className="mt-4 h-10 -mx-1">{sparkline}</div> : null}
      </div>
    );
  }

  const compact = size === 'sm';
  return (
    <div
      className={cn(
        'rounded-xl border p-4 shadow-sm transition-all hover:shadow-md',
        toneClasses[tone],
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-ink-400">
          {label}
        </div>
        {icon ? (
          <div className="text-ink-400 dark:text-ink-500 [&_svg]:h-3.5 [&_svg]:w-3.5">
            {icon}
          </div>
        ) : null}
      </div>
      <div
        className={cn(
          'mt-1.5 font-semibold text-ink-900 dark:text-ink-50 tracking-tight tabular-nums',
          compact ? 'text-xl' : 'text-2xl',
        )}
      >
        {value}
      </div>
      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-500 dark:text-ink-400 min-h-[16px]">
        {trend ? <TrendPill trend={trend} /> : null}
        {hint ? <span>{hint}</span> : null}
      </div>
    </div>
  );
}

function TrendPill({ trend }: { trend: { delta: number; label?: string } }) {
  if (trend.delta === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-ink-500 dark:text-ink-400">
        <span>•</span>
        {trend.label ? <span>{trend.label}</span> : null}
      </span>
    );
  }
  const up = trend.delta > 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium text-[10px]',
        up
          ? 'text-brand-700 dark:text-brand-300 bg-brand-100/60 dark:bg-brand-900/40'
          : 'text-danger-700 dark:text-danger-300 bg-danger-50 dark:bg-red-900/30',
      )}
    >
      {up ? '▲' : '▼'} {Math.abs(trend.delta).toFixed(1)}%
      {trend.label ? <span className="ml-1 font-normal">{trend.label}</span> : null}
    </span>
  );
}
