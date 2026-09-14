'use client';

import { useMemo } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { DailyHealth } from '@/types';
import { computeRecovery, computeBaselineSeries, BaselineDayPoint } from '@/lib/health/recovery';
import { format, parseISO } from 'date-fns';

interface HeartCardProps {
  /** Full health history, newest-first (same convention as computeRecovery). */
  data: DailyHealth[];
  /** The shared calendar-day window (oldest → newest) every Health-tab chart plots — see HealthChart.tsx. */
  windowDates: string[];
}

interface SparklinePoint {
  date: string;
  label: string;
  fullDate: string;
  value: number | null;
  band: [number, number] | null;
  isNewest: boolean;
}

function buildSparklinePoints(
  windowDates: string[],
  byDate: Map<string, BaselineDayPoint>,
  metric: 'restingHr' | 'hrv'
): SparklinePoint[] {
  const points: SparklinePoint[] = windowDates.map(date => {
    const point = byDate.get(date);
    const value = point?.[metric] ?? null;
    const low = metric === 'restingHr' ? point?.rhrBaselineLow : point?.hrvBaselineLow;
    const high = metric === 'restingHr' ? point?.rhrBaselineHigh : point?.hrvBaselineHigh;
    return {
      date,
      label: format(parseISO(date), 'MMM d'),
      fullDate: format(parseISO(date), 'MMM d, yyyy'),
      value,
      band: low != null && high != null ? [low, high] : null,
      isNewest: false,
    };
  });

  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].value !== null) {
      points[i].isNewest = true;
      break;
    }
  }

  return points;
}

function Sparkline({
  points,
  color,
  unit,
  formatValue,
}: {
  points: SparklinePoint[];
  color: string;
  unit: string;
  formatValue: (v: number) => string;
}) {
  const hasAnyData = points.some(p => p.value !== null);

  if (!hasAnyData) {
    return (
      <div className="h-20 flex items-center justify-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-n-text-disabled">[NO DATA]</p>
      </div>
    );
  }

  return (
    <div className="h-20 sm:h-24">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey="label" hide />
          <YAxis hide domain={['auto', 'auto']} />
          <Tooltip
            labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
            formatter={(value: unknown, name?: string) => {
              if (name === 'band' || typeof value !== 'number') return null;
              return [`${formatValue(value)} ${unit}`, 'VALUE'];
            }}
          />
          <Area
            type="monotone"
            dataKey="band"
            name="band"
            fill={color}
            fillOpacity={0.12}
            stroke="none"
            isAnimationActive={false}
            connectNulls={false}
          />
          <Line
            type="monotone"
            dataKey="value"
            name="value"
            stroke={color}
            strokeWidth={2}
            dot={(props: { cx?: number; cy?: number; payload?: SparklinePoint; index?: number }) => {
              const { cx, cy, payload, index } = props;
              if (cx === undefined || cy === undefined || !payload) return <g key={`dot-${index}`} />;
              if (!payload.isNewest) return <g key={`dot-${index}`} />;
              return (
                <circle key={`dot-${index}`} cx={cx} cy={cy} r={4} fill={color} stroke="var(--n-surface)" strokeWidth={2} />
              );
            }}
            activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HeartCard({ data, windowDates }: HeartCardProps) {
  const recovery = useMemo(() => computeRecovery(data), [data]);

  const { rhrPoints, hrvPoints } = useMemo(() => {
    const baseline = computeBaselineSeries(data);
    const byDate = new Map(baseline.map(b => [b.date, b]));
    return {
      rhrPoints: buildSparklinePoints(windowDates, byDate, 'restingHr'),
      hrvPoints: buildSparklinePoints(windowDates, byDate, 'hrv'),
    };
  }, [data, windowDates]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Heart</CardTitle>
        <p className="text-xs text-n-text-disabled mt-1">
          Resting HR + HRV vs. rolling 7-day baseline (shaded band = mean ± 1 SD)
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-secondary">Resting HR</p>
              {recovery.restingHr !== null && (
                <p className="font-mono text-sm text-n-text-primary">
                  {recovery.restingHr}
                  <span className="text-[10px] text-n-text-disabled ml-1">bpm</span>
                  {recovery.restingHrDelta !== null && (
                    <span className={`ml-2 text-[10px] ${recovery.restingHrDelta <= 0 ? 'text-n-success' : 'text-n-accent'}`}>
                      {recovery.restingHrDelta > 0 ? '+' : ''}
                      {recovery.restingHrDelta} vs base
                    </span>
                  )}
                </p>
              )}
            </div>
            <Sparkline points={rhrPoints} color="#D71921" unit="bpm" formatValue={v => Math.round(v).toString()} />
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-secondary">HRV</p>
              {recovery.hrv !== null && (
                <p className="font-mono text-sm text-n-text-primary">
                  {recovery.hrv}
                  <span className="text-[10px] text-n-text-disabled ml-1">ms</span>
                  {recovery.hrvDeltaPct !== null && (
                    <span className={`ml-2 text-[10px] ${recovery.hrvDeltaPct >= 0 ? 'text-n-success' : 'text-n-accent'}`}>
                      {recovery.hrvDeltaPct > 0 ? '+' : ''}
                      {recovery.hrvDeltaPct}% vs base
                    </span>
                  )}
                </p>
              )}
            </div>
            <Sparkline points={hrvPoints} color="#4A9E5C" unit="ms" formatValue={v => Math.round(v).toString()} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
