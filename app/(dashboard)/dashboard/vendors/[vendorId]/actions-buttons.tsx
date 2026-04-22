'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import toast from 'react-hot-toast';
import { FileText, Loader2, PlayCircle } from 'lucide-react';

export function RunProbeButton({ vendorId }: { vendorId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function run() {
    setLoading(true);
    try {
      const res = await fetch(`/api/vendors/${vendorId}/probe`, { method: 'POST' });
      if (!res.ok) throw new Error('probe failed');
      const data = await res.json();
      toast.success(`Probe: ${data.result.status.toUpperCase()} · ${data.result.latencyMs ?? '—'}ms`);
      router.refresh();
    } catch {
      toast.error('Probe failed.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <Button variant="outline" onClick={run} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
      Probe now
    </Button>
  );
}

export function GenerateClaimButton({
  vendorId,
  period,
}: {
  vendorId: string;
  period: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function run() {
    setLoading(true);
    try {
      const res = await fetch(`/api/vendors/${vendorId}/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ period }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? 'claim failed');
      }
      const data = await res.json();
      toast.success('Claim drafted.');
      router.push(`/dashboard/claims/${data.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Claim failed';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Button variant="primary" onClick={run} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
      Draft claim
    </Button>
  );
}
