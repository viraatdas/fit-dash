import { NextResponse } from 'next/server';
import { FoodDay } from '@/types';
import { BODY_GOAL, targetProteinGrams } from '@/lib/goals';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FALLBACK_WEIGHT_LBS = 167.2;

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
    const pstTodayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });

    let foodData: FoodDay[] = [];
    try {
      const res = await fetch(`${baseUrl()}/api/food`);
      const json = await res.json();
      if (json.success) foodData = json.data || [];
    } catch (err) {
      console.error('protein-nudge food fetch failed:', err);
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
