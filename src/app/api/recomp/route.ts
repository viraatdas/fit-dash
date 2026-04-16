import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getRedis } from '@/lib/redis';
import crypto from 'node:crypto';

export const maxDuration = 60;

const REDIS_PREFIX = 'fitdash:recomp:';
const REDIS_TTL = 86400;
const MEMORY_TTL = 6 * 60 * 60 * 1000;

interface InBodyEntryIn {
  date: string;
  weight: number;
  bodyFatPercentage: number;
  muscleMass: number;
  bodyFatMass?: number;
  bmi?: number;
  visceralFat?: number;
  visceralFatArea?: number;
  trunkFatMass?: number;
  basalMetabolicRate?: number;
}

interface WorkoutSet { reps: number; weight: number }
interface WorkoutExercise { normalizedName: string; category: string; sets: WorkoutSet[] }
interface Workout { date: string | Date; exercises: WorkoutExercise[] }

interface FoodItem { description: string; nutrients: { calories: number; protein: number; carbs: number; fat: number } }
interface FoodDay { date: string; items: FoodItem[]; totals: { calories: number; protein: number; carbs: number; fat: number; fiber: number } }

const memoryCache = new Map<string, { data: unknown; ts: number }>();

function hashInputs(input: unknown): string {
  return crypto.createHash('sha1').update(JSON.stringify(input)).digest('hex').slice(0, 16);
}

async function getBaseUrl() {
  return process.env.HOSTNAME === '0.0.0.0'
    ? `http://localhost:${process.env.PORT || 3000}`
    : `https://${process.env.APP_URL || 'fitdash.viraat.dev'}`;
}

