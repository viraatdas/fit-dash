import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import { Workout } from '@/types';
import { format, differenceInDays } from 'date-fns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const redis = getRedis();
    let workouts: Workout[] = [];

    if (redis) {
      const cached = await redis.get('fitdash:workouts');
      if (cached) {
        const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
        workouts = Array.isArray(data) ? data : [];
      }
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
