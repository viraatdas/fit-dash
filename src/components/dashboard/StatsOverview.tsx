'use client';

import { format } from 'date-fns';
import { Card, CardContent } from '@/components/ui';
import { Workout, InBodyEntry } from '@/types';

interface StatsOverviewProps {
  workouts: Workout[];
  latestInBody: InBodyEntry | null;
}

interface StatItem {
  label: string;
  value: string | number;
  subtext?: string;
}

export function StatsOverview({ workouts, latestInBody }: StatsOverviewProps) {
  // Calculate stats
  const totalWorkouts = workouts.length;

  // Get workouts from last 7 days
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recentWorkouts = workouts.filter(w => w.date >= sevenDaysAgo).length;

  // Total exercises logged
  const totalExercises = workouts.reduce((sum, w) => sum + w.exercises.length, 0);

  // Total sets logged
  const totalSets = workouts.reduce(
    (sum, w) => sum + w.exercises.reduce((eSum, e) => eSum + e.sets.length, 0),
    0
  );

  const stats: StatItem[] = [
    { label: 'Total Workouts', value: totalWorkouts },
    { label: 'This Week', value: recentWorkouts },
    { label: 'Exercises Logged', value: totalExercises },
    { label: 'Total Sets', value: totalSets },
  ];

  if (latestInBody) {
    const measureDate = format(latestInBody.date, 'MMM d, yyyy');
    stats.push({
      label: 'Current Weight',
      value: `${latestInBody.weight} lbs`,
      subtext: measureDate,
    });
    stats.push({
      label: 'Body Fat',
      value: `${latestInBody.bodyFatPercentage}%`,
      subtext: measureDate,
    });
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="text-center py-3 sm:py-4 px-2 sm:px-4">
            <p className="text-lg sm:text-2xl font-light text-gray-700">{stat.value}</p>
            <p className="text-xs sm:text-sm font-light text-gray-400">{stat.label}</p>
            {stat.subtext && (
              <p className="text-[10px] sm:text-xs font-light text-gray-300 mt-1">{stat.subtext}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
