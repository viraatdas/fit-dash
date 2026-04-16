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
  ReferenceLine,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { InBodyEntry } from '@/types';
import { BODY_GOAL, projectMuscleTarget } from '@/lib/goals';

interface BodyRecompChartProps {
  entries: InBodyEntry[];
}

export function BodyRecompChart({ entries }: BodyRecompChartProps) {
  const chartData = useMemo(() => {
    const sorted = [...entries].sort((a, b) => a.date.getTime() - b.date.getTime());
    if (sorted.length === 0) return [];
    const firstMonthsAgo = (t: Date) => (t.getTime() - sorted[0].date.getTime()) / (1000 * 60 * 60 * 24 * 30);
    return sorted.map(entry => ({
      date: format(entry.date, 'MMM yy'),
      fullDate: format(entry.date, 'MMM d, yyyy'),
      muscle: entry.muscleMass,
      fat: entry.bodyFatMass || (entry.weight * entry.bodyFatPercentage / 100),
      bodyFatPct: entry.bodyFatPercentage,
      weight: entry.weight,
      muscleTarget: projectMuscleTarget(sorted[0].muscleMass, firstMonthsAgo(entry.date)),
    }));
  }, [entries]);

  const latest = entries.length > 0 ? [...entries].sort((a, b) => b.date.getTime() - a.date.getTime())[0] : null;
  const muscleGap = latest ? +(latest.muscleMass - (chartData[chartData.length - 1]?.muscleTarget ?? 0)).toFixed(1) : 0;
  const bfGap = latest ? +(latest.bodyFatPercentage - BODY_GOAL.targetBodyFatPercentage).toFixed(1) : 0;

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
        <CardHeader><CardTitle>Body Recomposition</CardTitle></CardHeader>
        <CardContent>
          <p className="font-mono text-xs text-n-text-disabled uppercase tracking-[0.04em]">[ADD ENTRIES TO SEE PROGRESS]</p>
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
            <p className="text-xs text-n-text-disabled mt-1">Muscle vs Fat mass over time</p>
          </div>
          {progressStats && (
            <div className="flex gap-6">
              <div className="text-center">
                <p className={`text-lg font-mono tracking-tight ${parseFloat(progressStats.muscleChange) >= 0 ? 'text-n-success' : 'text-n-accent'}`}>
                  {parseFloat(progressStats.muscleChange) >= 0 ? '+' : ''}{progressStats.muscleChange}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-disabled">muscle</p>
              </div>
              <div className="text-center">
                <p className={`text-lg font-mono tracking-tight ${parseFloat(progressStats.fatChange) <= 0 ? 'text-n-success' : 'text-n-accent'}`}>
                  {parseFloat(progressStats.fatChange) > 0 ? '+' : ''}{progressStats.fatChange}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-disabled">fat</p>
              </div>
              <div className="text-center">
                <p className={`text-lg font-mono tracking-tight ${parseFloat(progressStats.bfChange) <= 0 ? 'text-n-success' : 'text-n-accent'}`}>
                  {parseFloat(progressStats.bfChange) > 0 ? '+' : ''}{progressStats.bfChange}%
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-disabled">body fat</p>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {latest && (
          <div className="mb-4 p-3 bg-n-surface-raised rounded-nothing-sm">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-disabled mb-2">Gap to Recomp Goal</p>
            <div className="flex flex-wrap gap-4 text-xs">
              <span className="font-mono text-n-text-secondary">
                Body Fat: <span className={bfGap <= 0 ? 'text-n-success' : 'text-n-warning'}>{bfGap > 0 ? '+' : ''}{bfGap}%</span> to {BODY_GOAL.targetBodyFatPercentage}%
              </span>
              <span className="font-mono text-n-text-secondary">
                Muscle Pace: <span className={muscleGap >= 0 ? 'text-n-success' : 'text-n-warning'}>{muscleGap >= 0 ? '+' : ''}{muscleGap} lb</span> vs target ({BODY_GOAL.targetMuscleGainLbsPerMonth} lb/mo)
              </span>
            </div>
          </div>
        )}
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} barGap={0}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" fontSize={10} tickLine={false} fontFamily="Space Mono" />
              <YAxis yAxisId="mass" fontSize={10} tickLine={false} fontFamily="Space Mono" />
              <YAxis yAxisId="pct" orientation="right" fontSize={10} tickLine={false} domain={[0, 30]} fontFamily="Space Mono" />
              <Tooltip
                formatter={(value, name) => {
                  const labels: Record<string, string> = { muscle: 'MUSCLE', fat: 'FAT', bodyFatPct: 'BF%', weight: 'WEIGHT', muscleTarget: 'MUSCLE TARGET' };
                  const suffix = name === 'bodyFatPct' ? '%' : ' lbs';
                  return [`${value}${suffix}`, labels[name as string] || name];
                }}
                labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
              />
              <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'Space Mono' }} />
              <Bar yAxisId="mass" dataKey="muscle" name="Muscle" fill="#4A9E5C" radius={[2, 2, 0, 0]} maxBarSize={40} />
              <Bar yAxisId="mass" dataKey="fat" name="Fat" fill="#D4A843" radius={[2, 2, 0, 0]} maxBarSize={40} />
              <Line yAxisId="mass" type="monotone" dataKey="muscleTarget" name="Muscle Target" stroke="#4A9E5C" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
              <Line yAxisId="pct" type="monotone" dataKey="bodyFatPct" name="Body Fat %" stroke="#D71921" strokeWidth={2} dot={{ r: 4, fill: '#D71921', strokeWidth: 0 }} />
              <ReferenceLine yAxisId="pct" y={BODY_GOAL.targetBodyFatPercentage} stroke="#D71921" strokeDasharray="4 4" strokeOpacity={0.6} label={{ value: `Goal ${BODY_GOAL.targetBodyFatPercentage}%`, fill: '#D71921', fontSize: 10, fontFamily: 'Space Mono', position: 'insideTopRight' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
