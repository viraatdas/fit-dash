import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getRedis } from '@/lib/redis';
import { FoodDay } from '@/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DAILY_TARGETS = {
  calcium: 1000,    // mg
  iron: 8,          // mg
  potassium: 3400,  // mg
  magnesium: 420,   // mg
  zinc: 11,         // mg
  vitaminD: 15,     // mcg
  vitaminB12: 2.4,  // mcg
  vitaminC: 90,     // mg
  fiber: 30,        // g
};

const REDIS_CACHE_KEY = 'fitdash:grocery_list';
const REDIS_TTL = 7 * 86400;

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Gemini not configured' }, { status: 500 });

  const redis = getRedis();

  try {
    let foodData: FoodDay[] = [];
    if (redis) {
      const cached = await redis.get('fitdash:food');
      if (cached) foodData = Array.isArray(cached) ? cached : JSON.parse(cached as string);
    }

    const last7 = [...foodData].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
    if (last7.length < 3) {
      return NextResponse.json({ skipped: true, reason: 'not enough food days', daysLogged: last7.length });
    }

    // Average micros across logged days
    const sum: Record<string, number> = {};
    for (const d of last7) {
      for (const k of Object.keys(DAILY_TARGETS) as Array<keyof typeof DAILY_TARGETS>) {
        sum[k] = (sum[k] || 0) + ((d.totals as unknown as Record<string, number>)[k] || 0);
      }
    }
    const avg: Record<string, number> = {};
    for (const k of Object.keys(sum)) avg[k] = sum[k] / last7.length;

    // Find deficiencies (< 70% of daily target)
    const deficiencies: Array<{ nutrient: string; avg: number; target: number; pct: number }> = [];
    for (const k of Object.keys(DAILY_TARGETS) as Array<keyof typeof DAILY_TARGETS>) {
      const pct = (avg[k] / DAILY_TARGETS[k]) * 100;
      if (pct < 70) {
        deficiencies.push({ nutrient: k, avg: +avg[k].toFixed(1), target: DAILY_TARGETS[k], pct: Math.round(pct) });
      }
    }
    deficiencies.sort((a, b) => a.pct - b.pct);

    if (deficiencies.length === 0) {
      const body = 'All micros hitting ≥70% of targets this week. Nothing urgent to buy.';
      try {
        await fetch('https://ntfy.sh/fitdash', {
          method: 'POST',
          headers: { 'Title': 'Grocery list — all good', 'Tags': 'shopping_cart', 'Click': 'https://fit-dash.fly.dev' },
          body,
        });
      } catch (err) { console.error('grocery ntfy failed:', err); }
      return NextResponse.json({ success: true, deficiencies: [], pushed: body });
    }

    // Ask LLM for targeted grocery list
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const prompt = `You are a nutrition coach. Someone doing a body recomp (reduce belly fat, add muscle) has these micronutrient gaps averaged over the last ${last7.length} days:

${deficiencies.map(d => `- ${d.nutrient}: ${d.avg} (target ${d.target}, ${d.pct}% of goal)`).join('\n')}

Suggest exactly 5 grocery items that would close these gaps, prioritizing items that hit multiple deficiencies at once. Favor whole foods over supplements.

Return ONLY valid JSON (no markdown):
{
  "summary": "<1-sentence bottom-line headline, max 12 words>",
  "items": [
    {"food": "<e.g., 'Sardines (canned, 4oz)'>", "hits": ["<nutrient1>", "<nutrient2>"], "why": "<short reason>"}
  ]
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in LLM response');
    const parsed = JSON.parse(jsonMatch[0]);

    const payload = {
      summary: parsed.summary,
      items: parsed.items,
      deficiencies,
      generatedAt: new Date().toISOString(),
    };

    if (redis) {
      try { await redis.set(REDIS_CACHE_KEY, JSON.stringify(payload), { ex: REDIS_TTL }); } catch {}
    }

    const ntfyBody = `${parsed.summary}\n\n${parsed.items.map((i: { food: string; hits: string[] }) => `• ${i.food} (${i.hits.join(', ')})`).join('\n')}`;
    try {
      await fetch('https://ntfy.sh/fitdash', {
        method: 'POST',
        headers: { 'Title': 'Grocery list for the week', 'Tags': 'shopping_cart', 'Click': 'https://fit-dash.fly.dev' },
        body: ntfyBody,
      });
    } catch (err) { console.error('grocery ntfy failed:', err); }

    return NextResponse.json({ success: true, ...payload, pushed: ntfyBody });
  } catch (error) {
    console.error('grocery-list error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 },
    );
  }
}
