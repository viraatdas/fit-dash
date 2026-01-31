'use client';

import { format } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { Workout } from '@/types';

interface WorkoutSummaryProps {
  workouts: Workout[];
  limit?: number;
}

export function WorkoutSummary({ workouts, limit = 5 }: WorkoutSummaryProps) {
  const displayWorkouts = workouts.slice(0, limit);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Workouts</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {displayWorkouts.length === 0 ? (
          <p className="px-6 py-4 text-gray-500">No workouts found</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {displayWorkouts.map((workout) => (
              <div key={workout.id} className="px-6 py-4">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-light text-gray-600">
                    {format(workout.date, 'EEEE, MMM d, yyyy')}
                  </span>
                  <span className="text-sm font-light text-gray-400">
                    {workout.exercises.length} exercise{workout.exercises.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {workout.exercises.slice(0, 5).map((exercise, idx) => (
                    <span
                      key={idx}
                      className="inline-block px-2 py-1 text-xs font-light bg-gray-50 text-gray-500 rounded"
                    >
                      {exercise.normalizedName}
                    </span>
                  ))}
                  {workout.exercises.length > 5 && (
                    <span className="inline-block px-2 py-1 text-xs font-light text-gray-400">
                      +{workout.exercises.length - 5} more
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
