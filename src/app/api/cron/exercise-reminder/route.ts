import { NextResponse } from 'next/server';
import { Workout } from '@/types';
import { format, differenceInDays } from 'date-fns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function baseUrl() {
  return process.env.HOSTNAME === '0.0.0.0'
    ? `http://localhost:${process.env.PORT || 3000}`
    : `https://${process.env.APP_URL || 'fit-dash.fly.dev'}`;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Read through the notion route's own cache (memory → disk), not Redis
    // directly — Redis is no longer the source of truth for workouts.
    let workouts: Workout[] = [];
    try {
      const res = await fetch(`${baseUrl()}/api/notion`);
      const json = await res.json();
      if (json.success) workouts = json.workouts || [];
    } catch (err) {
      console.error('exercise-reminder workouts fetch failed:', err);
    }

    if (workouts.length === 0) {
      return NextResponse.json({ message: 'No workouts in cache, skipping reminder' });
    }

    const now = new Date();
    const lastWorkout = workouts[0];
    const lastWorkoutDate = new Date(lastWorkout.date);
    const daysSinceLastWorkout = differenceInDays(now, lastWorkoutDate);

    const lastWorkoutExercises = lastWorkout.exercises
      .filter((e: { sets: Array<{ weight: number; reps: number }> }) => e.sets.length > 0)
      .slice(0, 6)
      .map((e: { normalizedName: string; sets: Array<{ weight: number; reps: number }> }) => {
        const maxWeight = Math.max(...e.sets.map(s => s.weight));
        return `${e.normalizedName} ${maxWeight}lb`;
      })
      .join(', ');

    const ntfyTitle = daysSinceLastWorkout === 0
      ? 'Workout logged - recover well'
      : daysSinceLastWorkout === 1
      ? 'Time to train'
      : `${daysSinceLastWorkout} days off - get back in`;

    const lastDateStr = format(lastWorkoutDate, 'EEE MMM d');
    const ntfyBody = lastWorkoutExercises
      ? `Last (${lastDateStr}): ${lastWorkoutExercises}`
      : `Last workout: ${lastDateStr}`;

    const ntfyRes = await fetch('https://ntfy.sh/fitdash', {
      method: 'POST',
      headers: {
        'Title': ntfyTitle,
        'Tags': daysSinceLastWorkout <= 1 ? 'muscle' : 'warning',
        'Click': 'https://fit-dash.fly.dev',
        'Priority': daysSinceLastWorkout > 2 ? 'high' : 'default',
      },
      body: ntfyBody,
    });

    return NextResponse.json({
      success: ntfyRes.ok,
      daysSinceLastWorkout,
      channel: 'ntfy.sh/fitdash',
      title: ntfyTitle,
      body: ntfyBody,
    });
  } catch (error) {
    console.error('Exercise reminder cron error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 },
    );
  }
}
