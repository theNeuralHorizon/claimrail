'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import toast from 'react-hot-toast';
import { Copy, Check } from 'lucide-react';

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied to clipboard.');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Clipboard blocked.');
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={copy}>
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

const STATUSES = [
  { key: 'drafted', label: 'Drafted' },
  { key: 'filed', label: 'Filed' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'recovered', label: 'Recovered' },
  { key: 'rejected', label: 'Rejected' },
] as const;

export function ClaimActions({
  claimId,
  status,
  recoveredCents,
}: {
  claimId: string;
  status: (typeof STATUSES)[number]['key'];
  recoveredCents: number;
}) {
  const router = useRouter();
  const [recoveredDollars, setRecoveredDollars] = useState(
    String(recoveredCents / 100 || ''),
  );
  const [saving, setSaving] = useState(false);

  async function setStatus(next: (typeof STATUSES)[number]['key']) {
    setSaving(true);
    try {
      const res = await fetch(`/api/claims/${claimId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status: next,
          recoveredCents: next === 'recovered' ? Math.round(Number(recoveredDollars) * 100) : null,
        }),
      });
      if (!res.ok) throw new Error('Update failed');
      toast.success(`Status: ${next}`);
      router.refresh();
    } catch {
      toast.error('Could not update.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {STATUSES.map((s) => (
          <Button
            key={s.key}
            variant={s.key === status ? 'primary' : 'outline'}
            size="sm"
            onClick={() => setStatus(s.key)}
            disabled={saving}
          >
            {s.label}
          </Button>
        ))}
      </div>
      {status === 'recovered' || (status !== 'drafted' && recoveredCents > 0) ? (
        <div className="flex items-end gap-2 pt-2 border-t border-ink-100">
          <div className="space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-ink-500">Amount recovered (USD)</div>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={recoveredDollars}
              onChange={(e) => setRecoveredDollars(e.target.value)}
              className="w-48"
            />
          </div>
          <Button
            size="md"
            variant="primary"
            onClick={() => setStatus('recovered')}
            disabled={saving}
          >
            Save recovery
          </Button>
        </div>
      ) : null}
    </div>
  );
}
