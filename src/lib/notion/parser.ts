import { v4 as uuidv4 } from 'uuid';
import { Workout, Exercise, ExerciseSet } from '@/types';
import { extractDateFromLine } from './date-parser';
import { normalizeExercise } from '../exercise/normalizer';
import { shouldAddBarWeight, usesBarbell, BAR_WEIGHT } from '../exercise/barbell';
import { parseWithLLM, needsLLMParsing } from './llm-parser';
import { normalizeExerciseBatch, NormalizedExerciseResult } from '../exercise/llm-normalizer';

interface RichText {
  plain_text: string;
  type?: string;
  mention?: {
    type: string;
    date?: {
      start: string;
      end?: string | null;
    };
  };
}

interface NotionBlock {
  id: string;
  type: string;
  has_children?: boolean;
  children?: NotionBlock[];
  paragraph?: { rich_text: RichText[] };
  heading_1?: { rich_text: RichText[] };
  heading_2?: { rich_text: RichText[] };
  heading_3?: { rich_text: RichText[] };
  bulleted_list_item?: { rich_text: RichText[] };
  numbered_list_item?: { rich_text: RichText[] };
  toggle?: { rich_text: RichText[] };
}

function getBlockText(block: NotionBlock): string {
  const type = block.type as keyof NotionBlock;
  const content = block[type];

  if (content && typeof content === 'object' && 'rich_text' in content) {
    const richText = content.rich_text as RichText[];
    if (richText && richText.length > 0) {
      return richText.map(t => t.plain_text).join('');
    }
  }

  return '';
}

/**
 * Extract date from Notion date mention (@Today, @Thursday, etc.)
 */
function getDateFromMention(block: NotionBlock): Date | null {
  const type = block.type as keyof NotionBlock;
  const content = block[type];

  if (content && typeof content === 'object' && 'rich_text' in content) {
    const richText = content.rich_text as RichText[];
    for (const rt of richText) {
      if (rt.type === 'mention' && rt.mention?.type === 'date' && rt.mention.date?.start) {
        return new Date(rt.mention.date.start);
      }
    }
  }

  return null;
}

interface ParsedSet extends ExerciseSet {
  isPlatePerSide: boolean; // true when x2 multiplier format detected (plate-only weight)
}

/**
 * Parse set string like "1x10 - 85" or "2x10 - 100" or "1x5 - 35x2"
 * Format: {set_number}x{reps} - {weight} or {weight}x{multiplier}
 */
function parseSetString(setStr: string): ParsedSet | null {
  const cleaned = setStr.trim();

  // Pattern: "1x10 - 85x2" or "1x5 - 35x2" (weight with multiplier for per-side notation)
  const matchWithMultiplier = cleaned.match(/^\d+\s*x\s*(\d+)\s*[-–—]\s*(\d+(?:\.\d+)?)\s*x\s*(\d+)/i);
  if (matchWithMultiplier) {
    const weightPerSide = parseFloat(matchWithMultiplier[2]);
    const multiplier = parseInt(matchWithMultiplier[3]);
    return {
      reps: parseInt(matchWithMultiplier[1]),
      weight: weightPerSide * multiplier,
      isPlatePerSide: true,
    };
  }

  // Pattern: "1x10 - 85" or "2x10 - 100" or "1x10- 85" or "1x10 -85"
  const match = cleaned.match(/^\d+\s*x\s*(\d+)\s*[-–—]\s*(\d+(?:\.\d+)?)/i);
  if (match) {
    return {
      reps: parseInt(match[1]),
      weight: parseFloat(match[2]),
      isPlatePerSide: false,
    };
  }

  // Pattern: "10 reps @ 85" or "10 @ 85"
  const atMatch = cleaned.match(/^(\d+)\s*(?:reps)?\s*@\s*(\d+(?:\.\d+)?)/i);
  if (atMatch) {
    return {
      reps: parseInt(atMatch[1]),
      weight: parseFloat(atMatch[2]),
      isPlatePerSide: false,
    };
  }

  // Pattern: just "10" (reps only, bodyweight)
  const repsOnly = cleaned.match(/^(\d+)$/);
  if (repsOnly) {
    return {
      reps: parseInt(repsOnly[1]),
      weight: 0,
      isPlatePerSide: false,
    };
  }

  return null;
}

