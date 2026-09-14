import { v4 as uuidv4 } from 'uuid';
import { Workout, Exercise, ExerciseSet } from '@/types';
import { extractDateFromLine } from './date-parser';
import { normalizeExercise } from '../exercise/normalizer';
import { shouldAddBarWeight, isFormatDependentBarWeight, BAR_WEIGHT } from '../exercise/barbell';
import { parseWithLLM, needsLLMParsing } from './llm-parser';
import { normalizeExerciseBatch, NormalizedExerciseResult } from '../exercise/llm-normalizer';

/**
 * Bump whenever parsing output changes so cached workouts are rebuilt.
 *
 * v2: fixed e1RM/bar-weight/grouping root causes behind implausible early strength
 * numbers — see src/lib/exercise/strength.ts and the "Chest Press" note in barbell.ts.
 * Also fixes silently-dropped bodyweight "1x8" (set-number x reps, no weight) sets, and
 * stops hardcoding "this exercise used per-side plate format" for every LLM-routed
 * exercise regardless of why it was routed there.
 *
 * v3: fixes a v2 regression — a real (prod) LLM set-parse response for per-side "Nx2"
 * notation is PLATES ONLY (per its own prompt: "45x2" = 90 lbs of plates), same as the
 * deterministic regex path; only the "a + b + c" bar-inclusive notation returns a complete
 * total already. v2 skipped bar weight for every LLM-sourced result, silently dropping 45lb
 * from every real per-side LLM parse. Also tolerates the "Ix5"/"lx5" (capital I / lowercase
 * l typo'd as the leading "1") notation so that case no longer needs the LLM at all.
 */
