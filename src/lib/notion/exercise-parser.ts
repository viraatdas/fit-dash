import { ExerciseSet } from '@/types';
import { parseWeight, parseReps } from './weight-parser';

export interface ParsedExercise {
  name: string;
  sets: ExerciseSet[];
}

/**
 * Parses exercise lines in various formats:
 * - "Bench Press: 135x10, 155x8, 175x6"
 * - "Squat - 225 x 5 x 3" (225 lbs, 5 reps, 3 sets)
 * - "Bicep Curl: 40+40 x 10"
 * - "Pull ups: 10, 8, 6"
 * - "Dumbbell Row 40+40 3x10"
 */
export function parseExerciseLine(line: string): ParsedExercise | null {
  const cleaned = line.trim();
  if (!cleaned || cleaned.length < 3) return null;

  // Try to split by common delimiters
  let name: string;
  let setsStr: string;

  // Pattern: "Exercise: sets" or "Exercise - sets"
  const colonSplit = cleaned.split(/[:\-–—]\s*/);
  if (colonSplit.length >= 2) {
    name = colonSplit[0].trim();
    setsStr = colonSplit.slice(1).join(' ').trim();
  } else {
    // Try to find where the name ends and numbers begin
    const match = cleaned.match(/^([a-zA-Z\s]+)[\s:]+(.+)$/);
    if (match) {
      name = match[1].trim();
      setsStr = match[2].trim();
    } else {
      return null;
    }
  }

  if (!name || !setsStr) return null;

  const sets = parseSets(setsStr);

  return {
    name,
    sets
  };
}

/**
 * Parses sets from various formats
 */
function parseSets(setsStr: string): ExerciseSet[] {
  const sets: ExerciseSet[] = [];

  // Pattern: "135x10, 155x8, 175x6" (comma-separated weight x reps)
  const commaSets = setsStr.split(/,\s*/);
  if (commaSets.length > 1) {
    for (const setStr of commaSets) {
      const parsed = parseWeightReps(setStr);
      if (parsed) {
        sets.push(parsed);
      }
    }
    if (sets.length > 0) return sets;
  }

  // Pattern: "225 x 5 x 3" (weight x reps x numSets)
  const tripleMatch = setsStr.match(/^([\d\s+.]+)\s*x\s*(\d+)\s*x\s*(\d+)$/i);
  if (tripleMatch) {
    const weight = parseWeight(tripleMatch[1]);
    const reps = parseInt(tripleMatch[2]);
    const numSets = parseInt(tripleMatch[3]);
    for (let i = 0; i < numSets; i++) {
      sets.push({ weight, reps });
    }
    return sets;
  }

  // Pattern: "3x10" or "3 x 10" (numSets x reps, no weight - bodyweight)
  const setsRepsOnly = setsStr.match(/^(\d+)\s*x\s*(\d+)$/i);
  if (setsRepsOnly) {
    const numSets = parseInt(setsRepsOnly[1]);
    const reps = parseInt(setsRepsOnly[2]);
    // Check if first number is reasonable for sets (1-10)
    if (numSets <= 10) {
      for (let i = 0; i < numSets; i++) {
        sets.push({ weight: 0, reps });
      }
      return sets;
    }
  }

  // Pattern: "40+40 x 10" or "135 x 10" (weight x reps, single set)
  const singleSet = parseWeightReps(setsStr);
  if (singleSet) {
    sets.push(singleSet);
    return sets;
  }

  // Pattern: "10, 8, 6" (just reps, bodyweight exercise)
  const repsOnly = setsStr.match(/^[\d,\s]+$/);
  if (repsOnly) {
    const repsList = setsStr.split(/,\s*/).map(r => parseInt(r.trim())).filter(r => !isNaN(r));
    for (const reps of repsList) {
      sets.push({ weight: 0, reps });
    }
    return sets;
  }

  return sets;
}

/**
 * Parses a single "weight x reps" pattern
 */
function parseWeightReps(str: string): ExerciseSet | null {
  const cleaned = str.trim();

  // Pattern: "135x10" or "40+40 x 10" or "135 x 10"
  const match = cleaned.match(/^([\d\s+.]+)\s*x\s*(\d+)$/i);
  if (match) {
    const weight = parseWeight(match[1]);
    const reps = parseReps(match[2]);
    return { weight, reps };
  }

  return null;
}
