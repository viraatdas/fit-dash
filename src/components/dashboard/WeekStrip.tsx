'use client';

import { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { Workout, DailyHealth } from '@/types';
import { todayKey, laDayKey, daysBetweenKeys, classifyWeek } from '@/lib/la-week';

interface WeekStripProps {
  workouts: Workout[];
  /** Newest-first, same convention as /api/health. */
  healthData: DailyHealth[];
}

function computeWorkoutsWeek(workouts: Workout[]): { thisWeek: number; lastWeek: number } {
  const today = todayKey();
  let thisWeek = 0;
  let lastWeek = 0;
  for (const w of workouts) {
    const cls = classifyWeek(daysBetweenKeys(today, laDayKey(w.date)));
    if (cls === 'this') thisWeek++;
    else if (cls === 'last') lastWeek++;
  }
  return { thisWeek, lastWeek };
}

// Averages only over days that actually have the metric — a day with no
// reading (device off, not synced) shouldn't drag the average toward zero.
function computeHealthAvgWeek(healthData: DailyHealth[], metric: 'steps' | 'activeCalories'): { thisAvg: number | null; lastAvg: number | null } {
  const today = todayKey();
  const thisVals: number[] = [];
  const lastVals: number[] = [];
  for (const d of healthData) {
    const v = d[metric];
    if (v == null) continue;
    const cls = classifyWeek(daysBetweenKeys(today, laDayKey(d.date)));
    if (cls === 'this') thisVals.push(v);
    else if (cls === 'last') lastVals.push(v);
  }
  const avg = (xs: number[]) => (xs.length > 0 ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return { thisAvg: avg(thisVals), lastAvg: avg(lastVals) };
}

function weekMetric(current: number | null, previous: number | null): { label: string; color: string } {
  if (current === null) return { label: 'no data', color: 'text-n-text-disabled' };
  if (previous === null) return { label: 'no prior data', color: 'text-n-text-disabled' };
  const diff = current - previous;
  if (diff > 0) return { label: `▲${diff} vs last week`, color: 'text-n-success' };
  if (diff < 0) return { label: `▼${Math.abs(diff)} vs last week`, color: 'text-n-warning' };
  return { label: 'same as last week', color: 'text-n-text-disabled' };
}

export function WeekStrip({ workouts, healthData }: WeekStripProps) {
  const { thisWeek: workoutsThis, lastWeek: workoutsLast } = useMemo(() => computeWorkoutsWeek(workouts), [workouts]);
  const steps = useMemo(() => computeHealthAvgWeek(healthData, 'steps'), [healthData]);
  const calories = useMemo(() => computeHealthAvgWeek(healthData, 'activeCalories'), [healthData]);

  const items = [
    { label: 'Workouts', value: `${workoutsThis}`, delta: weekMetric(workoutsThis, workoutsLast) },
    { label: 'Avg Steps/Day', value: steps.thisAvg !== null ? steps.thisAvg.toLocaleString() : '–', delta: weekMetric(steps.thisAvg, steps.lastAvg) },
    { label: 'Avg Active Cal/Day', value: calories.thisAvg !== null ? `${calories.thisAvg}` : '–', delta: weekMetric(calories.thisAvg, calories.lastAvg) },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>This Week</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {items.map(item => (
            <div key={item.label} className="text-center">
              <p className="text-xl sm:text-2xl font-mono text-n-text-display tracking-tight">{item.value}</p>
              <p className="font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.08em] text-n-text-secondary mt-1">{item.label}</p>
              <p className={`font-mono text-[9px] sm:text-[10px] mt-1 ${item.delta.color}`}>{item.delta.label}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