interface ParsedSetsResult {
  sets: ExerciseSet[];
  hasPlatePerSide: boolean; // true if ANY set used x2 format
}

/**
 * Parse exercise children (the sets) - sync version for simple patterns
 */
function parseSetsFromChildren(children: NotionBlock[]): ParsedSetsResult {
  const sets: ExerciseSet[] = [];
  let hasPlatePerSide = false;

  for (const child of children) {
    const text = getBlockText(child);
    if (text) {
      const set = parseSetString(text);
      if (set) {
        if (set.isPlatePerSide) hasPlatePerSide = true;
        sets.push({ reps: set.reps, weight: set.weight });
      }
    }
  }

  return { sets, hasPlatePerSide };
}

/**
 * Parse exercise children with LLM fallback for complex patterns
 */
async function parseSetsFromChildrenWithLLM(
  exerciseName: string,
  children: NotionBlock[]
): Promise<ExerciseSet[]> {
  const rawTexts: string[] = [];
  const simpleResults: { index: number; set: ExerciseSet }[] = [];

  let hasComplexEntries = false;

  // First pass: always try simple parsing, track which need LLM
  for (let i = 0; i < children.length; i++) {
    const text = getBlockText(children[i]);
    if (!text) continue;

    rawTexts.push(text);

    // Always try simple parsing first
    const set = parseSetString(text);
    if (set) {
      simpleResults.push({ index: i, set });
    } else if (needsLLMParsing(text)) {
      hasComplexEntries = true;
    }
  }

  // If all were parsed simply, return them
  if (simpleResults.length === rawTexts.length) {
    return simpleResults.map(r => r.set);
  }

  // Only use LLM if there are entries that simple parsing couldn't handle
  if (hasComplexEntries || simpleResults.length < rawTexts.length) {
    try {
      const llmResult = await parseWithLLM(exerciseName, rawTexts);
      if (llmResult.sets.length > 0) {
        console.log(`LLM parsed "${exerciseName}": ${llmResult.interpretation}`);
        return llmResult.sets;
      }
    } catch (error) {
      console.error('LLM parsing failed, using simple parser:', error);
    }
  }

  // Fallback to simple results
  return simpleResults.map(r => r.set);
}

/**
 * Check if text looks like a date
 */
function isDateText(text: string): boolean {
  const cleaned = text.trim();
  // Check for YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) return true;
  // Check for Month Day, Year format
  if (/^[A-Za-z]+\s+\d{1,2},?\s+\d{4}/.test(cleaned)) return true;
  return false;
}

