'use client';

import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';

export interface UptimeChartPoint {
  timestamp: number;
  latencyMs: number | null;
  status: 'up' | 'degraded' | 'down';
}

export function LatencyChart({
  points,
  degradedThresholdMs = 3000,
}: {
  points: UptimeChartPoint[];
  degradedThresholdMs?: number;
}) {
  if (points.length === 0) {
    return (
      <div className="h-56 w-full rounded-lg border border-dashed border-ink-200 flex items-center justify-center">
        <div className="text-center text-sm text-ink-500">
          <div className="font-medium">No probe data yet.</div>
          <div className="text-xs mt-1">
            Hit <span className="font-mono bg-ink-100 px-1.5 py-0.5 rounded">Probe now</span> above or wait for the next scheduled run.
          </div>
        </div>
      </div>
    );
  }
  const data = points
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((p) => ({
      t: p.timestamp * 1000,
      latency: p.status === 'down' ? null : p.latencyMs,
      status: p.status,
    }));
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(t) => new Date(t).toLocaleDateString()}
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
          />
          <YAxis
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}ms`}
            width={55}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              fontSize: 12,
            }}
            labelFormatter={(t) => new Date(Number(t)).toLocaleString()}
            formatter={(v, _n, p) => {
              const status = (p.payload as { status: string }).status;
              return [`${v}ms`, status];
            }}
          />
          <ReferenceLine
            y={degradedThresholdMs}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            label={{ value: 'Degraded', fill: '#d97706', fontSize: 10, position: 'right' }}
          />
          <Line
            type="monotone"
            dataKey="latency"
            stroke="#10b981"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
