import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getRedis } from '@/lib/redis';
import { Workout, FoodDay } from '@/types';
import { subDays, differenceInDays, format } from 'date-fns';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function baseUrl() {
  return process.env.HOSTNAME === '0.0.0.0'
    ? `http://localhost:${process.env.PORT || 3000}`
    : `https://${process.env.APP_URL || 'fit-dash.fly.dev'}`;
}

const REDIS_CACHE_KEY = 'fitdash:weekly_retro';
const REDIS_TTL = 14 * 86400;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Gemini not configured' }, { status: 500 });

  const redis = getRedis();

  try {
    let workouts: Workout[] = [];
    let foodData: FoodDay[] = [];
    try {
      const [wRes, fRes] = await Promise.all([
        fetch(`${baseUrl()}/api/notion`).then(r => r.json()),
        fetch(`${baseUrl()}/api/food`).then(r => r.json()),
      ]);
      if (wRes.success) workouts = wRes.workouts || [];
      if (fRes.success) foodData = fRes.data || [];
    } catch (err) {
      console.error('weekly-retro context fetch failed:', err);
    }

    const now = new Date();
    const weekAgo = subDays(now, 7);
    const twoWeeksAgo = subDays(now, 14);

    const thisWeekWorkouts = workouts.filter(w => new Date(w.date) >= weekAgo);
    const priorWeekWorkouts = workouts.filter(w => {
      const d = new Date(w.date);
      return d >= twoWeeksAgo && d < weekAgo;
    });

    const compoundKeys = ['squat', 'deadlift', 'bench', 'press', 'row'];
    const compoundMaxes = (list: Workout[]) => {
      const out: Record<string, number> = {};
      for (const w of list) {
        for (const e of w.exercises) {
          const name = e.normalizedName.toLowerCase();
          if (!compoundKeys.some(k => name.includes(k))) continue;
          const top = Math.max(0, ...e.sets.map(s => s.weight));
          if (top > (out[e.normalizedName] || 0)) out[e.normalizedName] = top;
        }
      }
      return out;
    };

    const thisMaxes = compoundMaxes(thisWeekWorkouts);
    const priorMaxes = compoundMaxes(priorWeekWorkouts);

    const thisWeekFood = foodData.filter(d => {
      const dt = new Date(d.date + 'T12:00:00');
      return dt >= weekAgo;
    });
    const priorWeekFood = foodData.filter(d => {
      const dt = new Date(d.date + 'T12:00:00');
      return dt >= twoWeeksAgo && dt < weekAgo;
    });

    const foodAvg = (list: FoodDay[]) => {
      if (list.length === 0) return null;
      const sum = list.reduce(
        (acc, d) => ({
          cal: acc.cal + d.totals.calories,
          p: acc.p + d.totals.protein,
          c: acc.c + d.totals.carbs,
          f: acc.f + d.totals.fat,
        }),
        { cal: 0, p: 0, c: 0, f: 0 },
      );
      return {
        daysLogged: list.length,
        avgCalories: Math.round(sum.cal / list.length),
        avgProtein: Math.round(sum.p / list.length),
        avgCarbs: Math.round(sum.c / list.length),
        avgFat: Math.round(sum.f / list.length),
      };
    };

    const thisFood = foodAvg(thisWeekFood);
    const priorFood = foodAvg(priorWeekFood);

    const lastWorkoutDate = workouts[0] ? new Date(workouts[0].date) : null;
    const daysSince = lastWorkoutDate ? differenceInDays(now, lastWorkoutDate) : null;

    const prompt = `You are writing a weekly Sunday recomp retrospective. Keep it sharp, honest, and concrete. User goal: reduce belly fat, progressive overload.

THIS WEEK (last 7 days):
- Workouts: ${thisWeekWorkouts.length} (prior week: ${priorWeekWorkouts.length})
- Days since last workout: ${daysSince}
- Compound maxes: ${JSON.stringify(thisMaxes)}
- Food: ${thisFood ? JSON.stringify(thisFood) : 'nothing logged'}

PRIOR WEEK compound maxes: ${JSON.stringify(priorMaxes)}
PRIOR WEEK food: ${priorFood ? JSON.stringify(priorFood) : 'nothing logged'}

Write a weekly retro in this JSON shape ONLY (no markdown):
{
  "headline": "<one-line bottom line, max 14 words>",
  "wins": ["<2-3 specific wins, reference numbers>"],
  "losses_or_gaps": ["<1-2 specific gaps — logging, lifts that stalled, etc.>"],
  "next_week_focus": "<1-2 sentences: what to prioritize Mon-Sun>"
}`;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in LLM response');
    const parsed = JSON.parse(jsonMatch[0]);

    const payload = {
      ...parsed,
      weekOf: format(weekAgo, 'MMM d') + ' – ' + format(now, 'MMM d'),
      counts: {
        workouts: thisWeekWorkouts.length,
        priorWorkouts: priorWeekWorkouts.length,
        foodDaysLogged: thisWeekFood.length,
      },
      generatedAt: now.toISOString(),
    };

    if (redis) {
      try { await redis.set(REDIS_CACHE_KEY, JSON.stringify(payload), { ex: REDIS_TTL }); } catch {}
    }

    const ntfyBody = `${parsed.headline}\n\nWINS:\n${(parsed.wins || []).map((w: string) => `• ${w}`).join('\n')}\n\nGAPS:\n${(parsed.losses_or_gaps || []).map((g: string) => `• ${g}`).join('\n')}\n\nNEXT: ${parsed.next_week_focus}`;

    try {
      await fetch('https://ntfy.sh/fitdash', {
        method: 'POST',
        headers: { 'Title': `Weekly retro: ${parsed.headline.slice(0, 50)}`, 'Tags': 'chart_with_upwards_trend', 'Click': 'https://fit-dash.fly.dev' },
        body: ntfyBody,
      });
    } catch (err) { console.error('retro ntfy failed:', err); }

    return NextResponse.json({ success: true, ...payload });
  } catch (error) {
    console.error('weekly-retro error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 },
    );
  }
}
