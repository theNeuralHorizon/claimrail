'use client';

import {
  BarChart,
  Bar,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { formatCents } from '@/lib/sla/engine';

export interface RecoveryPoint {
  period: string;
  draftedCents: number;
  filedCents: number;
  recoveredCents: number;
}

export function RecoveryChart({ data }: { data: RecoveryPoint[] }) {
  const dataPoints = data.map((d) => ({
    period: d.period.slice(5) + ' · ' + d.period.slice(2, 4),
    Drafted: d.draftedCents / 100,
    Filed: d.filedCents / 100,
    Recovered: d.recoveredCents / 100,
  }));
  const hasAny = dataPoints.some((d) => d.Drafted > 0 || d.Filed > 0 || d.Recovered > 0);

  if (!hasAny) {
    return (
      <div className="h-64 w-full rounded-xl border border-dashed border-ink-200 dark:border-ink-800 flex items-center justify-center bg-ink-50/40 dark:bg-ink-900/40">
        <div className="text-center text-sm text-ink-500 dark:text-ink-400 max-w-xs px-4">
          <div className="font-semibold text-ink-700 dark:text-ink-200">Nothing to show yet</div>
          <div className="text-xs mt-1.5">
            Your first drafted claim will appear here, grouped by the billing period it covers.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dataPoints} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="bar-drafted" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#cbd5e1" />
              <stop offset="100%" stopColor="#94a3b8" />
            </linearGradient>
            <linearGradient id="bar-filed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60a5fa" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
            <linearGradient id="bar-recovered" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="currentColor" strokeDasharray="4 4" vertical={false} className="text-ink-200 dark:text-ink-800" />
          <XAxis
            dataKey="period"
            stroke="currentColor"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            className="text-ink-400 dark:text-ink-500"
          />
          <YAxis
            stroke="currentColor"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => {
              const n = Number(v);
              if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`;
              return `$${n}`;
            }}
            width={48}
            className="text-ink-400 dark:text-ink-500"
          />
          <Tooltip
            cursor={{ fill: 'rgba(148,163,184,0.1)' }}
            contentStyle={{
              borderRadius: 10,
              border: '1px solid rgba(148,163,184,0.25)',
              fontSize: 12,
              background: 'rgba(15,23,42,0.95)',
              color: 'white',
              boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
            }}
            itemStyle={{ color: 'white' }}
            formatter={(v) => formatCents(Math.round(Number(v) * 100))}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            align="right"
            verticalAlign="top"
          />
          <Bar dataKey="Drafted" stackId="stack" fill="url(#bar-drafted)" radius={[0, 0, 0, 0]} />
          <Bar dataKey="Filed" stackId="stack" fill="url(#bar-filed)" radius={[0, 0, 0, 0]} />
          <Bar dataKey="Recovered" stackId="stack" fill="url(#bar-recovered)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
