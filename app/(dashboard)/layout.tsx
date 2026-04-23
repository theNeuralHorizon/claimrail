import Link from 'next/link';
import { requireAuth } from '@/lib/auth/session';
import { logoutAction } from '@/lib/auth/actions';
import { Home, Server, AlertTriangle, FileText, Settings, LogOut, Command } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PaletteLoader } from '@/components/command-palette/palette-loader';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { NotificationBell } from '@/components/notifications/bell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireAuth();
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-ink-50 dark:bg-ink-950 text-ink-900 dark:text-ink-100">
      <PaletteLoader />
      <aside className="w-full md:w-60 bg-white dark:bg-ink-900 border-b md:border-b-0 md:border-r border-ink-200 dark:border-ink-800 flex flex-col">
        <div className="px-5 h-16 flex items-center border-b border-ink-200 dark:border-ink-800">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
              <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#side-g)" />
              <path d="M9 18.5L13.2 22.5L23 13" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <defs>
                <linearGradient id="side-g" x1="0" y1="0" x2="32" y2="32">
                  <stop stopColor="#10b981" />
                  <stop offset="1" stopColor="#047857" />
                </linearGradient>
              </defs>
            </svg>
            <span className="text-ink-900 dark:text-ink-100 tracking-tight">ClaimRail</span>
          </Link>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 text-sm">
          <NavLink href="/dashboard" icon={<Home className="h-4 w-4" />}>Overview</NavLink>
          <NavLink href="/dashboard/vendors" icon={<Server className="h-4 w-4" />}>Vendors</NavLink>
          <NavLink href="/dashboard/incidents" icon={<AlertTriangle className="h-4 w-4" />}>Incidents</NavLink>
          <NavLink href="/dashboard/claims" icon={<FileText className="h-4 w-4" />}>Claims</NavLink>
          <NavLink href="/dashboard/settings" icon={<Settings className="h-4 w-4" />}>Settings</NavLink>
        </nav>
        <div className="border-t border-ink-200 dark:border-ink-800 p-3">
          <div className="rounded-lg p-3 bg-ink-50 dark:bg-ink-800/60">
            <div className="flex items-center gap-2 text-sm">
              <div className="h-8 w-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-semibold">
                {ctx.user.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink-900 dark:text-ink-100 truncate">{ctx.user.name}</div>
                <div className="text-xs text-ink-500 dark:text-ink-400 truncate">{ctx.org.name}</div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <Badge tone="success" className="capitalize text-[10px]">
                {ctx.org.plan}
              </Badge>
              <form action={logoutAction}>
                <button className="text-xs text-ink-500 dark:text-ink-400 hover:text-ink-900 dark:hover:text-ink-100 inline-flex items-center gap-1">
                  <LogOut className="h-3 w-3" /> Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-x-hidden">
        <TopBar />
        {children}
      </main>
    </div>
  );
}

function TopBar() {
  return (
    <div className="sticky top-0 z-30 h-14 border-b border-ink-200 dark:border-ink-800 bg-white/70 dark:bg-ink-900/70 backdrop-blur-md flex items-center justify-end gap-2 px-6">
      <CommandHint />
      <NotificationBell />
      <ThemeToggle />
    </div>
  );
}

function CommandHint() {
  return (
    <div className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-ink-200 dark:border-ink-700 bg-ink-50 dark:bg-ink-800/60 px-2.5 h-8 text-xs text-ink-500 dark:text-ink-400">
      <Command className="h-3 w-3" />
      <span>Press</span>
      <kbd className="font-mono text-[10px] bg-ink-100 dark:bg-ink-700 rounded px-1 py-0.5">⌘K</kbd>
      <span>to search</span>
    </div>
  );
}

function NavLink({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-ink-700 dark:text-ink-200 hover:bg-ink-100 dark:hover:bg-ink-800/60 hover:text-ink-900 dark:hover:text-ink-100 transition-colors"
    >
      <span className="text-ink-500 dark:text-ink-400">{icon}</span>
      <span>{children}</span>
    </Link>
  );
}
