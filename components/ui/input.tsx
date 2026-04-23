import * as React from 'react';
import { cn } from '@/lib/utils';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-lg px-3 py-2 text-sm transition-colors',
        'border border-ink-200 bg-white text-ink-900',
        'dark:border-ink-700 dark:bg-ink-800/60 dark:text-ink-100',
        'placeholder:text-ink-400 dark:placeholder:text-ink-500',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:border-brand-400',
        'dark:focus-visible:border-brand-500 dark:focus-visible:ring-brand-500/30',
        'disabled:cursor-not-allowed disabled:opacity-60',
        'dark:disabled:bg-ink-800/30 dark:disabled:text-ink-400',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full rounded-lg px-3 py-2 text-sm transition-colors resize-y',
        'border border-ink-200 bg-white text-ink-900',
        'dark:border-ink-700 dark:bg-ink-800/60 dark:text-ink-100',
        'placeholder:text-ink-400 dark:placeholder:text-ink-500',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:border-brand-400',
        'dark:focus-visible:border-brand-500 dark:focus-visible:ring-brand-500/30',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        'text-xs font-medium uppercase tracking-wider',
        'text-ink-700 dark:text-ink-300',
        className,
      )}
      {...props}
    />
  ),
);
Label.displayName = 'Label';
