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
  ReferenceLine,
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

// Normalize exercise names to canonical forms for grouping
function normalizeForGrouping(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('chest') || lower.includes('bench')) return 'chestPress';
  if (lower.includes('squat')) return 'squat';
  if (lower.includes('row')) return 'row';
  if (lower.includes('leg press')) return 'legPress';
  return '';
}

// Calculate estimated 1RM using Brzycki formula
function calculate1RM(weight: number, reps: number): number {
  if (reps === 0 || weight === 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (36 / (37 - reps)));
}

export function StrengthProgressChart({ workouts }: StrengthProgressChartProps) {
  const progressData = useMemo(() => {
    // Sort workouts by date ascending
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

        // Find max weight from sets
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

    // Calculate trend line (simple linear regression)
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

  // Calculate overall progress
  const progressStats = useMemo(() => {
    if (progressData.length < 2) return null;

    const first = progressData[0];
    const last = progressData[progressData.length - 1];
    const change = last.avgStrength - first.avgStrength;
    const percentChange = ((change / first.avgStrength) * 100).toFixed(1);

    return {
      startAvg: first.avgStrength,
      endAvg: last.avgStrength,
      change,
      percentChange,
      isPositive: change > 0,
    };
  }, [progressData]);

  if (progressData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Strength Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-400 font-light">Not enough workout data to show progress</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Strength Progress (Estimated 1RM)</CardTitle>
            <p className="text-sm font-light text-gray-400 mt-1">
              Normalized strength across major lifts over time
            </p>
          </div>
          {progressStats && (
            <div className="text-right">
              <p className={`text-2xl font-light ${progressStats.isPositive ? 'text-green-500' : 'text-red-400'}`}>
                {progressStats.isPositive ? '+' : ''}{progressStats.percentChange}%
              </p>
              <p className="text-xs font-light text-gray-400">overall progress</p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={progressData}>
              <defs>
                <linearGradient id="strengthGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                stroke="#9ca3af"
                fontSize={11}
                tickLine={false}
              />
              <YAxis
                stroke="#9ca3af"
                fontSize={11}
                tickLine={false}
                tickFormatter={(value) => `${value}`}
                label={{ value: 'Est. 1RM (lbs)', angle: -90, position: 'insideLeft', style: { fill: '#9ca3af', fontSize: 11 } }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
                formatter={(value, name) => {
                  const labels: Record<string, string> = {
                    chestPress: 'Chest Press',
                    squat: 'Squat',
                    row: 'Row',
                    legPress: 'Leg Press',
                    avgStrength: 'Avg Strength',
                    trendLine: 'Trend',
                  };
                  return [`${value} lbs`, labels[name as string] || name];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: '11px' }}
                formatter={(value) => {
                  const labels: Record<string, string> = {
                    chestPress: 'Chest',
                    squat: 'Squat',
                    row: 'Row',
                    legPress: 'Leg Press',
                    avgStrength: 'Average',
                    trendLine: 'Trend',
                  };
                  return labels[value] || value;
                }}
              />
              <Area
                type="monotone"
                dataKey="avgStrength"
                fill="url(#strengthGradient)"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="trendLine"
                stroke="#10b981"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="chestPress"
                stroke="#f59e0b"
                strokeWidth={1.5}
                dot={{ r: 3 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="squat"
                stroke="#ef4444"
                strokeWidth={1.5}
                dot={{ r: 3 }}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="row"
                stroke="#8b5cf6"
                strokeWidth={1.5}
                dot={{ r: 3 }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
