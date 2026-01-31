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
  // Get unique exercises from all workouts
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

  // Generate chart data for selected exercise
  const chartData = useMemo(() => {
    if (!selectedExercise) return [];

    const dataPoints: ChartDataPoint[] = [];

    // Sort workouts by date ascending for chart
    const sortedWorkouts = [...workouts].sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );

    for (const workout of sortedWorkouts) {
      const exercise = workout.exercises.find(
        e => e.normalizedName === selectedExercise
      );

      if (exercise && exercise.sets.length > 0) {
        // Find max weight used
        const maxWeight = Math.max(...exercise.sets.map(s => s.weight));

        // Calculate total volume (weight × reps for all sets)
        const totalVolume = exercise.sets.reduce(
          (sum, s) => sum + s.weight * s.reps,
          0
        );

        // Average weight across sets
        const avgWeight =
          exercise.sets.reduce((sum, s) => sum + s.weight, 0) /
          exercise.sets.length;

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
        <CardHeader>
          <CardTitle>Weight Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">No exercise data available</p>
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
          <p className="text-gray-500 text-center py-8">
            No data for {selectedExercise}
          </p>
        ) : (
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
                  stroke="#6b7280"
                  fontSize={12}
                  tickFormatter={(value) => `${value} lbs`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'white',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                  }}
                  formatter={(value, name) => {
                    if (name === 'maxWeight') return [`${value} lbs`, 'Max Weight'];
                    if (name === 'weight') return [`${value} lbs`, 'Avg Weight'];
                    return [value, name];
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="maxWeight"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', strokeWidth: 2 }}
                  name="Max Weight"
                />
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={{ fill: '#10b981', strokeWidth: 2 }}
                  name="Avg Weight"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
