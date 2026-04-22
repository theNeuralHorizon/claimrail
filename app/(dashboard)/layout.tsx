import Link from 'next/link';
import { requireAuth } from '@/lib/auth/session';
import { logoutAction } from '@/lib/auth/actions';
import { Home, Server, AlertTriangle, FileText, Settings, LogOut } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireAuth();
  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      <aside className="w-full md:w-60 bg-white border-b md:border-b-0 md:border-r border-ink-200 flex flex-col">
        <div className="px-5 h-16 flex items-center border-b border-ink-200">
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
            <span className="text-ink-900 tracking-tight">ClaimRail</span>
          </Link>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 text-sm">
          <NavLink href="/dashboard" icon={<Home className="h-4 w-4" />}>Overview</NavLink>
          <NavLink href="/dashboard/vendors" icon={<Server className="h-4 w-4" />}>Vendors</NavLink>
          <NavLink href="/dashboard/incidents" icon={<AlertTriangle className="h-4 w-4" />}>Incidents</NavLink>
          <NavLink href="/dashboard/claims" icon={<FileText className="h-4 w-4" />}>Claims</NavLink>
          <NavLink href="/dashboard/settings" icon={<Settings className="h-4 w-4" />}>Settings</NavLink>
        </nav>
        <div className="border-t border-ink-200 p-3">
          <div className="rounded-lg p-3 bg-ink-50">
            <div className="flex items-center gap-2 text-sm">
              <div className="h-8 w-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-xs font-semibold">
                {ctx.user.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink-900 truncate">{ctx.user.name}</div>
                <div className="text-xs text-ink-500 truncate">{ctx.org.name}</div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <Badge tone="success" className="capitalize text-[10px]">
                {ctx.org.plan}
              </Badge>
              <form action={logoutAction}>
                <button className="text-xs text-ink-500 hover:text-ink-900 inline-flex items-center gap-1">
                  <LogOut className="h-3 w-3" /> Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
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
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-ink-700 hover:bg-ink-100 hover:text-ink-900 transition-colors"
    >
      <span className="text-ink-500">{icon}</span>
      <span>{children}</span>
    </Link>
  );
}
