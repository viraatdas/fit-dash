'use client';

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { Workout, ExerciseCategory } from '@/types';
import { useMemo } from 'react';

interface CategorySummaryProps {
  workouts: Workout[];
}

const COLORS: Record<ExerciseCategory, string> = {
  'Upper Body': '#E8E8E8',
  'Lower Body': '#4A9E5C',
  'Back': '#D4A843',
  'Core': '#D71921',
  'Cardio': '#5B9BF6',
  'Other': '#666666',
};

export function CategorySummary({ workouts }: CategorySummaryProps) {
  const categoryData = useMemo(() => {
    const counts: Record<ExerciseCategory, number> = {
      'Upper Body': 0,
      'Lower Body': 0,
      'Back': 0,
      'Core': 0,
      'Cardio': 0,
      'Other': 0,
    };

    workouts.forEach(workout => {
      workout.exercises.forEach(exercise => {
        counts[exercise.category]++;
      });
    });

    return Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([category, count]) => ({
        name: category,
        value: count,
        color: COLORS[category as ExerciseCategory],
      }));
  }, [workouts]);

  if (categoryData.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Category Breakdown</CardTitle></CardHeader>
        <CardContent>
          <p className="font-mono text-xs text-n-text-disabled uppercase tracking-[0.04em]">[NO DATA]</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle>Category Breakdown</CardTitle></CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
                stroke="#000000"
                strokeWidth={2}
              >
                {categoryData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [`${value}`, 'COUNT']}
              />
              <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'Space Mono' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
