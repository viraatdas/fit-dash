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
    const sorted = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime());
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
        <CardHeader><CardTitle>Body Composition</CardTitle></CardHeader>
        <CardContent>
          <p className="font-mono text-xs text-n-text-disabled uppercase tracking-[0.04em]">[NO DATA — ADD ENTRY BELOW]</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle>Body Composition</CardTitle></CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={10} fontFamily="Space Mono" />
              <YAxis yAxisId="left" fontSize={10} fontFamily="Space Mono" />
              <YAxis yAxisId="right" orientation="right" fontSize={10} fontFamily="Space Mono" tickFormatter={(value) => `${value}%`} />
              <Tooltip
                formatter={(value, name) => {
                  if (name === 'weight') return [`${value} lbs`, 'WEIGHT'];
                  if (name === 'bodyFat') return [`${value}%`, 'BODY FAT'];
                  if (name === 'muscleMass') return [`${value} lbs`, 'MUSCLE'];
                  return [value, name];
                }}
              />
              <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'Space Mono' }} />
              <Line yAxisId="left" type="monotone" dataKey="weight" stroke="#E8E8E8" strokeWidth={2} dot={{ fill: '#E8E8E8', strokeWidth: 0, r: 3 }} name="Weight" />
              <Line yAxisId="left" type="monotone" dataKey="muscleMass" stroke="#4A9E5C" strokeWidth={2} dot={{ fill: '#4A9E5C', strokeWidth: 0, r: 3 }} name="Muscle Mass" />
              <Line yAxisId="right" type="monotone" dataKey="bodyFat" stroke="#D71921" strokeWidth={2} dot={{ fill: '#D71921', strokeWidth: 0, r: 3 }} name="Body Fat %" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
