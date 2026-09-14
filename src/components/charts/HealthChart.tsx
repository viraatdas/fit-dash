'use client';

import { useMemo, useState } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { DailyHealth } from '@/types';
import { format, parseISO } from 'date-fns';
import { HeartCard } from '@/components/charts/HeartCard';

interface HealthChartProps {
  data: DailyHealth[];
  onDataUpdate?: () => void;
}

const WINDOW_DAYS = 30;

/** Every calendar day (ascending, oldest → newest) in the last `count` days ending at `newestDate`. */
export function getCalendarWindow(newestDate: string, count: number): string[] {
  const [y, m, d] = newestDate.split('-').map(Number);
  const dates: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const dt = new Date(Date.UTC(y, m - 1, d - i));
    dates.push(dt.toISOString().slice(0, 10));
  }
  return dates;
}

/** A day has "real full-day" hourly coverage: readings in >=18 of 24 hours, spanning ~6:00-22:00. */
export function hasFullDayHourlyCoverage(day: DailyHealth): boolean {
  const hourly = day.hourlyHeartRate;
  if (!hourly || hourly.length < 18) return false;
  const hours = Array.from(new Set(hourly.map(h => h.hour)));
  const hasEarly = hours.some(h => h <= 6);
  const hasLate = hours.some(h => h >= 22);
  return hasEarly && hasLate;
}

export function HealthChart({ data }: HealthChartProps) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Every chart on this tab shares this exact window so dates line up.
  const windowDates = useMemo(() => {
    if (data.length === 0) return [];
    return getCalendarWindow(data[0].date, WINDOW_DAYS);
  }, [data]);

  const chartData = useMemo(() => {
    const byDate = new Map(data.map(d => [d.date, d]));
    return windowDates.map(date => {
      const day = byDate.get(date);
      return {
        date,
        label: format(parseISO(date), 'MMM d'),
        fullDate: format(parseISO(date), 'MMM d, yyyy'),
        steps: day?.steps ?? null,
        activeCalories: day?.activeCalories ?? null,
      };
    });
  }, [data, windowDates]);

  // Explicit x-axis ticks for the Activity chart below: it's a categorical axis (dataKey
  // "label") over all WINDOW_DAYS days, and without an explicit tick set recharts renders
  // every single day's label, which collide/run together ("Sep 9Sep 10Sep 11..."). Thin to
  // roughly every 3-4 days, always keeping the most recent day.
  const activityTicks = useMemo(() => {
    if (chartData.length === 0) return undefined;
    const targetTickCount = 8;
    const step = Math.max(1, Math.ceil(chartData.length / targetTickCount));
    const indices = new Set<number>();
    for (let i = 0; i < chartData.length; i += step) indices.add(i);
    indices.add(chartData.length - 1);
    return Array.from(indices)
      .sort((a, b) => a - b)
      .map(i => chartData[i].label);
  }, [chartData]);

  const qualifyingDays = useMemo(() => data.filter(hasFullDayHourlyCoverage), [data]);

  const activeDay = selectedDay ?? qualifyingDays[0]?.date ?? null;
  const hourlyChartData = useMemo(() => {
    const day = qualifyingDays.find(d => d.date === activeDay);
    if (!day?.hourlyHeartRate) return [];
    return [...day.hourlyHeartRate]
      .sort((a, b) => a.hour - b.hour)
      .map(hr => ({ ...hr, time: `${hr.hour.toString().padStart(2, '0')}:00` }));
  }, [qualifyingDays, activeDay]);

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Apple Health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="font-mono text-xs text-n-text-disabled uppercase tracking-[0.04em] mb-4">[NO HEALTH DATA]</p>
            <p className="text-sm text-n-text-secondary max-w-md mx-auto">
              Health data arrives automatically via the Health Auto Export webhook on your iPhone.
              To upload a JSON export manually instead, use{' '}
              <span className="text-n-text-primary">Settings → Upload Health JSON</span>.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <HeartCard data={data} windowDates={windowDates} />

      {/* Activity Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Activity (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" ticks={activityTicks} fontSize={10} tickLine={false} fontFamily="Space Mono" />
                <YAxis yAxisId="steps" fontSize={10} tickLine={false} fontFamily="Space Mono" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="cal" orientation="right" fontSize={10} tickLine={false} fontFamily="Space Mono" />
                <Tooltip
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
                />
                <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'Space Mono' }} />
                <Area yAxisId="steps" type="monotone" dataKey="steps" name="Steps" fill="rgba(0,0,0,0.05)" stroke="#5B9BF6" strokeWidth={2} connectNulls={false} />
                <Line yAxisId="cal" type="monotone" dataKey="activeCalories" name="Active Cal" stroke="#D4A843" strokeWidth={2} dot={false} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Hourly Heart Rate — only for days with real full-day coverage */}
      {qualifyingDays.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
              <div>
                <CardTitle>Hourly Heart Rate</CardTitle>
                <p className="text-xs text-n-text-disabled mt-1">Heart rate throughout a specific day (full-day coverage only)</p>
              </div>
              <select
                value={activeDay || ''}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="px-3 py-1.5 font-mono text-xs bg-n-surface-raised border border-n-border-visible rounded-nothing-sm text-n-text-primary"
              >
                {qualifyingDays.map(d => (
                  <option key={d.date} value={d.date} className="bg-n-surface">
                    {format(parseISO(d.date), 'MMM d, yyyy')}
                  </option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-48 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={hourlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" fontSize={10} tickLine={false} fontFamily="Space Mono" />
                  <YAxis fontSize={10} tickLine={false} domain={[50, 160]} fontFamily="Space Mono" />
                  <Tooltip
                    formatter={(value) => [`${value} bpm`, 'HR']}
                  />
                  <Area
                    type="monotone"
                    dataKey="heartRate"
                    name="Heart Rate"
                    fill="rgba(0,0,0,0.05)"
                    stroke="#D71921"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#D71921', strokeWidth: 0 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
