'use client';

import { format } from 'date-fns';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { InBodyEntry } from '@/types';
import { useMemo } from 'react';

interface BodyCompositionChartProps {
  entries: InBodyEntry[];
}

export function BodyCompositionChart({ entries }: BodyCompositionChartProps) {
  const chartData = useMemo(() => {
    // Sort by date ascending for chart
    const sorted = [...entries].sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );

    return sorted.map(entry => ({
      date: format(entry.date, 'MMM d'),
      weight: entry.weight,
      bodyFat: entry.bodyFatPercentage,
      muscleMass: entry.muscleMass,
    }));
  }, [entries]);

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Body Composition</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">No InBody data available. Add your first entry below.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Body Composition</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                stroke="#6b7280"
                fontSize={12}
              />
              <YAxis
                yAxisId="left"
                stroke="#6b7280"
                fontSize={12}
                tickFormatter={(value) => `${value}`}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#6b7280"
                fontSize={12}
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                }}
                formatter={(value, name) => {
                  if (name === 'weight') return [`${value} lbs`, 'Weight'];
                  if (name === 'bodyFat') return [`${value}%`, 'Body Fat'];
                  if (name === 'muscleMass') return [`${value} lbs`, 'Muscle Mass'];
                  return [value, name];
                }}
              />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="weight"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', strokeWidth: 2 }}
                name="Weight"
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="muscleMass"
                stroke="#10b981"
                strokeWidth={2}
                dot={{ fill: '#10b981', strokeWidth: 2 }}
                name="Muscle Mass"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="bodyFat"
                stroke="#ef4444"
                strokeWidth={2}
                dot={{ fill: '#ef4444', strokeWidth: 2 }}
                name="Body Fat %"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
