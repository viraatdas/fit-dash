import { generateText, extractJson, isLLMConfigured } from '@/lib/llm';
import { ExerciseCategory } from '@/types';
import { getCached, setCached, deleteCachedByPrefix } from '@/lib/cache/store';

const CACHE_PREFIX = 'exercise:norm:';

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
  rawNames: string[]
): Promise<{ hits: Map<string, NormalizedExerciseResult>; misses: string[] }> {
  const hits = new Map<string, NormalizedExerciseResult>();
  const misses: string[] = [];

  if (rawNames.length === 0) return { hits, misses };

  const results = await Promise.all(
    rawNames.map(n => getCached<NormalizedExerciseResult>(cacheKey(n)))
  );

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
  if (!isLLMConfigured() || rawNames.length === 0) return new Map();

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

  const text = await generateText(prompt);

  const results = new Map<string, NormalizedExerciseResult>();
  const parsed = extractJson<Array<{
    raw: string;
    name: string;
    category: ExerciseCategory;
    equipment: string;
    usesBarbell: boolean;
  }>>(text, 'array');

  if (!parsed) {
    console.error('Failed to parse LLM normalization response');
    return results;
  }

  for (const item of parsed) {
    results.set(item.raw, {
      name: item.name,
      category: item.category,
      usesBarbell: item.usesBarbell,
      equipment: item.equipment as NormalizedExerciseResult['equipment'],
    });
  }

  return results;
}

async function cacheResults(results: Map<string, NormalizedExerciseResult>) {
  await Promise.all(
    Array.from(results.entries()).map(([rawName, result]) => setCached(cacheKey(rawName), result))
  );
}

export async function normalizeExerciseBatch(
  rawNames: string[]
): Promise<Map<string, NormalizedExerciseResult>> {
  const unique = Array.from(new Set(rawNames.map(n => n.trim()).filter(Boolean)));
  const allResults = new Map<string, NormalizedExerciseResult>();

  try {
    const { hits, misses } = await checkCache(unique);

    hits.forEach((result, name) => {
      allResults.set(name, result);
    });

    if (misses.length > 0) {
      console.log(`LLM normalizing ${misses.length} exercises: ${misses.join(', ')}`);
      const llmResults = await normalizeWithLLM(misses);

      if (llmResults.size > 0) {
        await cacheResults(llmResults);
        llmResults.forEach((result, name) => {
          allResults.set(name, result);
        });
      }
    }
  } catch (error) {
    console.error('LLM normalization failed, will use fallback:', error);
  }

  return allResults;
}

export async function clearNormalizationCache(): Promise<number> {
  return deleteCachedByPrefix(CACHE_PREFIX);
}
