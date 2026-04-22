'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input, Label, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

interface ParsedTier {
  uptimeThresholdPct: number;
  creditPct: number;
  sourceExcerpt?: string;
}

export function NewVendorForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [monitorUrl, setMonitorUrl] = useState('');
  const [monthlySpend, setMonthlySpend] = useState('0');
  const [contactEmail, setContactEmail] = useState('');
  const [slaText, setSlaText] = useState('');
  const [tiers, setTiers] = useState<ParsedTier[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);

  async function handleParse() {
    if (slaText.trim().length === 0) {
      toast.error('Paste SLA text first.');
      return;
    }
    setParsing(true);
    try {
      const res = await fetch('/api/vendors/parse-sla', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: slaText }),
      });
      if (!res.ok) throw new Error('Parse failed');
      const data = await res.json();
      setTiers(data.tiers ?? []);
      setWarnings(data.warnings ?? []);
      toast.success(
        `Found ${data.tiers.length} tier${data.tiers.length === 1 ? '' : 's'} via ${data.provider}.`,
      );
    } catch (err) {
      toast.error('Could not parse SLA. Try editing and re-parsing.');
    } finally {
      setParsing(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (tiers.length === 0) {
      toast.error('Parse the SLA first, or add tiers manually.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name,
          monitorUrl,
          monthlySpendCents: Math.round(Number(monthlySpend) * 100),
          contactEmail: contactEmail || undefined,
          slaExcerpt: slaText,
          tiers,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Save failed');
      }
      const data = await res.json();
      toast.success('Vendor added. Running first probe…');
      router.push(`/dashboard/vendors/${data.id}`);
      router.refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  function addManualTier() {
    setTiers([...tiers, { uptimeThresholdPct: 99.9, creditPct: 10 }]);
  }
  function updateTier(i: number, patch: Partial<ParsedTier>) {
    setTiers(tiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  }
  function removeTier(i: number) {
    setTiers(tiers.filter((_, idx) => idx !== i));
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Name</Label>
          <Input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Stripe"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Monitor URL</Label>
          <Input
            required
            type="url"
            value={monitorUrl}
            onChange={(e) => setMonitorUrl(e.target.value)}
            placeholder="https://status.stripe.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Monthly spend (USD)</Label>
          <Input
            required
            type="number"
            min="0"
            step="0.01"
            value={monthlySpend}
            onChange={(e) => setMonthlySpend(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Support email (optional)</Label>
          <Input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="support@stripe.com"
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Paste the SLA "Service Credits" section</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleParse}
            disabled={parsing}
          >
            {parsing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {parsing ? 'Parsing…' : 'Parse with AI'}
          </Button>
        </div>
        <Textarea
          rows={8}
          value={slaText}
          onChange={(e) => setSlaText(e.target.value)}
          placeholder={`Example:
If the monthly uptime percentage falls below 99.9%, customer is entitled to a service credit equal to 10% of that month's fees.
If the monthly uptime percentage falls below 99.0%, customer is entitled to a 25% service credit.
Below 95% monthly uptime, the credit is 50% of that month's fees.`}
          className="font-mono text-xs"
        />
        {warnings.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-warn-50 p-3 text-xs text-warn-600 space-y-1">
            {warnings.map((w) => (
              <div key={w}>⚠ {w}</div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>SLA tiers</Label>
          <Button type="button" variant="ghost" size="sm" onClick={addManualTier}>
            + Add tier
          </Button>
        </div>
        {tiers.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ink-200 p-6 text-center text-sm text-ink-500">
            Parse the SLA or add tiers manually.
          </div>
        ) : (
          <ul className="space-y-2">
            {tiers.map((t, i) => (
              <li
                key={i}
                className="rounded-lg border border-ink-200 bg-ink-50/40 p-3 flex items-center gap-3"
              >
                <Badge tone="neutral" className="font-mono">
                  Tier {i + 1}
                </Badge>
                <div className="flex items-center gap-1 text-sm">
                  <span className="text-ink-500">Uptime &lt;</span>
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    max="100"
                    value={t.uptimeThresholdPct}
                    onChange={(e) =>
                      updateTier(i, { uptimeThresholdPct: Number(e.target.value) })
                    }
                    className="h-8 w-20"
                  />
                  <span className="text-ink-500">%</span>
                </div>
                <div className="flex items-center gap-1 text-sm">
                  <span className="text-ink-500">→ credit</span>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={t.creditPct}
                    onChange={(e) => updateTier(i, { creditPct: Number(e.target.value) })}
                    className="h-8 w-20"
                  />
                  <span className="text-ink-500">%</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeTier(i)}
                  className="ml-auto text-xs text-ink-500 hover:text-danger-600"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-ink-100">
        <Button type="button" variant="ghost" onClick={() => history.back()}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? 'Saving…' : 'Create vendor'}
        </Button>
      </div>
    </form>
  );
}
