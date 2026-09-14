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
import { Card, CardHeader, CardTitle, CardContent, Select } from '@/components/ui';
import { Workout } from '@/types';
import { useState, useMemo, useEffect } from 'react';
import {
  filterOutliers,
  applyDataCorrection,
  chartRangeStart,
  defaultChartRange,
  ChartRangeKey,
} from '@/lib/exercise/strength';
import { RangeSelector } from './RangeSelector';

interface WeightProgressChartProps {
  workouts: Workout[];
}

interface ChartDataPoint {
  timestamp: number;
  weight: number;
  maxWeight?: number;
  totalVolume: number;
}

const DEFAULT_EXERCISE = 'Bench Press';

/** X-axis tick label: day-level ("Sep 3") for short ranges, month+year ("Mar '26") for
 *  longer ones — and a year suffix on day-level ticks too whenever the visible window itself
 *  spans a year boundary, so no tick is ever ambiguous about which year it falls in. */
function formatTick(timestamp: number, range: ChartRangeKey, spansYearBoundary: boolean): string {
  const date = new Date(timestamp);
  if (range === '1M' || range === '3M') {
    return spansYearBoundary ? format(date, "MMM d ''yy") : format(date, 'MMM d');
  }
  return format(date, "MMM ''yy");
}

export function WeightProgressChart({ workouts }: WeightProgressChartProps) {
  const exercises = useMemo(() => {
    const exerciseSet = new Set<string>();
    workouts.forEach(w => {
      w.exercises.forEach(e => {
        exerciseSet.add(e.normalizedName);
      });
    });
    return Array.from(exerciseSet).sort();
  }, [workouts]);

  // Defaults to "Bench Press" (falling back to whatever's first alphabetically if the user
  // has no bench press history) — recomputed once real data is available rather than locked
  // in at mount, since `workouts` can arrive asynchronously after an initial empty/cached
  // render. Stops auto-updating the moment the user picks an exercise themselves.
  const [selectedExercise, setSelectedExercise] = useState('');
  const [exerciseTouched, setExerciseTouched] = useState(false);

  useEffect(() => {
    if (exerciseTouched || exercises.length === 0) return;
    setSelectedExercise(exercises.includes(DEFAULT_EXERCISE) ? DEFAULT_EXERCISE : exercises[0]);
  }, [exercises, exerciseTouched]);

  const handleExerciseChange = (next: string) => {
    setExerciseTouched(true);
    setSelectedExercise(next);
  };

  const fullChartData = useMemo(() => {
    if (!selectedExercise) return [];
    const dataPoints: ChartDataPoint[] = [];
    const sortedWorkouts = [...workouts].sort((a, b) => a.date.getTime() - b.date.getTime());

    for (const workout of sortedWorkouts) {
      const exercise = workout.exercises.find(e => e.normalizedName === selectedExercise);
      if (exercise && exercise.sets.length > 0) {
        const sets = applyDataCorrection(workout.date, exercise.normalizedName, exercise.sets);
        const maxWeight = Math.max(...sets.map(s => s.weight));
        const totalVolume = sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
        const avgWeight = sets.reduce((sum, s) => sum + s.weight, 0) / sets.length;

        dataPoints.push({
          timestamp: workout.date.getTime(),
          weight: Math.round(avgWeight),
          maxWeight,
          totalVolume,
        });
      }
    }

    // Safety net: a max-weight point that's a wild multiple of this exercise's own recent
    // baseline (an equipment-format edge case, a typo, etc.) is dropped from the "max"
    // line rather than trusted at face value — not a substitute for correct parsing, just
    // a last line of defense. The avg-weight/volume for that same session are unaffected.
    const plausibleMax = new Set(filterOutliers(dataPoints, p => p.maxWeight ?? 0));
    for (const point of dataPoints) {
      if (!plausibleMax.has(point)) point.maxWeight = undefined;
    }

    return dataPoints;
  }, [workouts, selectedExercise]);

  const [range, setRange] = useState<ChartRangeKey>('MAX');
  const [rangeTouched, setRangeTouched] = useState(false);

  useEffect(() => {
    if (rangeTouched || fullChartData.length === 0) return;
    setRange(defaultChartRange(fullChartData.map(p => p.timestamp)));
  }, [fullChartData, rangeTouched]);

  const handleRangeChange = (next: ChartRangeKey) => {
    setRangeTouched(true);
    setRange(next);
  };

  const chartData = useMemo(() => {
    if (fullChartData.length === 0) return [];
    const latestTs = fullChartData[fullChartData.length - 1].timestamp;
    const start = chartRangeStart(range, new Date(latestTs));
    return start ? fullChartData.filter(p => p.timestamp >= start.getTime()) : fullChartData;
  }, [fullChartData, range]);

  const domain = useMemo((): [number, number] => {
    if (chartData.length === 0) return [0, 1];
    return [chartData[0].timestamp, chartData[chartData.length - 1].timestamp];
  }, [chartData]);

  const spansYearBoundary =
    chartData.length > 0 &&
    new Date(chartData[0].timestamp).getFullYear() !== new Date(chartData[chartData.length - 1].timestamp).getFullYear();

  if (exercises.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Weight Progress</CardTitle></CardHeader>
        <CardContent>
          <p className="font-mono text-xs text-n-text-disabled uppercase tracking-[0.04em]">[NO DATA]</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <CardTitle>Weight Progress</CardTitle>
          <Select
            options={exercises.map(e => ({ value: e, label: e }))}
            value={selectedExercise}
            onChange={(e) => handleExerciseChange(e.target.value)}
            className="w-48"
          />
        </div>
        <div className="mt-3 flex justify-start sm:justify-end">
          <RangeSelector value={range} onChange={handleRangeChange} />
        </div>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="font-mono text-xs text-n-text-disabled text-center py-8 uppercase tracking-[0.04em]">
            [NO DATA FOR {selectedExercise.toUpperCase()}]
          </p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={domain}
                  fontSize={10}
                  fontFamily="Space Mono"
                  tickFormatter={(value) => formatTick(value, range, spansYearBoundary)}
                />
                <YAxis fontSize={10} fontFamily="Space Mono" tickFormatter={(value) => `${value}`} />
                <Tooltip
                  labelFormatter={(label) => format(new Date(label as number), 'EEE, MMM d, yyyy')}
                  formatter={(value, name) => {
                    if (name === 'maxWeight') return [`${value} lbs`, 'MAX'];
                    if (name === 'weight') return [`${value} lbs`, 'AVG'];
                    return [value, name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'Space Mono' }} />
                <Line type="monotone" dataKey="maxWeight" stroke="#E8E8E8" strokeWidth={2} dot={{ fill: '#E8E8E8', strokeWidth: 0, r: 3 }} name="Max Weight" connectNulls />
                <Line type="monotone" dataKey="weight" stroke="#5B9BF6" strokeWidth={2} dot={{ fill: '#5B9BF6', strokeWidth: 0, r: 3 }} name="Avg Weight" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
