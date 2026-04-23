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
  filedCents: number;
  recoveredCents: number;
}

export function RecoveryChart({ data }: { data: RecoveryPoint[] }) {
  const dataPoints = data.map((d) => ({
    period: d.period,
    Filed: d.filedCents / 100,
    Recovered: d.recoveredCents / 100,
  }));
  const hasAny = dataPoints.some((d) => d.Filed > 0 || d.Recovered > 0);

  if (!hasAny) {
    return (
      <div className="h-56 w-full rounded-lg border border-dashed border-ink-200 dark:border-ink-800 flex items-center justify-center">
        <div className="text-center text-sm text-ink-500 dark:text-ink-400">
          <div className="font-medium">No filed claims yet.</div>
          <div className="text-xs mt-1">
            Your first drafted breach will show up here.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dataPoints} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
          <XAxis dataKey="period" stroke="#94a3b8" fontSize={11} tickLine={false} />
          <YAxis
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${Number(v).toLocaleString()}`}
            width={72}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              fontSize: 12,
              background: 'white',
            }}
            formatter={(v) => formatCents(Math.round(Number(v) * 100))}
          />
          <Legend
            iconType="square"
            wrapperStyle={{ fontSize: 11 }}
            verticalAlign="top"
            align="right"
          />
          <Bar dataKey="Filed" stackId="a" fill="#94a3b8" radius={[0, 0, 0, 0]} />
          <Bar dataKey="Recovered" stackId="b" fill="#10b981" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
