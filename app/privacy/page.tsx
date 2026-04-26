import Link from 'next/link';

export const metadata = { title: 'Privacy · ClaimRail' };

export default function PrivacyPage() {
  const updated = 'April 26, 2026';
  return (
    <article className="mx-auto max-w-3xl px-6 py-16 prose prose-ink dark:prose-invert">
      <Link
        href="/"
        className="inline-block text-sm text-ink-500 hover:text-ink-900 dark:hover:text-ink-200 mb-6"
      >
        ← Back to ClaimRail
      </Link>
      <h1 className="text-3xl font-semibold tracking-tight text-ink-900 dark:text-ink-100">
        Privacy Policy
      </h1>
      <p className="text-sm text-ink-500 dark:text-ink-400">Last updated: {updated}</p>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-ink-700 dark:text-ink-300">
        <p>
          ClaimRail (&quot;we&quot;, &quot;our&quot;) is operated by an
          independent owner. This page explains what we collect, why we
          collect it, and what we do with it. Plain language is the goal — if
          something here is unclear, write to us at the contact below and
          we&apos;ll fix it.
        </p>

        <h2 className="text-xl font-semibold text-ink-900 dark:text-ink-100 mt-6">
          What we collect
        </h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>
            <strong>Account data:</strong> name, email, hashed password, the
            organization you belong to, and your role in it.
          </li>
          <li>
            <strong>Vendor data you enter:</strong> the SaaS vendors you
            monitor, their public status URLs, the SLA terms you paste in,
            and the monthly spend figures you choose to record.
          </li>
          <li>
            <strong>Operational telemetry:</strong> probe results
            (status/latency of vendor URLs we monitor on your behalf),
            incident records derived from those probes, and the claim drafts
            we generate.
          </li>
          <li>
            <strong>Security events:</strong> failed login attempts, unusual
            access patterns, and audit log entries for every state-changing
            action.
          </li>
        </ul>
        <p>
          We do <strong>not</strong> collect tracking pixels, third-party
          analytics, or advertising identifiers. Standard server access logs
          (IP, user-agent, request path) are kept for 30 days for abuse
          investigation, then rotated.
        </p>

        <h2 className="text-xl font-semibold text-ink-900 dark:text-ink-100 mt-6">
          What we do with it
        </h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Run the product you signed up for.</li>
          <li>Detect SLA breaches and draft claim letters on your behalf.</li>
          <li>Send you transactional emails (verification, password reset, breach alerts you opted into).</li>
          <li>Respond to legal demands when required by applicable law.</li>
        </ul>
        <p>We do not sell, rent, or share your data with third parties for marketing.</p>

        <h2 className="text-xl font-semibold text-ink-900 dark:text-ink-100 mt-6">
          Where it lives
        </h2>
        <p>
          ClaimRail is hosted on Render in their US East (Virginia) region.
          Your data sits in a managed PostgreSQL instance there. Connections
          to our app are TLS-encrypted; cookies are <code>Secure</code>,{' '}
          <code>HttpOnly</code>, and <code>SameSite=Lax</code>. TOTP secrets,
          API tokens, and integration credentials (Slack webhooks) are
          encrypted with AES-GCM at rest using a key that is not stored
          alongside the database.
        </p>

        <h2 className="text-xl font-semibold text-ink-900 dark:text-ink-100 mt-6">
          Your rights
        </h2>
        <p>
          You can export, correct, or delete your data at any time. Email the
          contact below and we&apos;ll act within 30 days. Deletion is
          permanent and cascades — vendor probes, claim drafts, and audit
          rows tied to your organization are removed.
        </p>

        <h2 className="text-xl font-semibold text-ink-900 dark:text-ink-100 mt-6">
          Sub-processors
        </h2>
        <ul className="list-disc pl-6 space-y-1">
          <li><strong>Render</strong> — hosting + managed Postgres.</li>
          <li><strong>GitHub</strong> — source control, CI, scheduled probe trigger.</li>
          <li><strong>Anthropic</strong> — optional, only when an API key is configured. Used to parse SLA text into structured tiers. SLA text you paste is sent to their API; we don&apos;t send vendor-specific identifiers.</li>
        </ul>

        <h2 className="text-xl font-semibold text-ink-900 dark:text-ink-100 mt-6">
          Changes
        </h2>
        <p>
          When we change this policy in a way that materially affects your
          rights, we&apos;ll send you an email at least 14 days before the
          change takes effect.
        </p>

        <h2 className="text-xl font-semibold text-ink-900 dark:text-ink-100 mt-6">
          Contact
        </h2>
        <p>
          Privacy questions, data requests, takedowns:{' '}
          <a className="text-brand-700 dark:text-brand-400 hover:underline" href="mailto:hello@claimrail.io">
            hello@claimrail.io
          </a>
          .
        </p>
      </section>
    </article>
  );
}
