import Link from 'next/link';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="relative bg-ink-900 text-white p-10 hidden lg:flex flex-col justify-between overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-700/30 via-transparent to-transparent" aria-hidden />
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-brand-500/20 blur-3xl" aria-hidden />
        <Link href="/" className="relative z-10 flex items-center gap-2 font-semibold">
          <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
            <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#g)" />
            <path d="M9 18.5L13.2 22.5L23 13" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="32" y2="32">
                <stop stopColor="#10b981" />
                <stop offset="1" stopColor="#047857" />
              </linearGradient>
            </defs>
          </svg>
          <span className="text-lg tracking-tight">ClaimRail</span>
        </Link>
        <div className="relative z-10 space-y-6 max-w-md">
          <div className="text-3xl font-semibold leading-snug">
            Your vendors owe you money.{' '}
            <span className="text-brand-300">We make sure you collect it.</span>
          </div>
          <div className="text-ink-300 text-sm leading-relaxed">
            ClaimRail customers recover an average of <span className="text-white font-semibold">$18,400</span> in SLA credits within their first 90 days.
          </div>
          <div className="space-y-2 text-sm">
            {[
              'Monitor every vendor 24/7 from your infrastructure',
              'Parse any SLA in 10 seconds with AI',
              'Generate vendor-ready claim letters',
              'Track recovery end-to-end',
            ].map((t) => (
              <div key={t} className="flex items-center gap-2">
                <svg className="h-4 w-4 text-brand-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-ink-200">{t}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative z-10 text-xs text-ink-400">© ClaimRail · Built with open source.</div>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-10 bg-ink-50">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
