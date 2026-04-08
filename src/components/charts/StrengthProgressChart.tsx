'use client';

import { useMemo } from 'react';
import { format } from 'date-fns';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { Workout } from '@/types';

interface StrengthProgressChartProps {
  workouts: Workout[];
}

interface ProgressDataPoint {
  date: string;
  timestamp: number;
  chestPress?: number;
  squat?: number;
  row?: number;
  legPress?: number;
  avgStrength: number;
  trendLine: number;
}

function normalizeForGrouping(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('chest') || lower.includes('bench')) return 'chestPress';
  if (lower.includes('squat')) return 'squat';
  if (lower.includes('row')) return 'row';
  if (lower.includes('leg press')) return 'legPress';
  return '';
}

function calculate1RM(weight: number, reps: number): number {
  if (reps === 0 || weight === 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (36 / (37 - reps)));
}

const CHART_COLORS = {
  primary: '#E8E8E8',
  trend: '#4A9E5C',
  chest: '#D4A843',
  squat: '#D71921',
  row: '#5B9BF6',
};

export function StrengthProgressChart({ workouts }: StrengthProgressChartProps) {
  const progressData = useMemo(() => {
    const sorted = [...workouts].sort((a, b) => a.date.getTime() - b.date.getTime());
    const dataPoints: ProgressDataPoint[] = [];

    for (const workout of sorted) {
      const point: ProgressDataPoint = {
        date: format(workout.date, 'MMM d, yy'),
        timestamp: workout.date.getTime(),
        avgStrength: 0,
        trendLine: 0,
      };

      const strengthValues: number[] = [];

      for (const exercise of workout.exercises) {
        const group = normalizeForGrouping(exercise.normalizedName);
        if (!group) continue;

        const maxSet = exercise.sets.reduce(
          (max, set) => (set.weight > max.weight ? set : max),
          { weight: 0, reps: 0 }
        );

        if (maxSet.weight > 0) {
          const estimated1RM = calculate1RM(maxSet.weight, maxSet.reps);
          (point as unknown as Record<string, number | string>)[group] = estimated1RM;
          strengthValues.push(estimated1RM);
        }
      }

      if (strengthValues.length > 0) {
        point.avgStrength = Math.round(
          strengthValues.reduce((a, b) => a + b, 0) / strengthValues.length
        );
        dataPoints.push(point);
      }
    }

    if (dataPoints.length >= 2) {
      const n = dataPoints.length;
      const sumX = dataPoints.reduce((sum, _, i) => sum + i, 0);
      const sumY = dataPoints.reduce((sum, p) => sum + p.avgStrength, 0);
      const sumXY = dataPoints.reduce((sum, p, i) => sum + i * p.avgStrength, 0);
      const sumX2 = dataPoints.reduce((sum, _, i) => sum + i * i, 0);

      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      dataPoints.forEach((point, i) => {
        point.trendLine = Math.round(intercept + slope * i);
      });
    }

    return dataPoints;
  }, [workouts]);

  const progressStats = useMemo(() => {
    if (progressData.length < 2) return null;
    const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
    const recentData = progressData.filter(p => p.timestamp >= oneYearAgo);
    if (recentData.length < 2) return null;
    const first = recentData[0];
    const last = recentData[recentData.length - 1];
    const change = last.avgStrength - first.avgStrength;
    const percentChange = ((change / first.avgStrength) * 100).toFixed(1);
    return { startAvg: first.avgStrength, endAvg: last.avgStrength, change, percentChange, isPositive: change > 0 };
  }, [progressData]);

  if (progressData.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Strength Progress</CardTitle></CardHeader>
        <CardContent>
          <p className="font-mono text-xs text-n-text-disabled uppercase tracking-[0.04em]">[NOT ENOUGH DATA]</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
          <div>
            <CardTitle>Strength Progress (Est. 1RM)</CardTitle>
            <p className="text-xs text-n-text-disabled mt-1">Normalized strength over time</p>
          </div>
          {progressStats && (
            <div className="text-left sm:text-right">
              <p className={`text-2xl sm:text-3xl font-mono tracking-tight ${progressStats.isPositive ? 'text-n-success' : 'text-n-accent'}`}>
                {progressStats.isPositive ? '+' : ''}{progressStats.percentChange}%
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-disabled">overall progress (past 1 year)</p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-56 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={progressData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={10} tickLine={false} fontFamily="Space Mono" />
              <YAxis fontSize={10} tickLine={false} fontFamily="Space Mono" />
              <Tooltip
                formatter={(value, name) => {
                  const labels: Record<string, string> = { chestPress: 'CHEST', squat: 'SQUAT', row: 'ROW', legPress: 'LEG PRESS', avgStrength: 'AVG', trendLine: 'TREND' };
                  return [`${value} lbs`, labels[name as string] || name];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: '10px', fontFamily: 'Space Mono' }}
                formatter={(value) => {
                  const labels: Record<string, string> = { chestPress: 'CHEST', squat: 'SQUAT', row: 'ROW', legPress: 'LEG PRESS', avgStrength: 'AVG', trendLine: 'TREND' };
                  return labels[value] || value;
                }}
              />
              <Area type="monotone" dataKey="avgStrength" fill="rgba(0,0,0,0.05)" stroke={CHART_COLORS.primary} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="trendLine" stroke={CHART_COLORS.trend} strokeWidth={2} strokeDasharray="5 5" dot={false} />
              <Line type="monotone" dataKey="chestPress" stroke={CHART_COLORS.chest} strokeWidth={1.5} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="squat" stroke={CHART_COLORS.squat} strokeWidth={1.5} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="row" stroke={CHART_COLORS.row} strokeWidth={1.5} dot={{ r: 3 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
