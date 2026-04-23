'use client';

import { useEffect, useState } from 'react';
import { CommandPalette, type PaletteItem } from './palette';

/**
 * Fetches dynamic items (vendors + claims) from a lightweight API on
 * first open so the palette is always fresh without blocking the dashboard
 * render.
 */
export function PaletteLoader() {
  const [items, setItems] = useState<PaletteItem[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/palette', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data: { items: PaletteItem[] }) => {
        if (!cancelled) setItems(data.items ?? []);
      })
      .catch(() => {
        /* ignore; palette still works with static items */
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return <CommandPalette dynamicItems={items} />;
}
