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
  const totalWorkouts = workouts.length;

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const recentWorkouts = workouts.filter(w => w.date >= sevenDaysAgo).length;

  const totalExercises = workouts.reduce((sum, w) => sum + w.exercises.length, 0);

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
      value: `${latestInBody.weight}`,
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
          <CardContent className="text-center py-4 sm:py-5 px-2 sm:px-4">
            <p className="text-2xl sm:text-3xl font-mono text-n-text-display tracking-tight">{stat.value}</p>
            <p className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.08em] text-n-text-secondary mt-1">{stat.label}</p>
            {stat.subtext && (
              <p className="font-mono text-[9px] sm:text-[10px] text-n-text-disabled mt-1">{stat.subtext}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
