import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Hit the notion API to populate Redis + CDN cache
    const baseUrl = `https://${process.env.APP_URL || 'fitdash.viraat.dev'}`;

    const response = await fetch(`${baseUrl}/api/notion?refresh=1`);
    const data = await response.json();

    // Pre-generate exercise advice + protein estimate in parallel
    if (data.success && data.workouts?.length > 0) {
      const redis = getRedis();

      const advicePromise = fetch(`${baseUrl}/api/insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: buildAdvicePrompt(data.workouts) }),
      }).then(async (res) => {
        if (res.ok) {
          const advice = await res.json();
          if (redis) {
            await redis.set('fitdash:advice', JSON.stringify(advice), { ex: 86400 });
          }
          console.log('Exercise advice cached');
        }
      }).catch(e => console.error('Advice generation failed:', e));

      const proteinPromise = fetch(`${baseUrl}/api/insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: buildProteinPrompt(data.workouts) }),
      }).then(async (res) => {
        if (res.ok) {
          const protein = await res.json();
          if (redis) {
            await redis.set('fitdash:protein', JSON.stringify(protein), { ex: 86400 });
          }
          console.log('Protein estimate cached');
        }
      }).catch(e => console.error('Protein generation failed:', e));

      await Promise.all([advicePromise, proteinPromise]);
    }

    return NextResponse.json({
      success: true,
      workouts: data.workouts?.length || 0,
    });
  } catch (error) {
    console.error('Cache warm error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}

function buildAdvicePrompt(workouts: Array<{ exercises: Array<{ normalizedName: string; category: string; sets: Array<{ weight: number }> }> }>) {
  const exerciseCounts: Record<string, { count: number; category: string; maxWeight: number }> = {};
  workouts.forEach((w: { exercises: Array<{ normalizedName: string; category: string; sets: Array<{ weight: number }> }> }) => {
    w.exercises.forEach((e: { normalizedName: string; category: string; sets: Array<{ weight: number }> }) => {
      if (!exerciseCounts[e.normalizedName]) {
        exerciseCounts[e.normalizedName] = { count: 0, category: e.category, maxWeight: 0 };
      }
      exerciseCounts[e.normalizedName].count++;
      const max = e.sets.length > 0 ? Math.max(...e.sets.map((s: { weight: number }) => s.weight)) : 0;
      if (max > exerciseCounts[e.normalizedName].maxWeight) exerciseCounts[e.normalizedName].maxWeight = max;
    });
  });

  const exerciseList = Object.entries(exerciseCounts)
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, info]) => `${name} (${info.category}, ${info.count}x, max ${info.maxWeight}lbs)`)
    .join('\n');

  return `You are a strength coach. Analyze this exercise history and suggest new exercises.

Current exercises:
${exerciseList}

Return JSON only (no markdown):
{
  "current_assessment": "<what their routine covers well>",
  "gaps": ["<missing muscle group or movement pattern>"],
  "recommendations": [
    {"exercise": "<name>", "reason": "<why, referencing their lifts>", "replaces_or_complements": "<their exercise>", "priority": "high|medium|low"}
  ]
}
Suggest 4-6 exercises. Be specific. Prioritize compound movements.`;
}

interface WorkoutForPrompt {
  date: string;
  exercises: Array<{ normalizedName: string; category: string; sets: Array<{ reps: number; weight: number }> }>;
}

function buildProteinPrompt(workouts: WorkoutForPrompt[]) {
  const sorted = [...workouts]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 20);

  const uniqueDates = new Set(sorted.map(w => new Date(w.date).toISOString().split('T')[0]));
  const trainingDaysPerWeek = sorted.length > 1
    ? (uniqueDates.size / ((new Date(sorted[0].date).getTime() - new Date(sorted[sorted.length - 1].date).getTime()) / (7 * 24 * 60 * 60 * 1000))) || 0
    : 0;

  let totalVolume = 0;
  let totalSets = 0;
  const compoundLifts: Record<string, number> = {};

  sorted.forEach(w => {
    w.exercises.forEach(e => {
      e.sets.forEach(s => {
        totalVolume += s.reps * s.weight;
        totalSets++;
      });
      const name = e.normalizedName.toLowerCase();
      if (e.sets.length > 0 && (name.includes('bench') || name.includes('squat') || name.includes('deadlift') ||
          name.includes('press') || name.includes('row'))) {
        const max = Math.max(...e.sets.map(s => s.weight));
        if (max > 0 && (!compoundLifts[e.normalizedName] || max > compoundLifts[e.normalizedName])) {
          compoundLifts[e.normalizedName] = max;
        }
      }
    });
  });

  const exerciseFirstLast: Record<string, { first: number; last: number }> = {};
  const chronological = [...sorted].reverse();
  chronological.forEach(w => {
    w.exercises.forEach(e => {
      if (e.sets.length === 0) return;
      const max = Math.max(...e.sets.map(s => s.weight));
      if (max > 0) {
        if (!exerciseFirstLast[e.normalizedName]) {
          exerciseFirstLast[e.normalizedName] = { first: max, last: max };
        } else {
          exerciseFirstLast[e.normalizedName].last = max;
        }
      }
    });
  });

  const progressingCount = Object.values(exerciseFirstLast).filter(e => e.last > e.first).length;
  const stagnantCount = Object.values(exerciseFirstLast).filter(e => e.last <= e.first).length;

  return `You are a sports nutritionist estimating daily protein needs for a client.

Body composition: Unknown (no InBody data available during cache warming)

Training data (last ${sorted.length} sessions):
- Training frequency: ~${trainingDaysPerWeek.toFixed(1)} days/week
- Total sets across sessions: ${totalSets}
- Total volume (reps x weight): ${(totalVolume / 1000).toFixed(0)}k lbs
- Key compound lift maxes: ${Object.entries(compoundLifts).map(([name, w]) => `${name}: ${w} lbs`).join(', ') || 'N/A'}
- Progression: ${progressingCount} exercises trending up, ${stagnantCount} stagnant

Goals: Build muscle, reduce body fat, improve functional strength.

Estimate their likely current daily protein intake and recommend an optimal daily protein intake based on their training data. Use 170 lbs as an estimated body weight if no body composition data is available.

Respond in JSON format:
{
  "estimated_daily_intake": <number in grams>,
  "recommended_daily_intake": <number in grams>,
  "explanation": "<2-3 sentences explaining your reasoning>"
}`;
}
