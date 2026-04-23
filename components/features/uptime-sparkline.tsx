import { cn } from '@/lib/utils';

export interface DailyUptimePoint {
  /** unix seconds at start of day (UTC) */
  day: number;
  uptimePct: number;
}

interface Props {
  points: DailyUptimePoint[];
  threshold?: number;
  className?: string;
}

/**
 * Seven-day uptime sparkline. Pure SVG, no charting dep.
 * Bars below `threshold` render red; at/above render brand-green.
 */
export function UptimeSparkline({ points, threshold = 99.9, className }: Props) {
  if (points.length === 0) {
    return <div className={cn('h-8 w-full rounded bg-ink-100 dark:bg-ink-800/60', className)} />;
  }
  const width = points.length * 12;
  const height = 32;
  const minUptime = 95;
  const scale = (v: number) => {
    const clamped = Math.max(minUptime, Math.min(100, v));
    return ((clamped - minUptime) / (100 - minUptime)) * height;
  };
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('h-8 w-full', className)}
      aria-label={`${points.length}-day uptime sparkline`}
    >
      {points.map((p, i) => {
        const h = scale(p.uptimePct);
        const x = i * 12;
        const color = p.uptimePct < threshold ? '#ef4444' : '#10b981';
        return (
          <g key={p.day}>
            <rect
              x={x + 2}
              y={height - h}
              width={8}
              height={h}
              fill={color}
              rx={2}
              opacity={0.9}
            />
          </g>
        );
      })}
    </svg>
  );
}
