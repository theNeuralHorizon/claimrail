'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, Circle, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface OnboardingStep {
  id: string;
  label: string;
  hint: string;
  href: string;
  done: boolean;
}

/**
 * Compact onboarding checklist with a circular progress ring.
 *
 *   - All complete → renders nothing.
 *   - <50% done → starts expanded with every remaining step visible.
 *   - ≥50% done → starts collapsed; user clicks to expand.
 *   - Dismissable per-session.
 */
export function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  const completed = steps.filter((s) => s.done).length;
  const total = steps.length;
  const [expanded, setExpanded] = useState(completed < total / 2);
  const [dismissed, setDismissed] = useState(false);
  if (completed === total || dismissed) return null;

  const remaining = steps.filter((s) => !s.done);
  const nextUp = remaining.slice(0, expanded ? remaining.length : 2);

  return (
    <div className="rounded-xl border border-brand-200/80 dark:border-brand-800/60 bg-gradient-to-br from-brand-50/70 via-white to-white dark:from-brand-900/20 dark:via-ink-900 dark:to-ink-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative h-9 w-9 shrink-0">
            <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90">
              <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3" className="stroke-brand-100 dark:stroke-brand-900/50" />
              <circle
                cx="18"
                cy="18"
                r="15"
                fill="none"
                strokeWidth="3"
                strokeLinecap="round"
                className="stroke-brand-500 transition-[stroke-dashoffset]"
                strokeDasharray={94.25}
                strokeDashoffset={94.25 * (1 - completed / total)}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold tabular-nums text-ink-700 dark:text-ink-200">
              {completed}/{total}
            </span>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink-900 dark:text-ink-100">
              Finish setting up ClaimRail
            </div>
            <div className="text-xs text-ink-500 dark:text-ink-400">
              {remaining.length} {remaining.length === 1 ? 'step' : 'steps'} left to unlock the full workflow.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-ink-500 dark:text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800 transition-colors"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="h-8 w-8 inline-flex items-center justify-center rounded-md text-ink-500 dark:text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800 transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {nextUp.length > 0 ? (
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {nextUp.map((s) => (
            <li key={s.id}>
              <Link
                href={s.href}
                className={cn(
                  'group flex items-start gap-2 rounded-lg border border-transparent p-2.5 transition-colors',
                  'hover:border-brand-200 hover:bg-white dark:hover:border-brand-800 dark:hover:bg-ink-800/60',
                )}
              >
                <Circle className="h-4 w-4 text-ink-300 dark:text-ink-600 mt-0.5 shrink-0 group-hover:text-brand-500" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink-900 dark:text-ink-100 truncate">
                    {s.label}
                  </div>
                  <div className="text-[11px] text-ink-500 dark:text-ink-400 truncate">
                    {s.hint}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      {expanded && steps.some((s) => s.done) ? (
        <div className="mt-3 flex flex-wrap gap-1.5 pt-3 border-t border-brand-100/80 dark:border-brand-900/40">
          {steps
            .filter((s) => s.done)
            .map((s) => (
              <Badge key={s.id} tone="success" className="opacity-90">
                <CheckCircle2 className="h-3 w-3" /> {s.label}
              </Badge>
            ))}
        </div>
      ) : null}
    </div>
  );
}
