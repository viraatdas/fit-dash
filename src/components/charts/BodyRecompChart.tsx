'use client';

import { useMemo } from 'react';
import { format } from 'date-fns';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { InBodyEntry } from '@/types';

interface BodyRecompChartProps {
  entries: InBodyEntry[];
}

export function BodyRecompChart({ entries }: BodyRecompChartProps) {
  const chartData = useMemo(() => {
    const sorted = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime());

    return sorted.map(entry => ({
      date: format(entry.date, 'MMM yy'),
      fullDate: format(entry.date, 'MMM d, yyyy'),
      muscle: entry.muscleMass,
      fat: entry.bodyFatMass || (entry.weight * entry.bodyFatPercentage / 100),
      bodyFatPct: entry.bodyFatPercentage,
      weight: entry.weight,
    }));
  }, [entries]);

  const progressStats = useMemo(() => {
    if (chartData.length < 2) return null;

    const first = chartData[0];
    const last = chartData[chartData.length - 1];

    return {
      muscleChange: (last.muscle - first.muscle).toFixed(1),
      fatChange: (last.fat - first.fat).toFixed(1),
      bfChange: (last.bodyFatPct - first.bodyFatPct).toFixed(1),
      weightChange: (last.weight - first.weight).toFixed(1),
    };
  }, [chartData]);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Body Recomposition</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-400 font-light">Add InBody entries to see your progress</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start flex-wrap gap-4">
          <div>
            <CardTitle>Body Recomposition</CardTitle>
            <p className="text-sm font-light text-gray-400 mt-1">
              Muscle vs Fat mass over time
            </p>
          </div>
          {progressStats && (
            <div className="flex gap-6 text-sm">
              <div className="text-center">
                <p className={`text-lg font-light ${parseFloat(progressStats.muscleChange) >= 0 ? 'text-green-500' : 'text-red-400'}`}>
                  {parseFloat(progressStats.muscleChange) >= 0 ? '+' : ''}{progressStats.muscleChange} lb
                </p>
                <p className="text-xs text-gray-400">muscle</p>
              </div>
              <div className="text-center">
                <p className={`text-lg font-light ${parseFloat(progressStats.fatChange) <= 0 ? 'text-green-500' : 'text-red-400'}`}>
                  {parseFloat(progressStats.fatChange) > 0 ? '+' : ''}{progressStats.fatChange} lb
                </p>
                <p className="text-xs text-gray-400">fat</p>
              </div>
              <div className="text-center">
                <p className={`text-lg font-light ${parseFloat(progressStats.bfChange) <= 0 ? 'text-green-500' : 'text-red-400'}`}>
                  {parseFloat(progressStats.bfChange) > 0 ? '+' : ''}{progressStats.bfChange}%
                </p>
                <p className="text-xs text-gray-400">body fat</p>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} barGap={0}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                stroke="#9ca3af"
                fontSize={11}
                tickLine={false}
              />
              <YAxis
                yAxisId="mass"
                stroke="#9ca3af"
                fontSize={11}
                tickLine={false}
                label={{ value: 'Mass (lbs)', angle: -90, position: 'insideLeft', style: { fill: '#9ca3af', fontSize: 11 } }}
              />
              <YAxis
                yAxisId="pct"
                orientation="right"
                stroke="#9ca3af"
                fontSize={11}
                tickLine={false}
                domain={[0, 30]}
                label={{ value: 'Body Fat %', angle: 90, position: 'insideRight', style: { fill: '#9ca3af', fontSize: 11 } }}
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
                    muscle: 'Muscle Mass',
                    fat: 'Fat Mass',
                    bodyFatPct: 'Body Fat %',
                    weight: 'Total Weight',
                  };
                  const suffix = name === 'bodyFatPct' ? '%' : ' lbs';
                  return [`${value}${suffix}`, labels[name as string] || name];
                }}
                labelFormatter={(_, payload) => {
                  if (payload && payload[0]) {
                    return payload[0].payload.fullDate;
                  }
                  return '';
                }}
              />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <Bar
                yAxisId="mass"
                dataKey="muscle"
                name="Muscle"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
              <Bar
                yAxisId="mass"
                dataKey="fat"
                name="Fat"
                fill="#f59e0b"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="bodyFatPct"
                name="Body Fat %"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ r: 4, fill: '#ef4444' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
