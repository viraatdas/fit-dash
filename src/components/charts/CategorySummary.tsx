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
  'Upper Body': '#3b82f6',
  'Lower Body': '#10b981',
  'Back': '#f59e0b',
  'Core': '#ef4444',
  'Cardio': '#8b5cf6',
  'Other': '#6b7280',
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
        <CardHeader>
          <CardTitle>Category Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">No exercise data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Category Breakdown</CardTitle>
      </CardHeader>
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
                paddingAngle={5}
                dataKey="value"
              >
                {categoryData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                }}
                formatter={(value) => [`${value} exercises`, 'Count']}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
