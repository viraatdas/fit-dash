import Anthropic from '@anthropic-ai/sdk';
import { ExerciseSet } from '@/types';

const client = new Anthropic();

interface ParsedSetResult {
  sets: ExerciseSet[];
  interpretation: string;
}

/**
 * Uses Claude to parse complex workout notation into structured data.
 * Handles variations like:
 * - "1x3 - 45x2" (1 set of 3 reps, 45 lbs each side = 90 lbs)
 * - "45 + 45 + 45" for bench (bar + plates = 135 lbs)
 * - "3x10 @ 135" (3 sets of 10 at 135 lbs)
 */
export async function parseWithLLM(
  exerciseName: string,
  rawSets: string[]
): Promise<ParsedSetResult> {
  const prompt = `Parse these workout sets for "${exerciseName}". Return ONLY valid JSON.

Exercise: ${exerciseName}
Raw set entries:
${rawSets.map((s, i) => `${i + 1}. "${s}"`).join('\n')}

IMPORTANT weight notation rules:
- For BARBELL exercises (bench press, squat, deadlift, barbell row):
  - "45 + 45 + 45" = bar (45) + 45 on each side = 135 lbs total
  - "45 + 45" = just the bar with no plates = 45 lbs, OR 45 per side = 90 lbs (use context)
  - "135" = 135 lbs total on the bar
- For DUMBBELL exercises (dumbbell press, curls, rows with dumbbells):
  - "35x2" or "35 x 2" = 35 lbs per hand = 70 lbs total (record as 70)
  - "40 + 40" = 40 lbs each hand = 80 lbs total
  - "35" alone usually means per hand for dumbbells
- For MACHINE/CABLE exercises:
  - Weight is typically the stack weight, use as-is
- Common patterns:
  - "1x10 - 85" = 1 set of 10 reps at 85 lbs
  - "1x3 - 45x2" = 1 set of 3 reps at 45x2=90 lbs (per-side notation)
  - "3x10" with no weight = 3 sets of 10 (bodyweight, weight=0)

Return JSON in this exact format:
{
  "sets": [
    {"reps": <number>, "weight": <total_weight_in_lbs>},
    ...
  ],
  "interpretation": "<brief explanation of how you parsed it>"
}`;

  try {
    const response = await client.messages.create({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        sets: parsed.sets || [],
        interpretation: parsed.interpretation || '',
      };
    }
  } catch (error) {
    console.error('LLM parsing error:', error);
  }

  // Fallback: return empty
  return { sets: [], interpretation: 'Failed to parse' };
}

/**
 * Batch parse multiple exercises at once (more efficient)
 */
export async function batchParseWithLLM(
  exercises: Array<{ name: string; rawSets: string[] }>
): Promise<Map<string, ParsedSetResult>> {
  const results = new Map<string, ParsedSetResult>();

  if (exercises.length === 0) return results;

  const exerciseList = exercises
    .map((e, i) => `
Exercise ${i + 1}: "${e.name}"
Sets: ${e.rawSets.map(s => `"${s}"`).join(', ')}`)
    .join('\n');

  const prompt = `Parse these workout exercises into structured data. Return ONLY valid JSON.

${exerciseList}

IMPORTANT weight notation rules:
- For BARBELL exercises (bench press, squat, deadlift, barbell row):
  - "45 + 45 + 45" = bar (45) + 45 on each side = 135 lbs total
  - The bar itself is 45 lbs
- For DUMBBELL exercises:
  - "35x2" = 35 lbs per hand = 70 lbs total
  - "40 + 40" = 40 lbs each hand = 80 lbs total
- Common patterns:
  - "1x10 - 85" = 1 set of 10 reps at 85 lbs
  - "1x3 - 45x2" = 1 set of 3 reps at 90 lbs (45 per side)
  - "3x10" alone = 3 sets of 10 reps, bodyweight (weight=0)

Return JSON array:
[
  {
    "exerciseName": "<name>",
    "sets": [{"reps": <number>, "weight": <total_lbs>}, ...],
    "interpretation": "<brief explanation>"
  },
  ...
]`;

  try {
    const response = await client.messages.create({
      model: 'claude-3-5-haiku-latest',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';

    // Extract JSON array from response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      for (const item of parsed) {
        results.set(item.exerciseName, {
          sets: item.sets || [],
          interpretation: item.interpretation || '',
        });
      }
    }
  } catch (error) {
    console.error('Batch LLM parsing error:', error);
  }

  return results;
}

/**
 * Smart parser that uses LLM only for ambiguous notations
 */
export function needsLLMParsing(setStr: string): boolean {
  const cleaned = setStr.trim().toLowerCase();

  // Needs LLM if:
  // - Has 3+ numbers with + signs (like "45 + 45 + 45")
  // - Has ambiguous x notation that could mean multiplier or reps
  // - Has unusual patterns

  // Count numbers separated by + (like "45 + 45 + 45")
  const plusParts = cleaned.split(/\s*\+\s*/).filter(p => /\d/.test(p));
  if (plusParts.length >= 3) return true;

  // Multiple x's in the string (like "1x3 - 45x2")
  const xCount = (cleaned.match(/x/gi) || []).length;
  if (xCount >= 2) return true;

  // "x2" at the end without space before (per-side notation like "45x2")
  // but not if it's at the start (like "3x10" for sets x reps)
  if (/\d+x\d+\s*[-–—]\s*\d+x\d+/i.test(cleaned)) return true;

  // Contains "per side" or "each" text
  if (/per\s*side|each/i.test(cleaned)) return true;

  // Complex weight notation with bar (like "bar + 45 + 45")
  if (/bar/i.test(cleaned)) return true;

  return false;
}
