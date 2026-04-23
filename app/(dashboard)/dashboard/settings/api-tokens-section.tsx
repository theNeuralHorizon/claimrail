'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useState } from 'react';
import { Input, Label } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  createApiTokenAction,
  revokeApiTokenAction,
  type ApiTokenState,
} from '@/lib/auth/api-token-actions';
import { Copy, Check } from 'lucide-react';

const initial: ApiTokenState = {};

function CreateBtn() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="primary" size="sm" disabled={pending}>
      {pending ? 'Creating…' : 'Create token'}
    </Button>
  );
}

export interface ApiTokenRow {
  id: string;
  name: string;
  prefix: string;
  scope: 'read' | 'write';
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

export function ApiTokensSection({ tokens }: { tokens: ApiTokenRow[] }) {
  const [state, formAction] = useFormState(createApiTokenAction, initial);
  const [copied, setCopied] = useState(false);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ok */
    }
  }

  return (
    <div className="space-y-4">
      <form
        action={formAction}
        className="flex flex-col sm:flex-row sm:items-end gap-2"
      >
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="token-name">Name</Label>
          <Input
            id="token-name"
            name="name"
            required
            maxLength={64}
            placeholder="CI pipeline"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="token-scope">Scope</Label>
          <select
            id="token-scope"
            name="scope"
            className="h-10 rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-900 px-3 text-sm"
            defaultValue="read"
          >
            <option value="read">read</option>
            <option value="write">write</option>
          </select>
        </div>
        <CreateBtn />
      </form>
      {state?.error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </div>
      ) : null}
      {state?.issued ? (
        <div className="rounded-lg border border-brand-200 bg-brand-50 dark:bg-brand-950/30 dark:border-brand-800 p-3 space-y-2">
          <div className="text-xs text-brand-800 dark:text-brand-200">
            {state.success}
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-xs bg-white dark:bg-ink-900 border border-brand-200 dark:border-brand-800 rounded px-2 py-1.5 break-all">
              {state.issued.rawToken}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => copy(state.issued!.rawToken)}
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="rounded-lg border border-ink-200 dark:border-ink-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-50 dark:bg-ink-800/40 text-xs uppercase tracking-wider text-ink-500 dark:text-ink-400">
            <tr>
              <th className="text-left px-4 py-2">Name</th>
              <th className="text-left px-4 py-2">Prefix</th>
              <th className="text-left px-4 py-2">Scope</th>
              <th className="text-left px-4 py-2">Last used</th>
              <th className="text-right px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
            {tokens.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-xs text-ink-500">
                  No tokens yet.
                </td>
              </tr>
            ) : (
              tokens.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-ink-900 dark:text-ink-100">
                      {t.name}
                    </div>
                    {t.revokedAt ? (
                      <Badge tone="danger" className="text-[10px]">
                        Revoked
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-ink-500">{t.prefix}…</td>
                  <td className="px-4 py-2">
                    <Badge tone={t.scope === 'write' ? 'warn' : 'neutral'}>
                      {t.scope}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-xs text-ink-500">
                    {t.lastUsedAt
                      ? new Date(t.lastUsedAt * 1000).toLocaleString()
                      : 'never'}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {t.revokedAt == null ? (
                      <form action={revokeApiTokenAction}>
                        <input type="hidden" name="tokenId" value={t.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          className="text-danger-600"
                        >
                          Revoke
                        </Button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-ink-500 dark:text-ink-400">
        Use like: <code className="font-mono bg-ink-100 dark:bg-ink-800 px-1 py-0.5 rounded">curl -H &quot;Authorization: Bearer crt_…&quot; /api/v1/vendors</code>
      </div>
    </div>
  );
}
