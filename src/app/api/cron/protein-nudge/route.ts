import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';
import { FoodDay } from '@/types';
import { BODY_GOAL, targetProteinGrams } from '@/lib/goals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Last-seeded InBody weight is ~167.2 lb; uses stored latest-InBody weight if present,
// otherwise falls back to this constant. Personal single-user app.
const FALLBACK_WEIGHT_LBS = 167.2;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const redis = getRedis();

  try {
    // Today in PST — matches food-log date labels
    const pstTodayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

    let foodData: FoodDay[] = [];
    if (redis) {
      const cached = await redis.get('fitdash:food');
      if (cached) {
        foodData = Array.isArray(cached) ? cached : JSON.parse(cached as string);
      }
    }

    const todayEntry = foodData.find(d => d.date === pstTodayStr);
    const proteinConsumed = todayEntry?.totals.protein ?? 0;
    const target = targetProteinGrams(FALLBACK_WEIGHT_LBS);
    const pctOfTarget = Math.round((proteinConsumed / target) * 100);
    const gap = target - proteinConsumed;

    if (pctOfTarget >= 50) {
      return NextResponse.json({
        skipped: true,
        reason: 'on pace',
        protein: proteinConsumed,
        target,
        pctOfTarget,
      });
    }

    const suggestions =
      gap > 60 ? 'chicken breast 300g OR paneer 200g + tuna tin'
      : gap > 40 ? 'paneer 200g OR 2 chicken breasts'
      : gap > 20 ? 'greek yogurt + eggs OR tuna tin'
      : '1 more high-protein item';

    const title = proteinConsumed === 0
      ? 'No food logged yet today'
      : `Protein behind: ${proteinConsumed}g/${target}g`;
    const body = proteinConsumed === 0
      ? `Still 0g protein logged for ${pstTodayStr}. Target ${target}g. Try ${suggestions}.`
      : `${gap}g short (${pctOfTarget}% of ${target}g). Lean on ${suggestions} tonight.`;

    try {
      await fetch('https://ntfy.sh/fitdash', {
        method: 'POST',
        headers: {
          'Title': title,
          'Tags': 'poultry_leg',
          'Click': 'https://fit-dash.fly.dev',
          'Priority': 'default',
        },
        body,
      });
    } catch (err) {
      console.error('protein ntfy failed:', err);
    }

    return NextResponse.json({
      success: true,
      protein: proteinConsumed,
      target,
      pctOfTarget,
      gap,
      goal: BODY_GOAL.proteinGramsPerLbBodyweight,
      pushed: { title, body },
    });
  } catch (error) {
    console.error('protein-nudge error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 },
    );
  }
}
