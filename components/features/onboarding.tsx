import Link from 'next/link';
import { CheckCircle2, Circle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface OnboardingStep {
  id: string;
  label: string;
  hint: string;
  href: string;
  done: boolean;
}

/**
 * Fresh orgs see this checklist at the top of the dashboard. Once every
 * step is done, the caller hides the card.
 */
export function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  const completed = steps.filter((s) => s.done).length;
  const total = steps.length;
  if (completed === total) return null;

  return (
    <Card>
      <CardHeader className="flex items-center justify-between flex-row">
        <div>
          <CardTitle>Welcome to ClaimRail</CardTitle>
          <CardDescription>Finish setup to unlock the full workflow.</CardDescription>
        </div>
        <Badge tone="info">
          {completed} / {total}
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-ink-100 dark:divide-ink-800">
          {steps.map((s) => (
            <li key={s.id} className="px-6 py-3">
              <Link
                href={s.href}
                className="flex items-start gap-3 hover:bg-ink-50 dark:hover:bg-ink-800/40 -mx-6 px-6 py-2 rounded"
              >
                {s.done ? (
                  <CheckCircle2 className="h-5 w-5 text-brand-500 flex-none mt-0.5" />
                ) : (
                  <Circle className="h-5 w-5 text-ink-300 dark:text-ink-600 flex-none mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <div
                    className={`text-sm ${
                      s.done
                        ? 'text-ink-500 dark:text-ink-400 line-through'
                        : 'text-ink-900 dark:text-ink-100 font-medium'
                    }`}
                  >
                    {s.label}
                  </div>
                  <div className="text-xs text-ink-500 dark:text-ink-400">{s.hint}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
