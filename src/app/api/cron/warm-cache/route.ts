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
    const baseUrl = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || 'fitdash.viraat.dev'}`;

    const response = await fetch(`${baseUrl}/api/notion?refresh=1`);
    const data = await response.json();

    // Also pre-generate exercise advice
    if (data.success && data.workouts?.length > 0) {
      try {
        await fetch(`${baseUrl}/api/insights`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: buildAdvicePrompt(data.workouts) }),
        }).then(async (res) => {
          if (res.ok) {
            const advice = await res.json();
            const redis = getRedis();
            if (redis) {
              await redis.set('fitdash:advice', JSON.stringify(advice), { ex: 86400 });
            }
          }
        });
      } catch (e) {
        console.error('Advice generation failed:', e);
      }
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
