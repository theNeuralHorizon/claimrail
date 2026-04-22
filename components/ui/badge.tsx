import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border',
  {
    variants: {
      tone: {
        neutral: 'bg-ink-100 text-ink-700 border-ink-200',
        success: 'bg-brand-50 text-brand-700 border-brand-200',
        warn: 'bg-warn-50 text-warn-600 border-amber-200',
        danger: 'bg-danger-50 text-danger-700 border-red-200',
        info: 'bg-sky-50 text-sky-700 border-sky-200',
        purple: 'bg-purple-50 text-purple-700 border-purple-200',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export function StatusDot({
  status,
  className,
}: {
  status: 'up' | 'degraded' | 'down' | 'unknown';
  className?: string;
}) {
  const color =
    status === 'up'
      ? 'bg-brand-500'
      : status === 'degraded'
        ? 'bg-warn-500'
        : status === 'down'
          ? 'bg-danger-500'
          : 'bg-ink-300';
  return (
    <span className={cn('relative inline-flex h-2.5 w-2.5', className)}>
      <span
        className={cn(
          'absolute inline-flex h-full w-full rounded-full opacity-50 animate-pulse-ring',
          color,
        )}
      />
      <span className={cn('relative inline-flex rounded-full h-2.5 w-2.5', color)} />
    </span>
  );
}