export async function parseNotionPage(blocks: NotionBlock[]): Promise<Workout[]> {
  const workouts: Workout[] = [];
  let currentWorkout: Workout | null = null;

  // Collect exercises that need LLM set parsing
  const exercisesToParse: Array<{
    workout: Workout;
    exerciseIndex: number;
    name: string;
    children: NotionBlock[];
  }> = [];

  // Pass 1: Collect all raw exercise names for batch LLM normalization
  const allRawNames: string[] = [];
  for (const block of blocks) {
    if (block.type === 'numbered_list_item') {
      const text = getBlockText(block).trim();
      if (text && text.length > 1) allRawNames.push(text);
    }
  }

  // Batch normalize with LLM (cached in Redis, only new names hit the LLM)
  let llmNormMap = new Map<string, NormalizedExerciseResult>();
  try {
    llmNormMap = await normalizeExerciseBatch(allRawNames);
  } catch (error) {
    console.error('LLM batch normalization failed, using fallback:', error);
  }

  // Pass 2: Parse blocks into workouts using LLM normalization results
  for (const block of blocks) {
    const text = getBlockText(block);
    const trimmedText = text.trim();

    if (!trimmedText) continue;
    if (block.type === 'bulleted_list_item') continue;

    // Check for date mentions
    const mentionDate = getDateFromMention(block);
    if (mentionDate) {
      if (currentWorkout && currentWorkout.exercises.length > 0) {
        workouts.push(currentWorkout);
      }
      currentWorkout = { id: uuidv4(), date: mentionDate, exercises: [] };
      continue;
    }

    // Check for text-based dates
    if ((block.type === 'paragraph' || block.type.startsWith('heading')) && isDateText(trimmedText)) {
      const date = extractDateFromLine(trimmedText);
      if (date) {
        if (currentWorkout && currentWorkout.exercises.length > 0) {
          workouts.push(currentWorkout);
        }
        currentWorkout = { id: uuidv4(), date, exercises: [] };
        continue;
      }
    }

    // Exercise block
    if (block.type === 'numbered_list_item' && currentWorkout) {
      const exerciseName = trimmedText;

      if (exerciseName && exerciseName.length > 1) {
        // Use LLM normalization if available, otherwise fall back to keyword-based
        const llmResult = llmNormMap.get(exerciseName);
        const fallbackNorm = normalizeExercise(exerciseName);

        const normalizedName = llmResult?.name || fallbackNorm.name;
        const category = llmResult?.category || fallbackNorm.category;
        const isBarbell = llmResult
          ? llmResult.usesBarbell
          : usesBarbell(fallbackNorm.name, exerciseName);

        // Check if children need LLM set parsing
        let needsLLM = false;
        if (block.children && block.children.length > 0) {
          for (const child of block.children) {
            const childText = getBlockText(child);
            if (childText && needsLLMParsing(childText)) {
              needsLLM = true;
              break;
            }
          }
        }

        // Parse sets
        let sets: ExerciseSet[] = [];
        let hasPlatePerSide = false;
        if (block.children && block.children.length > 0) {
          if (needsLLM) {
            exercisesToParse.push({
              workout: currentWorkout,
              exerciseIndex: currentWorkout.exercises.length,
              name: exerciseName,
              children: block.children,
            });
          } else {
            const parsed = parseSetsFromChildren(block.children);
            sets = parsed.sets;
            hasPlatePerSide = parsed.hasPlatePerSide;
          }
        }

        // Add bar weight — uses format detection for recently-switched exercises
        const addBar = llmResult
          ? (llmResult.usesBarbell && (hasPlatePerSide || !['Calf Raise', 'Standing Calf Raise'].includes(normalizedName)))
          : shouldAddBarWeight(normalizedName, exerciseName, hasPlatePerSide);

        if (addBar) {
          sets = sets.map(s => ({
            ...s,
            weight: s.weight > 0 ? s.weight + BAR_WEIGHT : 0,
          }));
        }

        const exercise: Exercise = {
          rawName: exerciseName,
          normalizedName: normalizedName,
          category,
          sets,
        };
        currentWorkout.exercises.push(exercise);
      }
    }
  }

  if (currentWorkout && currentWorkout.exercises.length > 0) {
    workouts.push(currentWorkout);
  }

  // Process LLM set parsing for complex notations
  if (exercisesToParse.length > 0) {
    console.log(`Using LLM to parse ${exercisesToParse.length} exercises with complex notation`);

    const batchSize = 5;
    for (let i = 0; i < exercisesToParse.length; i += batchSize) {
      const batch = exercisesToParse.slice(i, i + batchSize);
      const promises = batch.map(async (item) => {
        let sets = await parseSetsFromChildrenWithLLM(item.name, item.children);

        // LLM-parsed exercises came from needsLLMParsing (x2 format), so hasPlatePerSide=true
        const llmResult = llmNormMap.get(item.name);
        const normalized = normalizeExercise(item.name);
        const addBar = llmResult
          ? llmResult.usesBarbell
          : shouldAddBarWeight(normalized.name, item.name, true);

        if (addBar) {
          sets = sets.map(s => ({ ...s, weight: s.weight > 0 ? s.weight + BAR_WEIGHT : 0 }));
        }
        item.workout.exercises[item.exerciseIndex].sets = sets;
      });
      await Promise.all(promises);
    }
  }

  // Sort by date descending (most recent first)
  workouts.sort((a, b) => b.date.getTime() - a.date.getTime());

  return workouts;
}

// Keep old function for backwards compatibility
export async function parseNotionBlocks(blocks: NotionBlock[]): Promise<Workout[]> {
  return parseNotionPage(blocks);
}
