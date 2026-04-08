import { GoogleGenerativeAI } from '@google/generative-ai';
import { ExerciseSet } from '@/types';

interface ParsedSetResult {
  sets: ExerciseSet[];
  interpretation: string;
}

export async function parseWithLLM(
  exerciseName: string,
  rawSets: string[]
): Promise<ParsedSetResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { sets: [], interpretation: 'No API key' };

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `Parse these workout sets for "${exerciseName}". Return ONLY valid JSON (no markdown, no code fences).

Exercise: ${exerciseName}
Raw set entries:
${rawSets.map((s, i) => `${i + 1}. "${s}"`).join('\n')}

Weight notation rules:
- "1x10 - 85" = 1 set of 10 reps at 85 lbs
- "1x3 - 45x2" = 1 set of 3 reps at 45x2=90 lbs (per-side notation)
- "35x2" = 35 lbs per side = 70 lbs total
- "3x10" with no weight = 3 sets of 10 (bodyweight, weight=0)
- "45 + 45 + 45" = bar + plates = 135 lbs total

Return JSON:
{
  "sets": [{"reps": <number>, "weight": <total_weight_in_lbs>}, ...],
  "interpretation": "<brief explanation>"
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();

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

  return { sets: [], interpretation: 'Failed to parse' };
}

export function needsLLMParsing(setStr: string): boolean {
  const cleaned = setStr.trim().toLowerCase();

  const plusParts = cleaned.split(/\s*\+\s*/).filter(p => /\d/.test(p));
  if (plusParts.length >= 3) return true;

  const xCount = (cleaned.match(/x/gi) || []).length;
  if (xCount >= 2) return true;

  if (/\d+x\d+\s*[-–—]\s*\d+x\d+/i.test(cleaned)) return true;
  if (/per\s*side|each/i.test(cleaned)) return true;
  if (/bar/i.test(cleaned)) return true;

  return false;
}
