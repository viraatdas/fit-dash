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
import { useState, useMemo } from 'react';

interface WeightProgressChartProps {
  workouts: Workout[];
}

interface ChartDataPoint {
  date: string;
  weight: number;
  maxWeight: number;
  totalVolume: number;
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

  const [selectedExercise, setSelectedExercise] = useState(exercises[0] || '');

  const chartData = useMemo(() => {
    if (!selectedExercise) return [];
    const dataPoints: ChartDataPoint[] = [];
    const sortedWorkouts = [...workouts].sort((a, b) => a.date.getTime() - b.date.getTime());

    for (const workout of sortedWorkouts) {
      const exercise = workout.exercises.find(e => e.normalizedName === selectedExercise);
      if (exercise && exercise.sets.length > 0) {
        const maxWeight = Math.max(...exercise.sets.map(s => s.weight));
        const totalVolume = exercise.sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
        const avgWeight = exercise.sets.reduce((sum, s) => sum + s.weight, 0) / exercise.sets.length;

        dataPoints.push({
          date: format(workout.date, 'MMM d'),
          weight: Math.round(avgWeight),
          maxWeight,
          totalVolume,
        });
      }
    }
    return dataPoints;
  }, [workouts, selectedExercise]);

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
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Weight Progress</CardTitle>
        <Select
          options={exercises.map(e => ({ value: e, label: e }))}
          value={selectedExercise}
          onChange={(e) => setSelectedExercise(e.target.value)}
          className="w-48"
        />
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
                <XAxis dataKey="date" fontSize={10} fontFamily="Space Mono" />
                <YAxis fontSize={10} fontFamily="Space Mono" tickFormatter={(value) => `${value}`} />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === 'maxWeight') return [`${value} lbs`, 'MAX'];
                    if (name === 'weight') return [`${value} lbs`, 'AVG'];
                    return [value, name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'Space Mono' }} />
                <Line type="monotone" dataKey="maxWeight" stroke="#E8E8E8" strokeWidth={2} dot={{ fill: '#E8E8E8', strokeWidth: 0, r: 3 }} name="Max Weight" />
                <Line type="monotone" dataKey="weight" stroke="#5B9BF6" strokeWidth={2} dot={{ fill: '#5B9BF6', strokeWidth: 0, r: 3 }} name="Avg Weight" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
