import { NextResponse } from 'next/server';
import { setCached } from '@/lib/cache/store';
import { ADVICE_KEY } from '@/lib/cache/advice-key';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Hit the notion API over localhost to trigger (or join) its normal
    // single-flight, throttled, incremental background refresh — never a
    // forced full re-crawl, and never over the public internet.
    const baseUrl = process.env.HOSTNAME === '0.0.0.0'
      ? `http://localhost:${process.env.PORT || 3000}`
      : `https://${process.env.APP_URL || 'fitdash.viraat.dev'}`;

    const response = await fetch(`${baseUrl}/api/notion`);
    const data = await response.json();

    // Pre-generate exercise advice
    if (data.success && data.workouts?.length > 0) {
      try {
        const adviceRes = await fetch(`${baseUrl}/api/insights`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: buildAdvicePrompt(data.workouts) }),
        });
        if (adviceRes.ok) {
          const advice = await adviceRes.json();
          await setCached(ADVICE_KEY, advice);
          console.log('Exercise advice cached');
        }
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

