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
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { InBodyEntry } from '@/types';
import { useMemo } from 'react';
import { BODY_GOAL } from '@/lib/goals';
import { DexaBfDot } from './DexaBfDot';

interface BodyCompositionChartProps {
  entries: InBodyEntry[];
}

export function BodyCompositionChart({ entries }: BodyCompositionChartProps) {
  const chartData = useMemo(() => {
    const sorted = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime());
    return sorted.map(entry => {
      const isDexa = entry.source === 'dexa';
      return {
        date: isDexa && entry.dateUnknown ? 'DEXA' : format(entry.date, 'MMM d'),
        fullDate: isDexa && entry.dateUnknown ? 'DEXA · date unknown' : format(entry.date, 'MMM d, yyyy'),
        weight: entry.weight,
        bodyFat: entry.bodyFatPercentage,
        muscleMass: entry.muscleMass,
        source: entry.source ?? 'inbody',
      };
    });
  }, [entries]);

  const latest = entries.length > 0 ? [...entries].sort((a, b) => b.date.getTime() - a.date.getTime())[0] : null;
  const currentIsDexa = latest?.source === 'dexa';

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
      <CardHeader>
        <CardTitle>Body Composition</CardTitle>
        <p className="text-xs text-n-text-disabled mt-1">Weight band {BODY_GOAL.targetWeightRange.min}-{BODY_GOAL.targetWeightRange.max} lb · BF% goal {BODY_GOAL.targetBodyFatPercentage}%</p>
        {currentIsDexa && (
          <p className="font-mono text-[10px] text-n-text-disabled mt-2 leading-relaxed">
            Latest Body Fat % is a DEXA scan (date unknown) — DEXA typically reads several points higher than InBody&apos;s bioimpedance method, so this jump is mostly measurement method, not fat gained.
          </p>
        )}
      </CardHeader>
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
                labelFormatter={(label, payload) => payload?.[0]?.payload?.fullDate || label}
              />
              <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'Space Mono' }} />
              <ReferenceArea yAxisId="left" y1={BODY_GOAL.targetWeightRange.min} y2={BODY_GOAL.targetWeightRange.max} fill="#E8E8E8" fillOpacity={0.04} strokeOpacity={0} />
              <ReferenceLine yAxisId="right" y={BODY_GOAL.targetBodyFatPercentage} stroke="#D71921" strokeDasharray="4 4" strokeOpacity={0.5} label={{ value: `Goal ${BODY_GOAL.targetBodyFatPercentage}%`, fill: '#D71921', fontSize: 10, fontFamily: 'Space Mono', position: 'insideTopRight' }} />
              <Line yAxisId="left" type="monotone" dataKey="weight" stroke="#E8E8E8" strokeWidth={2} dot={{ fill: '#E8E8E8', strokeWidth: 0, r: 3 }} name="Weight" connectNulls />
              <Line yAxisId="left" type="monotone" dataKey="muscleMass" stroke="#4A9E5C" strokeWidth={2} dot={{ fill: '#4A9E5C', strokeWidth: 0, r: 3 }} name="Muscle Mass" connectNulls />
              <Line yAxisId="right" type="monotone" dataKey="bodyFat" stroke="#D71921" strokeWidth={2} dot={<DexaBfDot defaultColor="#D71921" r={3} />} name="Body Fat %" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
