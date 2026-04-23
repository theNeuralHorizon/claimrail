import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';

export const metadata = { title: 'API reference · ClaimRail' };

/**
 * Hand-rolled API reference page. We could embed Swagger UI or Redoc, but
 * both load code from a CDN — a fight with our strict CSP. A native
 * server-rendered page is faster, CSP-compliant, and more accessible.
 */

interface Endpoint {
  method: 'GET' | 'POST';
  path: string;
  summary: string;
  description: string;
  scope?: 'read' | 'write';
  example: string;
  response?: string;
}

const endpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/api/v1/vendors',
    summary: 'List vendors',
    description: 'Returns every vendor visible to the token with current-period uptime + breach state.',
    scope: 'read',
    example: `curl -H "Authorization: Bearer crt_…" \\
  https://claimrail.example.com/api/v1/vendors`,
    response: `{
  "data": [
    {
      "id": "…",
      "name": "Relayloop (email API)",
      "monitorUrl": "https://status.relayloop.dev/",
      "monthlySpendCents": 2800000,
      "currentPeriod": "2026-04",
      "uptimePct": 99.5821,
      "breach": {
        "hasBreach": true,
        "threshold": 99.9,
        "creditPct": 10,
        "estimatedCreditCents": 280000
      }
    }
  ],
  "meta": { "count": 1, "period": "2026-04" }
}`,
  },
  {
    method: 'POST',
    path: '/api/v1/vendors',
    summary: 'Create a vendor',
    description: 'Requires a write-scope token. Pass SLA tiers to enable breach detection immediately.',
    scope: 'write',
    example: `curl -X POST \\
  -H "Authorization: Bearer crt_…" \\
  -H "Content-Type: application/json" \\
  -d '{
    "name": "Stripe",
    "monitorUrl": "https://status.stripe.com",
    "monthlySpendCents": 10000000,
    "contactEmail": "support@stripe.com",
    "tiers": [
      { "uptimeThresholdPct": 99.9, "creditPct": 10 },
      { "uptimeThresholdPct": 99.0, "creditPct": 25 }
    ]
  }' \\
  https://claimrail.example.com/api/v1/vendors`,
    response: `{ "id": "aB3z…" }`,
  },
  {
    method: 'GET',
    path: '/api/v1/claims',
    summary: 'List claims',
    description: 'Returns every claim for the token\'s org, newest first, with amounts and status.',
    scope: 'read',
    example: `curl -H "Authorization: Bearer crt_…" \\
  https://claimrail.example.com/api/v1/claims`,
    response: `{
  "data": [
    {
      "id": "…",
      "vendorName": "Relayloop (email API)",
      "period": "2026-03",
      "status": "filed",
      "estimatedCreditCents": 280000,
      "recoveredCents": 0,
      "createdAt": "2026-04-01T00:00:00.000Z",
      "filedAt": "2026-04-02T10:00:00.000Z"
    }
  ],
  "meta": { "count": 1 }
}`,
  },
];

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-ink-50 dark:bg-ink-950 text-ink-900 dark:text-ink-100">
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-8">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-900 dark:hover:text-ink-200 mb-3"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> ClaimRail home
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">API reference</h1>
          <p className="mt-2 text-sm text-ink-500 dark:text-ink-400 max-w-2xl">
            Everything you can do against ClaimRail programmatically. The{' '}
            <Link href="/api/openapi.json" className="underline text-brand-700 dark:text-brand-300">
              OpenAPI 3.1 spec
            </Link>{' '}
            is served straight from the server and can be imported into Postman, Insomnia, or any codegen.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Authentication</CardTitle>
            <CardDescription>
              Create a token in <code className="font-mono text-xs">Settings → API tokens</code> and pass it as{' '}
              <code className="font-mono text-xs">Authorization: Bearer crt_…</code>. Tokens are scoped{' '}
              <Badge tone="neutral" className="ml-1">read</Badge> or{' '}
              <Badge tone="warn" className="ml-1">write</Badge>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul className="list-disc pl-4 space-y-1 text-ink-700 dark:text-ink-300">
              <li>Token values are shown once at create time; we store only an HMAC digest.</li>
              <li>Revoke anytime from the same Settings page; revoked tokens hard-reject on the next request.</li>
              <li>Rate limit: 60 req/min read, 30 req/min write, per token.</li>
            </ul>
          </CardContent>
        </Card>

        {endpoints.map((e) => (
          <EndpointCard key={`${e.method} ${e.path}`} endpoint={e} />
        ))}
      </div>
    </div>
  );
}

function EndpointCard({ endpoint }: { endpoint: Endpoint }) {
  const methodTone: 'info' | 'warn' = endpoint.method === 'POST' ? 'warn' : 'info';
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Badge tone={methodTone} className="font-mono">{endpoint.method}</Badge>
          <code className="font-mono text-sm text-ink-900 dark:text-ink-100">{endpoint.path}</code>
          {endpoint.scope ? (
            <Badge tone={endpoint.scope === 'write' ? 'warn' : 'neutral'} className="ml-auto">
              {endpoint.scope} scope
            </Badge>
          ) : null}
        </div>
        <CardTitle className="mt-3">{endpoint.summary}</CardTitle>
        <CardDescription>{endpoint.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
            Example
          </div>
          <pre className="font-mono text-xs bg-ink-900 text-ink-100 rounded-lg p-4 overflow-x-auto">
            {endpoint.example}
          </pre>
        </div>
        {endpoint.response ? (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-500 dark:text-ink-400 mb-1">
              Response
            </div>
            <pre className="font-mono text-xs bg-ink-50 dark:bg-ink-800/60 border border-ink-200 dark:border-ink-700 rounded-lg p-4 overflow-x-auto">
              {endpoint.response}
            </pre>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
