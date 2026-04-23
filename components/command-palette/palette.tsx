'use client';

/**
 * Command palette — Cmd+K / Ctrl+K opens a fuzzy-searchable launcher
 * over pages, vendors, and claims. No external dep: we do a simple
 * substring + token-match score.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Home,
  Server,
  AlertTriangle,
  FileText,
  Settings,
  Activity,
  Shield,
} from 'lucide-react';

export interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  href: string;
  group: 'Pages' | 'Vendors' | 'Claims';
  icon?: React.ReactNode;
}

const STATIC_ITEMS: PaletteItem[] = [
  { id: 'p-home', label: 'Overview', href: '/dashboard', group: 'Pages', icon: <Home className="h-4 w-4" /> },
  { id: 'p-vendors', label: 'Vendors', href: '/dashboard/vendors', group: 'Pages', icon: <Server className="h-4 w-4" /> },
  { id: 'p-incidents', label: 'Incidents', href: '/dashboard/incidents', group: 'Pages', icon: <AlertTriangle className="h-4 w-4" /> },
  { id: 'p-claims', label: 'Claims', href: '/dashboard/claims', group: 'Pages', icon: <FileText className="h-4 w-4" /> },
  { id: 'p-settings', label: 'Settings', href: '/dashboard/settings', group: 'Pages', icon: <Settings className="h-4 w-4" /> },
  { id: 'p-audit', label: 'Audit log', href: '/dashboard/settings/audit', group: 'Pages', icon: <Activity className="h-4 w-4" /> },
  { id: 'p-security', label: 'Security events', href: '/dashboard/settings/security', group: 'Pages', icon: <Shield className="h-4 w-4" /> },
  { id: 'p-new-vendor', label: 'Add a vendor', href: '/dashboard/vendors/new', group: 'Pages', hint: 'Quick action' },
];

function score(label: string, q: string): number {
  if (!q) return 1;
  const l = label.toLowerCase();
  const s = q.toLowerCase();
  if (l === s) return 100;
  if (l.startsWith(s)) return 80;
  // Token match — every word in `q` exists somewhere in `label`.
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.every((t) => l.includes(t))) return 50;
  // Subsequence — all chars of `q` appear in order.
  let i = 0;
  for (const c of l) {
    if (i < s.length && c === s[i]) i += 1;
  }
  return i === s.length ? 20 : 0;
}

export function CommandPalette({
  dynamicItems,
}: {
  dynamicItems: PaletteItem[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(
    () => [...STATIC_ITEMS, ...dynamicItems],
    [dynamicItems],
  );

  const ranked = useMemo(() => {
    if (!query) return items;
    return items
      .map((it) => ({ it, s: score(it.label + ' ' + (it.hint ?? ''), query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.it);
  }, [items, query]);

  useEffect(() => setActive(0), [query, open]);

  // Global keybinding: Cmd/Ctrl+K toggles, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Focus input when opened.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
    else setQuery('');
  }, [open]);

  const jump = useCallback(
    (item: PaletteItem) => {
      setOpen(false);
      router.push(item.href);
    },
    [router],
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div className="absolute inset-0 bg-ink-900/40 dark:bg-ink-950/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl rounded-2xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 h-12 border-b border-ink-200 dark:border-ink-800">
          <Search className="h-4 w-4 text-ink-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(ranked.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (ranked[active]) jump(ranked[active]);
              }
            }}
            placeholder="Type a command or search…"
            className="flex-1 bg-transparent outline-none text-sm text-ink-900 dark:text-ink-100 placeholder:text-ink-400"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 rounded border border-ink-200 dark:border-ink-700 px-1.5 py-0.5 text-[10px] font-mono text-ink-500">
            ESC
          </kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto p-2">
          {ranked.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-ink-500">No results.</div>
          ) : null}
          {Object.entries(groupBy(ranked, (r) => r.group)).map(([group, groupItems]) => (
            <div key={group} className="mb-1">
              <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-ink-400">
                {group}
              </div>
              {groupItems.map((it) => {
                const idx = ranked.indexOf(it);
                const isActive = idx === active;
                return (
                  <button
                    key={it.id}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => jump(it)}
                    className={`w-full text-left flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-900 dark:text-brand-100'
                        : 'text-ink-700 dark:text-ink-200 hover:bg-ink-50 dark:hover:bg-ink-800/60'
                    }`}
                  >
                    <span className="text-ink-400 dark:text-ink-500">{it.icon ?? <FileText className="h-4 w-4" />}</span>
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.hint ? (
                      <span className="text-xs text-ink-400">{it.hint}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 px-4 h-9 border-t border-ink-200 dark:border-ink-800 text-[11px] text-ink-400">
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded bg-ink-100 dark:bg-ink-800 px-1.5 py-0.5 font-mono">↑↓</kbd>
            navigate
          </span>
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded bg-ink-100 dark:bg-ink-800 px-1.5 py-0.5 font-mono">↵</kbd>
            open
          </span>
          <span className="ml-auto inline-flex items-center gap-1">
            <kbd className="rounded bg-ink-100 dark:bg-ink-800 px-1.5 py-0.5 font-mono">⌘K</kbd>
            toggle
          </span>
        </div>
      </div>
    </div>
  );
}

function groupBy<T, K extends string>(arr: T[], key: (t: T) => K): Record<K, T[]> {
  return arr.reduce((acc, x) => {
    const k = key(x);
    (acc[k] ||= []).push(x);
    return acc;
  }, {} as Record<K, T[]>);
}
