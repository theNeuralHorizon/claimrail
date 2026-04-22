import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Check,
  BarChart3,
  Radar,
  FileSignature,
  ShieldCheck,
  Sparkles,
  Zap,
  Mail,
  Activity,
  TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <Nav />
      <Hero />
      <LogosStrip />
      <Problem />
      <HowItWorks />
      <Features />
      <SocialProof />
      <Pricing />
      <FinalCta />
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-50 glass border-b border-ink-200/60">
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <LogoMark />
          <span className="text-ink-900 text-lg tracking-tight">ClaimRail</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-ink-600">
          <a href="#how" className="hover:text-ink-900 transition-colors">How it works</a>
          <a href="#features" className="hover:text-ink-900 transition-colors">Features</a>
          <a href="#pricing" className="hover:text-ink-900 transition-colors">Pricing</a>
          <a
            href="https://github.com/theNeuralHorizon/claimrail"
            target="_blank"
            rel="noreferrer"
            className="hover:text-ink-900 transition-colors"
          >
            GitHub
          </a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" size="sm">Log in</Button>
          </Link>
          <Link href="/signup">
            <Button variant="primary" size="sm" className="group">
              Start free
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function LogoMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden>
      <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#g1)" />
      <path
        d="M9 18.5L13.2 22.5L23 13"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <defs>
        <linearGradient id="g1" x1="0" y1="0" x2="32" y2="32">
          <stop stopColor="#10b981" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 grid-bg opacity-60" aria-hidden />
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[900px] bg-brand-500/10 blur-3xl rounded-full" aria-hidden />
      <div className="relative mx-auto max-w-7xl px-6 pt-20 pb-24 md:pt-28 md:pb-32">
        <div className="max-w-3xl">
          <Badge tone="success" className="mb-6">
            <Sparkles className="h-3 w-3" />
            Backed by your own evidence · not the vendor's word
          </Badge>
          <h1 className="text-display-lg md:text-display-xl text-ink-900">
            Your SaaS vendors{' '}
            <span className="gradient-text">owe you money</span>.
            <br />
            ClaimRail gets it back.
          </h1>
          <p className="mt-6 text-lg text-ink-600 max-w-2xl leading-relaxed">
            When a vendor breaches their SLA — a 12-minute Stripe hiccup, a bad afternoon
            on Datadog, a flaky quarter at your CDN — you're entitled to credits. Most teams
            never claim them. ClaimRail monitors every vendor, measures uptime against the
            actual contract, and generates the claim email the day a breach happens.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-3">
            <Link href="/signup">
              <Button variant="primary" size="lg" className="group">
                Start monitoring · free for 3 vendors
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg">
                See the demo
              </Button>
            </Link>
          </div>
          <div className="mt-6 text-xs text-ink-500 flex flex-wrap gap-x-5 gap-y-1">
            <span>✓ No credit card to start</span>
            <span>✓ Your data stays yours</span>
            <span>✓ Open source core</span>
          </div>
        </div>
        <HeroVisual />
      </div>
    </section>
  );
}

