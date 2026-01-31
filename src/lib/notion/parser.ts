import { v4 as uuidv4 } from 'uuid';
import { Workout, Exercise, ExerciseSet } from '@/types';
import { extractDateFromLine } from './date-parser';
import { normalizeExercise } from '../exercise/normalizer';

interface RichText {
  plain_text: string;
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
 * Parse set string like "1x10 - 85" or "2x10 - 100"
 * Format: {set_number}x{reps} - {weight}
 */
function parseSetString(setStr: string): ExerciseSet | null {
  const cleaned = setStr.trim();

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
 * Parse exercise children (the sets)
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

export function parseNotionPage(blocks: NotionBlock[]): Workout[] {
  const workouts: Workout[] = [];
  let currentWorkout: Workout | null = null;

  for (const block of blocks) {
    const text = getBlockText(block);
    const trimmedText = text.trim();

    // Skip empty blocks
    if (!trimmedText) continue;

    // Skip meta blocks (like "weights in lbs")
    if (block.type === 'bulleted_list_item') continue;

    // Check if this is a date block (paragraph or heading with date)
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

      // Parse sets from children
      let sets: ExerciseSet[] = [];
      if (block.children && block.children.length > 0) {
        sets = parseSetsFromChildren(block.children);
      }

      // Only add if we have a valid exercise name
      if (exerciseName && exerciseName.length > 1) {
        const normalized = normalizeExercise(exerciseName);
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

  // Sort by date descending (most recent first)
  workouts.sort((a, b) => b.date.getTime() - a.date.getTime());

  return workouts;
}

// Keep old function for backwards compatibility
export function parseNotionBlocks(blocks: NotionBlock[]): Workout[] {
  return parseNotionPage(blocks);
}