function summarizeWorkouts(workouts: Workout[]) {
  const sorted = [...workouts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const recent = sorted.slice(0, 14);
  if (recent.length === 0) return { sessionCount: 0, avgDaysBetween: null, compoundProgress: [], categoryMix: {} };

  // frequency
  let avgDaysBetween: number | null = null;
  if (recent.length >= 2) {
    let sum = 0;
    for (let i = 0; i < recent.length - 1; i++) {
      sum += (new Date(recent[i].date).getTime() - new Date(recent[i + 1].date).getTime()) / 86400000;
    }
    avgDaysBetween = +(sum / (recent.length - 1)).toFixed(1);
  }

  // compound progression: find latest and 4-sessions-ago max weight per exercise
  const compoundKeys = ['squat', 'deadlift', 'bench', 'press', 'row', 'pull-up', 'pull up', 'pullup'];
  const history: Record<string, Array<{ date: number; maxWeight: number; reps: number }>> = {};
  for (const w of sorted) {
    for (const e of w.exercises) {
      const name = e.normalizedName.toLowerCase();
      if (!compoundKeys.some(k => name.includes(k))) continue;
      const topSet = e.sets.reduce<{ weight: number; reps: number }>(
        (best, s) => (s.weight > best.weight ? { weight: s.weight, reps: s.reps } : best),
        { weight: 0, reps: 0 },
      );
      if (topSet.weight > 0) {
        (history[e.normalizedName] ||= []).push({
          date: new Date(w.date).getTime(),
          maxWeight: topSet.weight,
          reps: topSet.reps,
        });
      }
    }
  }
  const compoundProgress = Object.entries(history)
    .map(([name, runs]) => {
      const latest = runs[0];
      const prior = runs[Math.min(3, runs.length - 1)];
      return {
        name,
        latestWeight: latest.maxWeight,
        latestReps: latest.reps,
        priorWeight: prior.maxWeight,
        deltaLbs: latest.maxWeight - prior.maxWeight,
        sessionsLogged: runs.length,
      };
    })
    .sort((a, b) => b.sessionsLogged - a.sessionsLogged)
    .slice(0, 6);

  // category mix
  const categoryMix: Record<string, number> = {};
  for (const w of recent) {
    for (const e of w.exercises) {
      categoryMix[e.category] = (categoryMix[e.category] || 0) + 1;
    }
  }

  return { sessionCount: recent.length, avgDaysBetween, compoundProgress, categoryMix };
}

function summarizeFood(days: FoodDay[]) {
  if (!days || days.length === 0) return { daysLogged: 0, avgCalories: 0, avgProtein: 0, avgCarbs: 0, avgFat: 0, avgFiber: 0 };
  const recent = [...days].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  const sum = recent.reduce(
    (acc, d) => ({
      calories: acc.calories + d.totals.calories,
      protein: acc.protein + d.totals.protein,
      carbs: acc.carbs + d.totals.carbs,
      fat: acc.fat + d.totals.fat,
      fiber: acc.fiber + d.totals.fiber,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
  const n = recent.length;
  return {
    daysLogged: n,
    avgCalories: Math.round(sum.calories / n),
    avgProtein: Math.round(sum.protein / n),
    avgCarbs: Math.round(sum.carbs / n),
    avgFat: Math.round(sum.fat / n),
    avgFiber: Math.round(sum.fiber / n),
  };
}

function summarizeInBody(entries: InBodyEntryIn[]) {
  const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  if (sorted.length === 0) return null;
  const latest = sorted[sorted.length - 1];
  const prior = sorted[sorted.length - 2] || null;
  const daysBetween = prior
    ? Math.round((new Date(latest.date).getTime() - new Date(prior.date).getTime()) / 86400000)
    : null;
  return {
    latest,
    prior,
    daysBetween,
    deltas: prior
      ? {
          weight: +(latest.weight - prior.weight).toFixed(1),
          muscleMass: +(latest.muscleMass - prior.muscleMass).toFixed(1),
          bodyFatPercentage: +(latest.bodyFatPercentage - prior.bodyFatPercentage).toFixed(1),
          bodyFatMass: latest.bodyFatMass != null && prior.bodyFatMass != null
            ? +(latest.bodyFatMass - prior.bodyFatMass).toFixed(1)
            : null,
          visceralFatArea: latest.visceralFatArea != null && prior.visceralFatArea != null
            ? +(latest.visceralFatArea - prior.visceralFatArea).toFixed(1)
            : null,
          trunkFatMass: latest.trunkFatMass != null && prior.trunkFatMass != null
            ? +(latest.trunkFatMass - prior.trunkFatMass).toFixed(1)
            : null,
          visceralFat: latest.visceralFat != null && prior.visceralFat != null
            ? +(latest.visceralFat - prior.visceralFat).toFixed(1)
            : null,
        }
      : null,
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Gemini not configured' }, { status: 500 });

  const body = await request.json();
  const inBodyEntries: InBodyEntryIn[] = body.inBodyEntries || [];
  const goal: string = body.goal || 'Reduce belly fat while progressively increasing weight lifted (body recomposition).';

  const inBodySummary = summarizeInBody(inBodyEntries);
  if (!inBodySummary) return NextResponse.json({ error: 'No InBody data provided' }, { status: 400 });

  // cache key from goal + inbody summary only (the heavy inputs — workouts/food change slower)
  const cacheKey = REDIS_PREFIX + hashInputs({ goal, latestDate: inBodySummary.latest.date, entryCount: inBodyEntries.length });

  // Memory
  const mem = memoryCache.get(cacheKey);
  if (mem && Date.now() - mem.ts < MEMORY_TTL) {
    return NextResponse.json(mem.data);
  }

  // Redis
  const redis = getRedis();
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
        memoryCache.set(cacheKey, { data, ts: Date.now() });
        return NextResponse.json(data);
      }
    } catch (err) {
      console.error('Redis read (recomp) failed:', err);
    }
  }

  // Gather context
  const baseUrl = await getBaseUrl();
  let workouts: Workout[] = [];
  let foodDays: FoodDay[] = [];
  try {
    const [wRes, fRes] = await Promise.all([
      fetch(`${baseUrl}/api/notion`).then(r => r.json()),
      fetch(`${baseUrl}/api/food`).then(r => r.json()),
    ]);
    if (wRes.success) workouts = wRes.workouts || [];
    if (fRes.success) foodDays = fRes.data || [];
  } catch (err) {
    console.error('Failed to fetch context for recomp:', err);
  }

  const workoutSummary = summarizeWorkouts(workouts);
  const foodSummary = summarizeFood(foodDays);

  const prompt = `You are a strength & conditioning coach analyzing a 25-year-old male's body recomposition progress.

GOAL (stated by user):
${goal}

LATEST INBODY SCAN (${inBodySummary.latest.date}):
- Weight: ${inBodySummary.latest.weight} lb
- Body Fat %: ${inBodySummary.latest.bodyFatPercentage}%
- Body Fat Mass: ${inBodySummary.latest.bodyFatMass ?? 'n/a'} lb
- Trunk Fat Mass (belly fat proxy): ${inBodySummary.latest.trunkFatMass ?? 'n/a'} lb
- Visceral Fat Area: ${inBodySummary.latest.visceralFatArea ?? 'n/a'} cm² (healthy < 100 cm²)
- Visceral Fat Level: ${inBodySummary.latest.visceralFat ?? 'n/a'} (InBody 1-20 scale, healthy ≤ 10)
- Skeletal Muscle Mass: ${inBodySummary.latest.muscleMass} lb
- BMR: ${inBodySummary.latest.basalMetabolicRate ?? 'n/a'} kcal/day
- BMI: ${inBodySummary.latest.bmi ?? 'n/a'}

${inBodySummary.prior && inBodySummary.deltas ? `TREND vs ${inBodySummary.prior.date} (${inBodySummary.daysBetween} days ago):
- Weight: ${inBodySummary.deltas.weight >= 0 ? '+' : ''}${inBodySummary.deltas.weight} lb
- Muscle: ${inBodySummary.deltas.muscleMass >= 0 ? '+' : ''}${inBodySummary.deltas.muscleMass} lb
- Body Fat %: ${inBodySummary.deltas.bodyFatPercentage >= 0 ? '+' : ''}${inBodySummary.deltas.bodyFatPercentage}%
- Body Fat Mass: ${inBodySummary.deltas.bodyFatMass != null ? (inBodySummary.deltas.bodyFatMass >= 0 ? '+' : '') + inBodySummary.deltas.bodyFatMass + ' lb' : 'n/a'}
- Trunk Fat Mass: ${inBodySummary.deltas.trunkFatMass != null ? (inBodySummary.deltas.trunkFatMass >= 0 ? '+' : '') + inBodySummary.deltas.trunkFatMass + ' lb' : 'n/a'}
- Visceral Fat Area: ${inBodySummary.deltas.visceralFatArea != null ? (inBodySummary.deltas.visceralFatArea >= 0 ? '+' : '') + inBodySummary.deltas.visceralFatArea + ' cm²' : 'n/a'}
- Visceral Fat Level: ${inBodySummary.deltas.visceralFat != null ? (inBodySummary.deltas.visceralFat >= 0 ? '+' : '') + inBodySummary.deltas.visceralFat : 'n/a'}` : 'No prior scan for comparison.'}

TRAINING (last ${workoutSummary.sessionCount} sessions):
- Frequency: ${workoutSummary.avgDaysBetween ? `${workoutSummary.avgDaysBetween} days between sessions` : 'insufficient data'}
- Category mix: ${JSON.stringify(workoutSummary.categoryMix)}
- Compound progression:
${workoutSummary.compoundProgress.map(c => `  • ${c.name}: ${c.priorWeight} → ${c.latestWeight} lb (${c.deltaLbs >= 0 ? '+' : ''}${c.deltaLbs}), latest ${c.latestReps} reps, ${c.sessionsLogged} sessions tracked`).join('\n') || '  (none tracked)'}

NUTRITION (last ${foodSummary.daysLogged} logged days — note any days unlogged are gaps):
- Avg calories: ${foodSummary.avgCalories} kcal/day
- Avg protein: ${foodSummary.avgProtein} g/day (target for recomp ≈ bodyweight × 1g = ${Math.round(inBodySummary.latest.weight)} g/day)
- Avg carbs/fat/fiber: ${foodSummary.avgCarbs}/${foodSummary.avgFat}/${foodSummary.avgFiber} g/day
- Logging compliance: ${foodSummary.daysLogged}/7 days

Analyze rate of change and whether the user is on track for their goal. Be honest about what the numbers imply — if logging is thin, call it out. Focus on belly fat loss (visceral) and progressive overload specifically.

Return ONLY valid JSON (no markdown):
{
  "verdict": "<one-line bottom line, max 14 words>",
  "status": "on_track" | "needs_adjustment" | "insufficient_data",
  "rate_analysis": "<2-3 sentences on rate of muscle gain vs fat loss. Reference specific numbers. If the deltas suggest recomp is working/not working, say so. If timespan is too short for conclusions, say that.>",
  "belly_fat_take": "<1-2 sentences specifically on belly fat / visceral fat trajectory based on BF% and body fat mass trend>",
  "strength_take": "<1-2 sentences on whether compound lifts are progressing fast enough to call it 'progressive overload'>",
  "actions": [
    "<Specific action tied to a number. e.g., 'Protein averaging Xg — bump to Yg by adding Z'>",
    "<Action 2>",
    "<Action 3>"
  ],
  "logging_note": "<Only include if food logging <5/7 days. Otherwise empty string.>"
}`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in LLM response');
    const insights = JSON.parse(jsonMatch[0]);

    const payload = {
      ...insights,
      context: {
        inBody: inBodySummary,
        workouts: workoutSummary,
        food: foodSummary,
      },
      generatedAt: new Date().toISOString(),
    };

    memoryCache.set(cacheKey, { data: payload, ts: Date.now() });
    if (redis) {
      try {
        await redis.set(cacheKey, JSON.stringify(payload), { ex: REDIS_TTL });
      } catch (err) {
        console.error('Redis write (recomp) failed:', err);
      }
    }

    return NextResponse.json(payload);
  } catch (err) {
    console.error('Recomp LLM error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed' }, { status: 500 });
  }
}
