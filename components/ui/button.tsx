import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-ink-950 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        default:
          'bg-ink-900 text-white hover:bg-ink-800 shadow-[0_1px_0_rgba(255,255,255,0.08)_inset,0_1px_3px_rgba(0,0,0,0.12)] dark:bg-ink-100 dark:text-ink-900 dark:hover:bg-white',
        primary:
          'bg-brand-600 text-white hover:bg-brand-700 shadow-[0_1px_0_rgba(255,255,255,0.1)_inset,0_2px_8px_rgba(16,185,129,0.25)] dark:bg-brand-500 dark:hover:bg-brand-400',
        outline:
          'border border-ink-200 bg-white text-ink-800 hover:bg-ink-50 hover:border-ink-300 dark:border-ink-700 dark:bg-ink-900/40 dark:text-ink-100 dark:hover:bg-ink-800 dark:hover:border-ink-600',
        ghost:
          'text-ink-700 hover:bg-ink-100 hover:text-ink-900 dark:text-ink-300 dark:hover:bg-ink-800/60 dark:hover:text-ink-100',
        danger:
          'bg-danger-600 text-white hover:bg-danger-700 shadow-[0_2px_8px_rgba(220,38,38,0.25)] dark:bg-danger-500 dark:hover:bg-danger-600',
        link: 'text-brand-600 underline-offset-4 hover:underline dark:text-brand-400',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-base',
        icon: 'h-9 w-9 p-0',
      },
    },
    defaultVariants: { variant: 'default', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
