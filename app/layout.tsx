import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';

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
  return (
    <html lang="en">
      <body>
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
      </body>
    </html>
  );
}