export const PARSER_VERSION = 3;

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
  // Tolerate a common typo: a leading capital "I" or lowercase "l" standing in for "1"
  // right before the "x" (e.g. "Ix5 - 70x2" / "lx5 - 70x2" -> "1x5 - 70x2"). Only the very
  // first character is ever substituted, and only when it's immediately followed by the
  // set-number's "x" — this never touches a genuine digit elsewhere in the line.
  const cleaned = setStr.trim().replace(/^[Il](?=\s*x\s*\d)/, '1');

  // Pattern: "1x10 - 85x2" or "1x5 - 35x2" (weight with multiplier for per-side notation)
  const matchWithMultiplier = cleaned.match(/^\d+\s*x\s*(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)\s*x\s*(\d+)/i);
  if (matchWithMultiplier) {
    const weightPerSide = parseFloat(matchWithMultiplier[2]);
    const multiplier = parseInt(matchWithMultiplier[3]);
    return {
      reps: Math.round(parseFloat(matchWithMultiplier[1])),
      weight: weightPerSide * multiplier,
      isPlatePerSide: true,
    };
  }

  // Pattern: "1x10 - 85" or "2x10 - 100" or "1x10- 85" or "1x10 -85"
  const match = cleaned.match(/^\d+\s*x\s*(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)/i);
  if (match) {
    return {
      reps: Math.round(parseFloat(match[1])),
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

  // Pattern: "1x8" or "2x5" (set-number x reps, NO weight suffix — bodyweight set, e.g.
  // pull-ups). Must come after the dash/@ patterns above (which all require a weight) so
  // it only matches when there genuinely is no weight component.
  const bodyweightSet = cleaned.match(/^\d+\s*x\s*(\d+(?:\.\d+)?)\s*$/i);
  if (bodyweightSet) {
    return {
      reps: Math.round(parseFloat(bodyweightSet[1])),
      weight: 0,
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

interface SetParseResult {
  sets: ExerciseSet[];
  // Where `sets` came from. Matters for bar-weight: per the LLM's own prompt, "Nx2" per-side
  // notation returns PLATES ONLY (same as the deterministic regex path — "45x2" = 90 lbs of
  // plate), so it still needs bar weight added; only the "a + b + c" bar-inclusive notation
  // ("45 + 45 + 45" = bar + plates = 135 total) comes back as a complete total already.
  source: 'simple' | 'llm';
  // Whether the session's sets were genuinely written in per-side "Nx2" plate notation —
  // detected from the actual text, never assumed true just because this exercise happened
  // to be routed through the LLM path (it may have been routed here for an unrelated reason,
  // e.g. a typo'd line elsewhere in the same set list).
  hasPlatePerSideFormat: boolean;
  // Whether any line used the "a + b + c" (3+ numeric parts) bar-inclusive notation. Only
  // relevant when source === 'llm' — that's the one notation the LLM prompt tells it to
  // return as an already-complete total, so bar weight must NOT be added on top of it.
  hasBarInclusiveNotation: boolean;
}

/** Heuristic for lines the deterministic parser couldn't handle at all: does the tail of
 *  the line look like the per-side plate notation ("... - 45x2") used elsewhere in the log? */
function looksLikePlatePerSide(text: string): boolean {
  return /[-–—]\s*\d+(?:\.\d+)?\s*x\s*\d+\s*$/i.test(text.trim());
}

/** Mirrors the "3+ numeric parts joined by +" check in llm-parser.ts's needsLLMParsing —
 *  the one notation ("45 + 45 + 45") its prompt defines as bar + plates = complete total. */
function looksBarInclusive(text: string): boolean {
  const parts = text.trim().toLowerCase().split(/\s*\+\s*/).filter(p => /\d/.test(p));
  return parts.length >= 3;
}

/**
 * Parse exercise children with LLM fallback for complex patterns
 */
async function parseSetsFromChildrenWithLLM(
  exerciseName: string,
  children: NotionBlock[]
): Promise<SetParseResult> {
  const rawTexts: string[] = [];
  const simpleResults: { index: number; set: ParsedSet }[] = [];

  let hasComplexEntries = false;
  let hasPlatePerSideFormat = false;
  let hasBarInclusiveNotation = false;

  // First pass: always try simple parsing, track which need LLM
  for (let i = 0; i < children.length; i++) {
    const text = getBlockText(children[i]);
    if (!text) continue;

    rawTexts.push(text);
    if (looksBarInclusive(text)) hasBarInclusiveNotation = true;

    // Always try simple parsing first
    const set = parseSetString(text);
    if (set) {
      simpleResults.push({ index: i, set });
      if (set.isPlatePerSide) hasPlatePerSideFormat = true;
    } else {
      if (looksLikePlatePerSide(text)) hasPlatePerSideFormat = true;
      if (needsLLMParsing(text)) hasComplexEntries = true;
    }
  }

  // If all were parsed simply, return them
  if (simpleResults.length === rawTexts.length) {
    return {
      sets: simpleResults.map(r => ({ reps: r.set.reps, weight: r.set.weight })),
      source: 'simple',
      hasPlatePerSideFormat,
      hasBarInclusiveNotation,
    };
  }

  // Only use LLM if there are entries that simple parsing couldn't handle
  if (hasComplexEntries || simpleResults.length < rawTexts.length) {
    try {
      const llmResult = await parseWithLLM(exerciseName, rawTexts);
      if (llmResult.sets.length > 0) {
        console.log(`LLM parsed "${exerciseName}": ${llmResult.interpretation}`);
        return { sets: llmResult.sets, source: 'llm', hasPlatePerSideFormat, hasBarInclusiveNotation };
      }
    } catch (error) {
      console.error('LLM parsing failed, using simple parser:', error);
    }
  }

  // Fallback to simple results
  return {
    sets: simpleResults.map(r => ({ reps: r.set.reps, weight: r.set.weight })),
    source: 'simple',
    hasPlatePerSideFormat,
    hasBarInclusiveNotation,
  };
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

        // Add bar weight — uses format detection for format-dependent exercises (e.g. an
        // exercise logged under the same name for both a machine and a loaded barbell).
        const addBar = llmResult
          ? (llmResult.usesBarbell && (hasPlatePerSide || !isFormatDependentBarWeight(normalizedName)))
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
        const { sets: parsedSets, source, hasPlatePerSideFormat, hasBarInclusiveNotation } =
          await parseSetsFromChildrenWithLLM(item.name, item.children);
        let sets = parsedSets;

        // Use the normalizedName Pass 2 already resolved for this exact exercise instance
        // (LLM name-normalization result if available, otherwise the keyword fallback) —
        // don't recompute it separately, which could drift from what was actually stored.
        const normalizedName = item.workout.exercises[item.exerciseIndex].normalizedName;
        const llmResult = llmNormMap.get(item.name);

        // Bar weight: skip ONLY when the returned sets are a genuine LLM response AND the
        // session used the "a + b + c" bar-inclusive notation — that's the one case the LLM
        // prompt defines as already returning a complete total ("45 + 45 + 45" = bar +
        // plates = 135). Per-side "Nx2" notation (the overwhelmingly common case here) comes
        // back PLATES ONLY from the LLM too ("45x2" = 90 lbs of plate), same as the
        // deterministic regex path, so it still needs bar weight added. (Gating on `source`
        // too, not just the text pattern, matters for the rare case where a bar-inclusive
        // line fails to parse AND the LLM call itself fails — the fallback `sets` then come
        // from ordinary per-side lines elsewhere in the same session, which still need the
        // usual bar logic even though `hasBarInclusiveNotation` is true for the session.)
        const skipBarWeight = source === 'llm' && hasBarInclusiveNotation;
        if (!skipBarWeight) {
          const addBar = llmResult
            ? llmResult.usesBarbell && (hasPlatePerSideFormat || !isFormatDependentBarWeight(normalizedName))
            : shouldAddBarWeight(normalizedName, item.name, hasPlatePerSideFormat);

          if (addBar) {
            sets = sets.map(s => ({ ...s, weight: s.weight > 0 ? s.weight + BAR_WEIGHT : 0 }));
          }
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
