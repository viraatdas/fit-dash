import type { Redis } from '@upstash/redis';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ExerciseCategory } from '@/types';
import { getRedis } from '@/lib/redis';

const CACHE_PREFIX = 'exercise:norm:';
const CACHE_TTL = 60 * 60 * 24 * 90; // 90 days

export interface NormalizedExerciseResult {
  name: string;
  category: ExerciseCategory;
  usesBarbell: boolean;
  equipment: 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'other';
}

function cacheKey(rawName: string): string {
  return CACHE_PREFIX + rawName.toLowerCase().trim();
}

async function checkCache(
  redis: Redis,
  rawNames: string[]
): Promise<{ hits: Map<string, NormalizedExerciseResult>; misses: string[] }> {
  const hits = new Map<string, NormalizedExerciseResult>();
  const misses: string[] = [];

  if (rawNames.length === 0) return { hits, misses };

  const keys = rawNames.map(n => cacheKey(n));
  const results = await redis.mget<(NormalizedExerciseResult | null)[]>(...keys);

  for (let i = 0; i < rawNames.length; i++) {
    const result = results[i];
    if (result && result.name) {
      hits.set(rawNames[i], result);
    } else {
      misses.push(rawNames[i]);
    }
  }

  return { hits, misses };
}

async function normalizeWithLLM(
  rawNames: string[]
): Promise<Map<string, NormalizedExerciseResult>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || rawNames.length === 0) return new Map();

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `Normalize these gym exercise names. For each, return:
- name: canonical exercise name (e.g., "Bench Press", "Barbell Squat", "Lat Pulldown")
- category: one of "Upper Body", "Lower Body", "Back", "Core", "Cardio", "Other"
- equipment: one of "barbell", "dumbbell", "machine", "cable", "bodyweight", "other"
- usesBarbell: true if the exercise uses a standard Olympic barbell (45 lbs) as primary equipment

Rules:
- Fix misspellings (e.g., "dumbell" → "dumbbell", "benchpress" → "bench press")
- If name says "dumbbell"/"dumbell"/"db" → equipment is "dumbbell", usesBarbell is false
- If name says "machine"/"pulley"/"cable"/"iso lateral"/"hack"/"smith" → not barbell
- If name says "barbell"/"bar bell"/"bb" → equipment is "barbell", usesBarbell is true
- "Chest press" without qualifier → assume barbell (usesBarbell: true)
- "Squat"/"Squats" without qualifier → assume barbell (usesBarbell: true)
- "Bench press" without qualifier → assume barbell (usesBarbell: true)
- "Calf raise"/"Calf raises" without qualifier → assume barbell (usesBarbell: true)
- "Preacher curl" → machine/bench, usesBarbell: false (uses EZ bar or machine)
- "Lat pulldown" → machine, usesBarbell: false
- "Leg press" → machine, usesBarbell: false
- Deadlifts → barbell unless specified otherwise
- Rows without qualifier → check context; "low row"/"seated row" → machine/cable

Exercises to normalize:
${rawNames.map((n, i) => `${i + 1}. "${n}"`).join('\n')}

Respond with ONLY a JSON array (no markdown, no code fences):
[{"raw": "original name", "name": "Canonical Name", "category": "Category", "equipment": "type", "usesBarbell": true/false}, ...]`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return new Map();

  const results = new Map<string, NormalizedExerciseResult>();
  try {
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      raw: string;
      name: string;
      category: ExerciseCategory;
      equipment: string;
      usesBarbell: boolean;
    }>;

    for (const item of parsed) {
      results.set(item.raw, {
        name: item.name,
        category: item.category,
        usesBarbell: item.usesBarbell,
        equipment: item.equipment as NormalizedExerciseResult['equipment'],
      });
    }
  } catch (e) {
    console.error('Failed to parse LLM normalization response:', e);
  }

  return results;
}

async function cacheResults(
  redis: Redis,
  results: Map<string, NormalizedExerciseResult>
) {
  const pipeline = redis.pipeline();
  results.forEach((result, rawName) => {
    pipeline.set(cacheKey(rawName), JSON.stringify(result), { ex: CACHE_TTL });
  });
  await pipeline.exec();
}

export async function normalizeExerciseBatch(
  rawNames: string[]
): Promise<Map<string, NormalizedExerciseResult>> {
  const unique = Array.from(new Set(rawNames.map(n => n.trim()).filter(Boolean)));
  const allResults = new Map<string, NormalizedExerciseResult>();

  const redis = getRedis();

  if (redis) {
    try {
      const { hits, misses } = await checkCache(redis, unique);

      hits.forEach((result, name) => {
        allResults.set(name, result);
      });

      if (misses.length > 0) {
        console.log(`LLM normalizing ${misses.length} exercises: ${misses.join(', ')}`);
        const llmResults = await normalizeWithLLM(misses);

        if (llmResults.size > 0) {
          await cacheResults(redis, llmResults);
          llmResults.forEach((result, name) => {
            allResults.set(name, result);
          });
        }
      }
    } catch (error) {
      console.error('LLM normalization failed, will use fallback:', error);
    }
  }

  return allResults;
}

export async function clearNormalizationCache(): Promise<number> {
  const redis = getRedis();
  if (!redis) return 0;

  let cursor = '0';
  let deleted = 0;
  do {
    const scanResult = await redis.scan(Number(cursor), { match: `${CACHE_PREFIX}*`, count: 100 }) as [string, string[]];
    cursor = String(scanResult[0]);
    const keys = scanResult[1];
    if (keys.length > 0) {
      await redis.del(...keys);
      deleted += keys.length;
    }
  } while (cursor !== '0');

  return deleted;
}