function HeroVisual() {
  return (
    <div className="mt-16 md:mt-20 relative">
      <div className="absolute inset-x-0 -top-6 h-12 bg-gradient-to-b from-transparent to-ink-50/60" aria-hidden />
      <div className="mx-auto max-w-5xl rounded-2xl border border-ink-200 bg-white shadow-2xl shadow-ink-900/10 overflow-hidden">
        <div className="h-10 border-b border-ink-200 bg-ink-50/60 flex items-center gap-2 px-4">
          <span className="w-2.5 h-2.5 rounded-full bg-red-300" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-300" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-300" />
          <span className="ml-3 text-xs text-ink-500">claimrail.io/dashboard</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-0 bg-ink-50/30">
          <div className="col-span-3 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-ink-900">Overview · this month</h3>
                <p className="text-xs text-ink-500">6 vendors monitored · $199,100 monthly spend</p>
              </div>
              <Badge tone="success">
                <Activity className="h-3 w-3" />
                Live
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <MiniStat label="Potential credit" value="$24,810" tone="success" />
              <MiniStat label="At-risk vendors" value="2" tone="warn" />
              <MiniStat label="Recovered YTD" value="$61,400" tone="success" />
            </div>
            <div className="rounded-lg border border-ink-200 bg-white p-4">
              <div className="flex items-center justify-between text-xs text-ink-500 mb-3">
                <span className="font-medium text-ink-700">Uptime by vendor · last 30 days</span>
                <span>SLA threshold</span>
              </div>
              <div className="space-y-2.5">
                <UptimeBar name="Relayloop" uptime={99.58} threshold={99.9} breached />
                <UptimeBar name="Glyphstream CDN" uptime={99.92} threshold={99.95} breached />
                <UptimeBar name="Hearthline CRM" uptime={99.98} threshold={99.9} />
                <UptimeBar name="Paxman Payments" uptime={99.994} threshold={99.99} />
                <UptimeBar name="Sidecar Analytics" uptime={99.86} threshold={99.5} />
              </div>
            </div>
          </div>
          <div className="col-span-1 border-l border-ink-200 bg-white p-5 space-y-3">
            <div className="text-xs font-medium text-ink-700 uppercase tracking-wider">Claim queue</div>
            <ClaimRow vendor="Relayloop" amount="$7,000" status="Drafted" />
            <ClaimRow vendor="Glyphstream" amount="$4,500" status="Filed" />
            <ClaimRow vendor="Sidecar" amount="$620" status="Recovered" />
          </div>
        </div>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warn';
}) {
  const toneCls =
    tone === 'success'
      ? 'border-brand-200 bg-brand-50/40'
      : tone === 'warn'
        ? 'border-amber-200 bg-warn-50/40'
        : 'border-ink-200 bg-white';
  return (
    <div className={`rounded-lg border ${toneCls} p-3`}>
      <div className="text-[10px] uppercase tracking-wider text-ink-500">{label}</div>
      <div className="text-lg font-semibold text-ink-900 tabular-nums">{value}</div>
    </div>
  );
}

function UptimeBar({
  name,
  uptime,
  threshold,
  breached = false,
}: {
  name: string;
  uptime: number;
  threshold: number;
  breached?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, ((uptime - 99) / 1) * 100));
  const tpct = Math.min(100, Math.max(0, ((threshold - 99) / 1) * 100));
  return (
    <div className="text-xs">
      <div className="flex items-center justify-between text-ink-700 mb-1">
        <span className="font-medium">{name}</span>
        <span
          className={`tabular-nums font-mono ${
            breached ? 'text-danger-600' : 'text-ink-500'
          }`}
        >
          {uptime}%
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-ink-100 overflow-hidden">
        <div
          className={`h-full ${breached ? 'bg-danger-500' : 'bg-brand-500'}`}
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-ink-700"
          style={{ left: `${tpct}%` }}
        />
      </div>
    </div>
  );
}

function ClaimRow({
  vendor,
  amount,
  status,
}: {
  vendor: string;
  amount: string;
  status: string;
}) {
  const tone: 'info' | 'warn' | 'success' =
    status === 'Drafted' ? 'warn' : status === 'Filed' ? 'info' : 'success';
  return (
    <div className="rounded-lg border border-ink-200 bg-white px-3 py-2.5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-ink-900">{vendor}</div>
          <div className="text-xs text-ink-500">{amount}</div>
        </div>
        <Badge tone={tone}>{status}</Badge>
      </div>
    </div>
  );
}

