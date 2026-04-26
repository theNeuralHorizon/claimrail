import Link from 'next/link';

export const metadata = { title: 'Terms · ClaimRail' };

export default function TermsPage() {
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
        Terms of Service
      </h1>
      <p className="text-sm text-ink-500 dark:text-ink-400">Last updated: {updated}</p>

      <section className="mt-8 space-y-4 text-sm leading-relaxed text-ink-700 dark:text-ink-300">
        <p>
          By creating an account on ClaimRail you agree to these terms. They
          are short on purpose. If anything is unclear, ask first — we
          don&apos;t want surprises later.
        </p>

        <h2 className="text-xl font-semibold text-ink-900 dark:text-ink-100 mt-6">
          What ClaimRail does
        </h2>
        <p>
          ClaimRail monitors the public status pages of SaaS vendors you
          configure, measures their uptime against the SLA tiers you paste
          in, and drafts a credit-claim letter when a vendor falls below
          threshold. We don&apos;t file the claim for you — you review the
          draft and choose to send it. Recovery is between you and your
          vendor.
        </p>

        <h2 className="text-xl font-semibold text-ink-900 dark:text-ink-100 mt-6">
          What you agree to
        </h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>You will use ClaimRail to monitor SaaS vendors you have a legitimate business relationship with.</li>
          <li>You will not configure ClaimRail to probe URLs you don&apos;t own or have permission to probe.</li>
          <li>You will not attempt to circumvent rate limits, the security model, or other customers&apos; data isolation.</li>
          <li>You are responsible for the accuracy of the SLA terms and spend figures you paste in. We don&apos;t verify them.</li>
        </ul>

        <h2 className="text-xl font-semibold text-ink-900 dark:text-ink-100 mt-6">
          What we agree to
        </h2>
        <ul className="list-disc pl-6 space-y-1">
          <li>Best-effort uptime. See <Link href="/status" className="text-brand-700 dark:text-brand-400 hover:underline">/status</Link> for current health. We don&apos;t offer an SLA on the free plan.</li>
          <li>Per-tenant data isolation, with audit logs you can verify (every change is hash-chained).</li>
          <li>Reasonable security: TLS in transit, encrypted secrets at rest, modern session handling, regular dependency updates.</li>
          <li>30 days&apos; notice before any breaking change to these terms.</li>
        </ul>

        <h2 className="text-xl font-semibold text-ink-900 dark:text-ink-100 mt-6">
          Pricing &amp; billing
        </h2>
        <p>
          The current plan is free during the early-access window. We&apos;ll
          give 30 days&apos; written notice before enabling paid plans on
          your organization. You can cancel at any time and your data will
          be retained for 30 days, then deleted.
        </p>

        <h2 className="text-xl font-semibold text-ink-900 dark:text-ink-100 mt-6">
          Limitations of liability
        </h2>
        <p>
          ClaimRail is provided <strong>&quot;as is&quot;</strong>. We make
          no warranty that a credit claim will be successful, that all
          breaches will be detected, or that the service will be free of
          downtime. Our total liability for any claim arising out of your
          use of ClaimRail is capped at the fees you&apos;ve paid us in the
          12 months preceding the claim, or USD $100 if you haven&apos;t paid
          anything.
        </p>

        <h2 className="text-xl font-semibold text-ink-900 dark:text-ink-100 mt-6">
          Termination
        </h2>
        <p>
          You can delete your account at any time from{' '}
          <Link href="/dashboard/settings" className="text-brand-700 dark:text-brand-400 hover:underline">
            Settings
          </Link>
          . We can suspend or terminate accounts that abuse the service,
          violate these terms, or that we&apos;re legally required to act on
          — with notice when possible.
        </p>

        <h2 className="text-xl font-semibold text-ink-900 dark:text-ink-100 mt-6">
          Governing law
        </h2>
        <p>
          These terms are governed by the laws of India. Disputes will be
          handled in the courts of Bengaluru.
        </p>

        <h2 className="text-xl font-semibold text-ink-900 dark:text-ink-100 mt-6">
          Contact
        </h2>
        <p>
          Questions about these terms:{' '}
          <a className="text-brand-700 dark:text-brand-400 hover:underline" href="mailto:hello@claimrail.io">
            hello@claimrail.io
          </a>
          .
        </p>
      </section>
    </article>
  );
}
