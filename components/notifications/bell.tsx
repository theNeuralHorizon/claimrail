'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface FeedItem {
  id: string;
  kind: string;
  severity: 'info' | 'warn' | 'high' | 'critical';
  createdAt: number;
  ip?: string | null;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || items !== null) return;
    fetch('/api/notifications', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items: FeedItem[] }) => setItems(d.items ?? []))
      .catch(() => setItems([]));
  }, [open, items]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (
        btnRef.current?.contains(e.target as Node) ||
        boxRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const criticalCount = (items ?? []).filter(
    (i) => i.severity === 'critical' || i.severity === 'high',
  ).length;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800 hover:text-ink-900 dark:hover:text-ink-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {criticalCount > 0 ? (
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-danger-500 ring-2 ring-white dark:ring-ink-900" />
        ) : null}
      </button>
      {open ? (
        <div
          ref={boxRef}
          className="absolute right-0 mt-2 w-96 max-h-[70vh] overflow-hidden rounded-xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 shadow-2xl z-40"
        >
          <div className="px-4 py-3 border-b border-ink-100 dark:border-ink-800 flex items-center justify-between">
            <div className="text-sm font-medium text-ink-900 dark:text-ink-100">Notifications</div>
            <Link
              href="/dashboard/settings/security"
              className="text-xs text-brand-700 dark:text-brand-300 hover:underline"
              onClick={() => setOpen(false)}
            >
              View all
            </Link>
          </div>
          <div className="max-h-[calc(70vh-48px)] overflow-y-auto">
            {items == null ? (
              <div className="px-4 py-6 text-center text-sm text-ink-500">Loading…</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-ink-500">
                <CheckCircle2 className="mx-auto h-6 w-6 text-brand-500 mb-2" />
                Nothing to worry about.
              </div>
            ) : (
              <ul className="divide-y divide-ink-100 dark:divide-ink-800">
                {items.map((i) => (
                  <li
                    key={i.id}
                    className="px-4 py-3 hover:bg-ink-50 dark:hover:bg-ink-800/40"
                  >
                    <div className="flex items-start gap-3">
                      <ShieldAlert
                        className={`h-4 w-4 flex-none mt-0.5 ${
                          i.severity === 'critical' || i.severity === 'high'
                            ? 'text-danger-500'
                            : i.severity === 'warn'
                              ? 'text-warn-500'
                              : 'text-ink-400'
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-mono text-ink-900 dark:text-ink-100 truncate">
                            {i.kind}
                          </span>
                          <Badge tone={severityTone(i.severity)}>{i.severity}</Badge>
                        </div>
                        <div className="text-xs text-ink-500 mt-0.5">
                          {timeAgo(i.createdAt)}
                          {i.ip ? ` · ${i.ip}` : ''}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function severityTone(s: string): 'success' | 'warn' | 'danger' | 'info' | 'neutral' {
  if (s === 'critical' || s === 'high') return 'danger';
  if (s === 'warn') return 'warn';
  return 'info';
}

function timeAgo(sec: number): string {
  const diff = Math.floor(Date.now() / 1000) - sec;
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
