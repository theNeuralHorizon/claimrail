'use client';

import { useTheme } from './theme-provider';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} mode`}
      onClick={toggle}
      className="text-ink-500 dark:text-ink-300 hover:text-ink-900 dark:hover:text-ink-100"
    >
      {resolved === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
