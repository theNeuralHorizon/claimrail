import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { headers } from 'next/headers';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from '@/components/theme/theme-provider';

export const metadata: Metadata = {
  title: 'ClaimRail — Recover unclaimed SaaS SLA credits, automatically',
  description:
    'ClaimRail monitors every SaaS vendor you depend on, measures uptime against their actual SLA, and files credit claims when they fall short. The average customer recovers 2–5% of their annual SaaS spend.',
  applicationName: 'ClaimRail',
  authors: [{ name: 'ClaimRail' }],
  openGraph: {
    title: 'ClaimRail — Recover unclaimed SaaS SLA credits, automatically',
    description:
      'Stop leaving money on the table. ClaimRail tracks vendor SLAs and auto-files claims when they\'re breached.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#10b981',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Reading the request headers at the root forces every page to render
  // dynamically per request, which is exactly what we want for the CSP
  // nonce: each visitor needs a freshly-minted nonce that matches the
  // one Next.js will stamp onto its streaming inline scripts. Without
  // this call, statically-prerendered pages (login, signup, landing)
  // would serve stale HTML whose inline scripts don't match the
  // per-request CSP, blocking hydration.
  const nonce = headers().get('x-nonce') ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-ink-50 text-ink-900 dark:bg-ink-950 dark:text-ink-100">
        {/*
         * Theme bootstrap — applies `html.dark` before first paint so we
         * don't flash the wrong palette. `beforeInteractive` is the only
         * strategy that guarantees execution before React hydration, and
         * it requires the script to live in the root layout. The nonce
         * is read from middleware so the CSP allows the load.
         */}
        <Script src="/theme-boot.js" strategy="beforeInteractive" nonce={nonce} />
        <ThemeProvider>
          <Toaster
            position="bottom-right"
            toastOptions={{
              style: {
                background: '#0f172a',
                color: '#ffffff',
                borderRadius: '10px',
                fontSize: '0.875rem',
                padding: '12px 16px',
              },
            }}
          />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
