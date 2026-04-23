'use client';

/**
 * Theme provider — sync'd with `localStorage` + `prefers-color-scheme`.
 *
 * We set the class *on the <html> element* (not on body) so Tailwind's
 * `dark:` variant sees it. Every provider consumer can read the resolved
 * theme and toggle it.
 *
 * No external dep (next-themes); a ~60-line custom impl keeps the bundle
 * smaller and the behaviour predictable.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type Theme = 'light' | 'dark' | 'system';
type Resolved = 'light' | 'dark';

interface ThemeCtx {
  theme: Theme;
  resolved: Resolved;
  setTheme: (t: Theme) => void;
  toggle: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

const STORAGE_KEY = 'claimrail.theme';

function mediaPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function readInitial(): Theme {
  if (typeof window === 'undefined') return 'system';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    /* storage may be blocked */
  }
  return 'system';
}

function applyThemeClass(resolved: Resolved): void {
  const el = document.documentElement;
  el.classList.toggle('dark', resolved === 'dark');
  el.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolved, setResolved] = useState<Resolved>('light');

  useEffect(() => {
    const initial = readInitial();
    setThemeState(initial);
    const res: Resolved = initial === 'system' ? (mediaPrefersDark() ? 'dark' : 'light') : initial;
    setResolved(res);
    applyThemeClass(res);
  }, []);

  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      const r: Resolved = mq.matches ? 'dark' : 'light';
      setResolved(r);
      applyThemeClass(r);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ok */
    }
    const r: Resolved = t === 'system' ? (mediaPrefersDark() ? 'dark' : 'light') : t;
    setResolved(r);
    applyThemeClass(r);
  }, []);

  const toggle = useCallback(() => {
    setTheme(resolved === 'dark' ? 'light' : 'dark');
  }, [resolved, setTheme]);

  const value = useMemo(
    () => ({ theme, resolved, setTheme, toggle }),
    [theme, resolved, setTheme, toggle],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}

// Theme bootstrap that runs before React hydrates lives at
// `public/theme-boot.js` — served as a static file so strict CSP doesn't
// have to open a hole for inline scripts. Keep STORAGE_KEY in sync with
// that file if you change it.
