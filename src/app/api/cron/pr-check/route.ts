import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import { Workout } from '@/types';
import { format } from 'date-fns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LAST_SEEN_KEY = 'fitdash:pr_last_seen_date';
const LAST_SEEN_FALLBACK: { value: string | null } = { value: null };

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

  const redis = getRedis();

  try {
    // Prefer the notion endpoint (memory → Redis → Notion fallback chain)
    let workouts: Workout[] = [];
    try {
      const res = await fetch(`${baseUrl()}/api/notion`);
      const json = await res.json();
      if (json.success) workouts = json.workouts || [];
    } catch (err) {
      console.error('pr-check workouts fetch failed:', err);
    }

    if (workouts.length === 0) return NextResponse.json({ message: 'No workouts available' });

    const sorted = [...workouts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    let lastSeenStr: string | null = null;
    if (redis) {
      try {
        const v = await redis.get(LAST_SEEN_KEY);
        if (v) lastSeenStr = v as string;
      } catch (err) {
        console.error('pr-check redis read failed:', err);
      }
    }
    if (!lastSeenStr) lastSeenStr = LAST_SEEN_FALLBACK.value;
    const lastSeen = lastSeenStr ? new Date(lastSeenStr) : new Date(0);
    const newest = new Date(sorted[0].date);

    // Find new workouts (newer than last seen)
    const newWorkouts = sorted.filter(w => new Date(w.date) > lastSeen);
    if (newWorkouts.length === 0) {
      return NextResponse.json({ message: 'No new workouts', lastSeen: lastSeen.toISOString() });
    }

    // Build all-time max per exercise from workouts BEFORE the new ones
    const historicalWorkouts = sorted.filter(w => new Date(w.date) <= lastSeen);
    const historicalMax: Record<string, number> = {};
    for (const w of historicalWorkouts) {
      for (const e of w.exercises) {
        const topWeight = Math.max(0, ...e.sets.map(s => s.weight));
        if (topWeight > (historicalMax[e.normalizedName] || 0)) {
          historicalMax[e.normalizedName] = topWeight;
        }
      }
    }

    // Detect PRs in the new workouts
    const prs: Array<{ exercise: string; date: Date; newMax: number; oldMax: number; delta: number; reps: number }> = [];
    for (const w of newWorkouts) {
      for (const e of w.exercises) {
        const validSets = e.sets.filter(s => s.weight > 0);
        if (validSets.length === 0) continue;
        const topSet = validSets.reduce((best, s) => (s.weight > best.weight ? s : best), validSets[0]);
        const old = historicalMax[e.normalizedName] || 0;
        if (old > 0 && topSet.weight > old) {
          prs.push({
            exercise: e.normalizedName,
            date: new Date(w.date),
            newMax: topSet.weight,
            oldMax: old,
            delta: topSet.weight - old,
            reps: topSet.reps,
          });
        }
      }
    }

    // Push one ntfy per PR (top 4 max to avoid spam)
    const pushed: string[] = [];
    for (const pr of prs.slice(0, 4)) {
      try {
        await fetch('https://ntfy.sh/fitdash', {
          method: 'POST',
          headers: {
            'Title': `PR: ${pr.exercise} ${pr.newMax} lb`,
            'Tags': 'trophy',
            'Click': 'https://fit-dash.fly.dev',
            'Priority': 'high',
          },
          body: `+${pr.delta} lb from prior max (${pr.oldMax} lb). ${pr.reps} reps on ${format(pr.date, 'EEE MMM d')}.`,
        });
        pushed.push(pr.exercise);
      } catch (err) {
        console.error('PR ntfy failed:', err);
      }
    }

    // Advance the cursor even if there were no PRs, so we don't re-check the same workouts
    LAST_SEEN_FALLBACK.value = newest.toISOString();
    if (redis) {
      try { await redis.set(LAST_SEEN_KEY, newest.toISOString()); } catch (err) {
        console.error('pr-check redis write failed:', err);
      }
    }

    return NextResponse.json({
      success: true,
      newWorkouts: newWorkouts.length,
      prsFound: prs.length,
      pushed,
      newLastSeen: newest.toISOString(),
    });
  } catch (error) {
    console.error('PR check error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 },
    );
  }
}
