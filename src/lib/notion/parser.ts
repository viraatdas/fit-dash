import { v4 as uuidv4 } from 'uuid';
import { Workout, Exercise, ExerciseSet } from '@/types';
import { extractDateFromLine } from './date-parser';
import { normalizeExercise } from '../exercise/normalizer';
import { parseWithLLM, needsLLMParsing } from './llm-parser';

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

/**
 * Parse set string like "1x10 - 85" or "2x10 - 100" or "1x5 - 35x2"
 * Format: {set_number}x{reps} - {weight} or {weight}x{multiplier}
 */
function parseSetString(setStr: string): ExerciseSet | null {
  const cleaned = setStr.trim();

  // Pattern: "1x10 - 85x2" or "1x5 - 35x2" (weight with multiplier for per-side notation)
  const matchWithMultiplier = cleaned.match(/^\d+\s*x\s*(\d+)\s*[-–—]\s*(\d+(?:\.\d+)?)\s*x\s*(\d+)/i);
  if (matchWithMultiplier) {
    const weightPerSide = parseFloat(matchWithMultiplier[2]);
    const multiplier = parseInt(matchWithMultiplier[3]);
    return {
      reps: parseInt(matchWithMultiplier[1]),
      weight: weightPerSide * multiplier,
    };
  }

  // Pattern: "1x10 - 85" or "2x10 - 100" or "1x10- 85" or "1x10 -85"
  const match = cleaned.match(/^\d+\s*x\s*(\d+)\s*[-–—]\s*(\d+(?:\.\d+)?)/i);
  if (match) {
    return {
      reps: parseInt(match[1]),
      weight: parseFloat(match[2]),
    };
  }

  // Pattern: "10 reps @ 85" or "10 @ 85"
  const atMatch = cleaned.match(/^(\d+)\s*(?:reps)?\s*@\s*(\d+(?:\.\d+)?)/i);
  if (atMatch) {
    return {
      reps: parseInt(atMatch[1]),
      weight: parseFloat(atMatch[2]),
    };
  }

  // Pattern: just "10" (reps only, bodyweight)
  const repsOnly = cleaned.match(/^(\d+)$/);
  if (repsOnly) {
    return {
      reps: parseInt(repsOnly[1]),
      weight: 0,
    };
  }

  return null;
}

/**
 * Parse exercise children (the sets) - sync version for simple patterns
 */
function parseSetsFromChildren(children: NotionBlock[]): ExerciseSet[] {
  const sets: ExerciseSet[] = [];

  for (const child of children) {
    const text = getBlockText(child);
    if (text) {
      const set = parseSetString(text);
      if (set) {
        sets.push(set);
      }
    }
  }

  return sets;
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

  // First pass: try simple parsing, collect complex ones
  for (let i = 0; i < children.length; i++) {
    const text = getBlockText(children[i]);
    if (!text) continue;

    rawTexts.push(text);

    // Check if this needs LLM
    if (needsLLMParsing(text)) {
      // Will be handled by LLM
      continue;
    }

    // Try simple parsing
    const set = parseSetString(text);
    if (set) {
      simpleResults.push({ index: i, set });
    }
  }

  // If all were parsed simply, return them
  if (simpleResults.length === rawTexts.length) {
    return simpleResults.map(r => r.set);
  }

  // Otherwise, use LLM to parse all (for consistency)
  try {
    const llmResult = await parseWithLLM(exerciseName, rawTexts);
    if (llmResult.sets.length > 0) {
      console.log(`LLM parsed "${exerciseName}": ${llmResult.interpretation}`);
      return llmResult.sets;
    }
  } catch (error) {
    console.error('LLM parsing failed, using simple parser:', error);
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

  // Collect exercises that need LLM parsing
  const exercisesToParse: Array<{
    workout: Workout;
    exerciseIndex: number;
    name: string;
    children: NotionBlock[];
  }> = [];

  for (const block of blocks) {
    const text = getBlockText(block);
    const trimmedText = text.trim();

    // Skip empty blocks
    if (!trimmedText) continue;

    // Skip meta blocks (like "weights in lbs")
    if (block.type === 'bulleted_list_item') continue;

    // Check if this is a date block (paragraph or heading with date)
    // First check for Notion date mentions (@Today, @Thursday, etc.)
    const mentionDate = getDateFromMention(block);
    if (mentionDate) {
      // Save previous workout if exists and has exercises
      if (currentWorkout && currentWorkout.exercises.length > 0) {
        workouts.push(currentWorkout);
      }
      // Start new workout
      currentWorkout = {
        id: uuidv4(),
        date: mentionDate,
        exercises: [],
      };
      continue;
    }

    // Then check for text-based dates
    if ((block.type === 'paragraph' || block.type.startsWith('heading')) && isDateText(trimmedText)) {
      const date = extractDateFromLine(trimmedText);
      if (date) {
        // Save previous workout if exists and has exercises
        if (currentWorkout && currentWorkout.exercises.length > 0) {
          workouts.push(currentWorkout);
        }
        // Start new workout
        currentWorkout = {
          id: uuidv4(),
          date,
          exercises: [],
        };
        continue;
      }
    }

    // Check if this is an exercise (numbered_list_item with children)
    if (block.type === 'numbered_list_item' && currentWorkout) {
      const exerciseName = trimmedText;

      // Only add if we have a valid exercise name
      if (exerciseName && exerciseName.length > 1) {
        const normalized = normalizeExercise(exerciseName);

        // Check if any children need LLM parsing
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

        // Parse sets - either simple or mark for LLM
        let sets: ExerciseSet[] = [];
        if (block.children && block.children.length > 0) {
          if (needsLLM) {
            // Mark for LLM parsing later
            exercisesToParse.push({
              workout: currentWorkout,
              exerciseIndex: currentWorkout.exercises.length,
              name: exerciseName,
              children: block.children,
            });
          } else {
            sets = parseSetsFromChildren(block.children);
          }
        }

        const exercise: Exercise = {
          rawName: exerciseName,
          normalizedName: normalized.name,
          category: normalized.category,
          sets,
        };
        currentWorkout.exercises.push(exercise);
      }
    }
  }

  // Don't forget the last workout
  if (currentWorkout && currentWorkout.exercises.length > 0) {
    workouts.push(currentWorkout);
  }

  // Process LLM parsing for complex notations
  if (exercisesToParse.length > 0) {
    console.log(`Using LLM to parse ${exercisesToParse.length} exercises with complex notation`);

    // Parse in parallel (but not too many at once)
    const batchSize = 5;
    for (let i = 0; i < exercisesToParse.length; i += batchSize) {
      const batch = exercisesToParse.slice(i, i + batchSize);
      const promises = batch.map(async (item) => {
        const sets = await parseSetsFromChildrenWithLLM(item.name, item.children);
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