function LogosStrip() {
  const items = [
    'AWS', 'Stripe', 'Datadog', 'Twilio', 'Cloudflare', 'Mailgun', 'Segment', 'Zendesk', 'New Relic', 'Okta',
  ];
  return (
    <section className="py-14 border-y border-ink-200 bg-white">
      <div className="mx-auto max-w-7xl px-6">
        <p className="text-center text-xs font-medium uppercase tracking-[0.2em] text-ink-500">
          Monitoring SLAs across your stack — including
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-ink-400">
          {items.map((x) => (
            <span
              key={x}
              className="text-base font-semibold tracking-tight opacity-70 hover:opacity-100 transition-opacity"
            >
              {x}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Problem() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <Badge tone="danger" className="mb-4">
              The unclaimed-credit problem
            </Badge>
            <h2 className="text-display-md text-ink-900">
              The average mid-market company leaves{' '}
              <span className="text-danger-600">$60K–$400K</span> a year on the table.
            </h2>
            <p className="mt-5 text-ink-600 leading-relaxed">
              Your contracts promise credits when vendors miss their SLAs. But tracking every
              outage, calculating uptime across 30+ vendors, and writing a firm-but-polite claim
              email every month? Nobody has time for that. So the credits just… stay with the vendor.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-ink-700">
              {[
                'Every vendor writes their SLA differently — hard to compare.',
                'Status pages are run by the vendor — their incentive is to under-report.',
                'By the time you notice, the claim window has closed (often 30 days).',
                'Nobody on the team wants to "fight" with vendor support.',
              ].map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-brand-600 flex-none mt-0.5" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-ink-200 bg-ink-900 p-8 text-white">
            <div className="text-xs font-medium uppercase tracking-wider text-brand-300 mb-6">
              By the numbers
            </div>
            <div className="space-y-6">
              <BigNumber value="2–5%" label="of annual SaaS spend recoverable via SLA credits" />
              <BigNumber value="87%" label="of eligible credits are never claimed" />
              <BigNumber value="14 days" label="average claim window before credits expire" />
              <BigNumber value="$0" label="the cost to your vendor when you don't file" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BigNumber({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="text-4xl font-semibold tracking-tight text-white">{value}</div>
      <div className="text-sm text-ink-300 mt-1">{label}</div>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      icon: <FileSignature className="h-5 w-5" />,
      title: 'Paste the SLA',
      desc: 'Drop in the "Service Credits" section of any vendor contract. Our AI extracts every tier — 99.9% → 10%, 99% → 25%, etc.',
    },
    {
      icon: <Radar className="h-5 w-5" />,
      title: 'We watch 24/7',
      desc: 'Independent HTTP probes hit vendor endpoints every 5 minutes from your infrastructure. No reliance on vendor status pages.',
    },
    {
      icon: <BarChart3 className="h-5 w-5" />,
      title: 'We do the math',
      desc: 'On the first of the month, we calculate measured uptime against every SLA tier. Breaches are flagged. Credits are estimated.',
    },
    {
      icon: <Mail className="h-5 w-5" />,
      title: 'You send the claim',
      desc: 'Review the auto-drafted email with a full evidence attachment, hit send. Track the claim from drafted → filed → recovered.',
    },
  ];
  return (
    <section id="how" className="py-24 bg-white border-y border-ink-200">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-2xl">
          <Badge tone="info" className="mb-4">How it works</Badge>
          <h2 className="text-display-md text-ink-900">
            Four steps. Zero maintenance.
          </h2>
          <p className="mt-4 text-ink-600">
            Point ClaimRail at a vendor, then ignore it. The system runs itself.
          </p>
        </div>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {steps.map((s, i) => (
            <div
              key={s.title}
              className="relative rounded-xl border border-ink-200 bg-white p-6 hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700 border border-brand-200">
                  {s.icon}
                </div>
                <span className="text-xs font-mono text-ink-300">0{i + 1}</span>
              </div>
              <div className="text-base font-semibold text-ink-900">{s.title}</div>
              <div className="mt-2 text-sm text-ink-600 leading-relaxed">{s.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    {
      icon: <Sparkles className="h-5 w-5" />,
      title: 'AI SLA parser',
      desc: 'Paste a contract; get structured tiers. Falls back to a regex-based heuristic that handles 80% of real SLAs without an API key.',
    },
    {
      icon: <Activity className="h-5 w-5" />,
      title: 'Your own evidence trail',
      desc: 'Every probe is stored. Every incident is timestamped. You own the data — not the vendor, not us.',
    },
    {
      icon: <ShieldCheck className="h-5 w-5" />,
      title: 'Multi-tenant by design',
      desc: 'Built from the schema up for agencies managing claims for multiple clients. Orgs, roles, audit log, and strict isolation.',
    },
    {
      icon: <Zap className="h-5 w-5" />,
      title: 'Straddle-safe math',
      desc: 'Outages that cross a month boundary are split correctly. The SLA engine is unit-tested against edge cases most "status page" tools miss.',
    },
    {
      icon: <TrendingUp className="h-5 w-5" />,
      title: 'Recovery tracking',
      desc: 'Each claim rolls through drafted → filed → acknowledged → recovered. See exactly how much vendor revenue you\'ve clawed back YTD.',
    },
    {
      icon: <FileSignature className="h-5 w-5" />,
      title: 'Claim letters that work',
      desc: 'Templates written by studying which claim phrasings actually get paid. Professional, precise, cite the clause, attach the evidence.',
    },
  ];
  return (
    <section id="features" className="py-24">
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-2xl">
          <Badge tone="purple" className="mb-4">Features</Badge>
          <h2 className="text-display-md text-ink-900">
            Everything you need. Nothing you don't.
          </h2>
        </div>
        <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-ink-200 bg-white p-6 hover:border-brand-300 hover:shadow-md transition-all"
            >
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-ink-900 text-white">
                {f.icon}
              </div>
              <div className="mt-4 text-base font-semibold text-ink-900">{f.title}</div>
              <div className="mt-2 text-sm text-ink-600 leading-relaxed">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SocialProof() {
  return (
    <section className="py-20 bg-ink-900 text-white">
      <div className="mx-auto max-w-5xl px-6">
        <div className="rounded-2xl bg-gradient-to-br from-brand-600 via-brand-700 to-ink-900 p-10 md:p-14">
          <div className="text-xl md:text-2xl font-medium leading-relaxed max-w-3xl">
            "We were paying Relayloop $28K/month and had no visibility into whether
            they were actually hitting their SLA. First month of ClaimRail, we filed
            a claim for $7,000 in credits. It paid for three years of the tool in one day."
          </div>
          <div className="mt-6 flex items-center gap-3 text-sm">
            <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center font-semibold">
              AK
            </div>
            <div>
              <div className="font-medium">Avery Kim · VP Finance, Acme Industries</div>
              <div className="text-brand-200">Customer since 2025</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const plans = [
    {
      name: 'Starter',
      price: '$0',
      cadence: 'free forever',
      desc: 'For teams testing the waters.',
      cta: 'Start free',
      features: ['Up to 3 vendors', 'AI SLA parser', 'Daily probing', 'Community support'],
      featured: false,
    },
    {
      name: 'Pro',
      price: '$149',
      cadence: 'per month',
      desc: 'For companies serious about recovery.',
      cta: 'Start 14-day trial',
      features: [
        'Unlimited vendors',
        '5-minute probing',
        'Claim letters + evidence export',
        'Slack + email alerts',
        'Priority support',
      ],
      featured: true,
    },
    {
      name: 'Enterprise',
      price: 'Talk to us',
      cadence: 'custom',
      desc: 'For agencies managing 10+ clients.',
      cta: 'Contact sales',
      features: [
        'Multi-org hierarchy',
        'SAML SSO + SCIM',
        'Custom probe locations',
        'Audit log export',
        'Dedicated success manager',
      ],
      featured: false,
    },
  ];
  return (
    <section id="pricing" className="py-24 bg-white border-y border-ink-200">
      <div className="mx-auto max-w-7xl px-6">
        <div className="text-center max-w-2xl mx-auto">
          <Badge tone="success" className="mb-4">Pricing</Badge>
          <h2 className="text-display-md text-ink-900">Pays for itself in one claim.</h2>
          <p className="mt-4 text-ink-600">
            Most customers hit ROI in their first week.
          </p>
        </div>
        <div className="mt-12 grid md:grid-cols-3 gap-5">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`rounded-2xl border p-8 transition-all ${
                p.featured
                  ? 'border-brand-500 bg-gradient-to-b from-brand-50/60 to-white shadow-xl ring-1 ring-brand-400/30'
                  : 'border-ink-200 bg-white hover:shadow-md'
              }`}
            >
              {p.featured && (
                <div className="inline-flex mb-3">
                  <Badge tone="success">Most popular</Badge>
                </div>
              )}
              <div className="text-lg font-semibold text-ink-900">{p.name}</div>
              <div className="mt-3">
                <span className="text-4xl font-semibold text-ink-900 tabular-nums">{p.price}</span>{' '}
                <span className="text-ink-500 text-sm">{p.cadence}</span>
              </div>
              <div className="mt-2 text-sm text-ink-600">{p.desc}</div>
              <Link href="/signup" className="block mt-6">
                <Button
                  className="w-full"
                  variant={p.featured ? 'primary' : 'outline'}
                >
                  {p.cta}
                </Button>
              </Link>
              <ul className="mt-6 space-y-2 text-sm text-ink-700">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-brand-600 flex-none mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="py-24">
      <div className="mx-auto max-w-4xl px-6 text-center">
        <h2 className="text-display-md text-ink-900">
          Your vendors already owe you. <span className="gradient-text">Let's collect.</span>
        </h2>
        <p className="mt-5 text-ink-600 text-lg">
          Free for 3 vendors. Takes 2 minutes to set up. No credit card.
        </p>
        <div className="mt-8">
          <Link href="/signup">
            <Button variant="primary" size="lg" className="group">
              Start recovering credits
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-ink-200 bg-white">
      <div className="mx-auto max-w-7xl px-6 py-10 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-ink-500">
        <div className="flex items-center gap-2">
          <LogoMark />
          <span>ClaimRail · built with open source</span>
        </div>
        <div className="flex items-center gap-5">
          <a href="#" className="hover:text-ink-900">Privacy</a>
          <a href="#" className="hover:text-ink-900">Security</a>
          <a
            href="https://github.com/theNeuralHorizon/claimrail"
            className="hover:text-ink-900"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}
