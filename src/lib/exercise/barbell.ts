const BAR_WEIGHT = 45; // Standard Olympic barbell in lbs

// Exercises where the user ALWAYS logs plate weight only (never included bar)
const ALWAYS_PLATE_ONLY = new Set([
  'Bench Press',
  'Barbell Bench Press',
  'Incline Bench Press',
  'Decline Bench Press',
  'Close Grip Bench Press',
  'Squat',
  'Back Squat',
  'Front Squat',
  'Deadlift',
  'Conventional Deadlift',
  'Sumo Deadlift',
  'Romanian Deadlift',
  'Stiff Leg Deadlift',
  'Barbell Row',
  'T-Bar Row',
  'Overhead Press',
  'Military Press',
  'Shoulder Press',
  'Barbell Bicep Curl',
  'Skull Crusher',
  'Hip Thrust',
]);

// Exercises the user logs under the SAME name for two different pieces of equipment
// (e.g. a plate-loaded/barbell version some days, a fixed-stack machine other days),
// distinguished only by whether the per-side "Nx2" plate format was used that session.
// For these, only add bar weight when that format is actually detected — never assume.
//
// 'Chest Press' lives here (not in ALWAYS_PLATE_ONLY) because the data shows the exact
// same raw name "Chest press" used for a genuine plate-loaded press (logged as "35x2",
// "45x2" etc.) AND for a chest press *machine* (logged as a single already-total number
// like "100", "145" lbs — confirmed by a sibling entry explicitly labeled
// "Chest press (machine)" at the same ~100-150 lb scale). Unconditionally adding +45
// bar weight here silently inflated every un-annotated machine session by 45 lbs.
const FORMAT_DEPENDENT_BAR_WEIGHT = new Set([
  'Calf Raise',
  'Standing Calf Raise',
  'Chest Press',
]);

/** True when bar-weight addition for this canonical name depends on the logged set format
 *  (only add when per-side "x2" plate notation was detected that session) rather than being
 *  a fixed yes/no based on the exercise name alone. */
export function isFormatDependentBarWeight(normalizedName: string): boolean {
  return FORMAT_DEPENDENT_BAR_WEIGHT.has(normalizedName);
}

// Keywords in the raw name that mean it's NOT a barbell exercise
const NON_BARBELL_KEYWORDS = [
  'dumbbell', 'dumbell', 'db ', 'machine', 'cable', 'pulley',
  'iso lateral', 'smith', 'pec deck', 'seated low',
  'low row', 'lat pull', 'hack',
];

// Keywords in the raw name that mean it IS a barbell exercise
const BARBELL_KEYWORDS = ['barbell', 'bar bell', 'bb '];

/**
 * Determines if an exercise uses a barbell based on both normalized and raw names.
 * Does NOT account for format-based detection (x2 plate format) — see shouldAddBarWeight.
 */
export function usesBarbell(normalizedName: string, rawName?: string): boolean {
  const rawLower = (rawName || '').toLowerCase();

  if (rawLower && NON_BARBELL_KEYWORDS.some(kw => rawLower.includes(kw))) {
    return false;
  }

  if (rawLower && BARBELL_KEYWORDS.some(kw => rawLower.includes(kw))) {
    return true;
  }

  return ALWAYS_PLATE_ONLY.has(normalizedName) || FORMAT_DEPENDENT_BAR_WEIGHT.has(normalizedName);
}

/**
 * Determines if bar weight should be added, considering the set format.
 * - ALWAYS_PLATE_ONLY exercises: always add bar weight
 * - FORMAT_DEPENDENT_BAR_WEIGHT exercises: only add if x2 per-side format was detected
 * - Others: check raw name keywords
 */
export function shouldAddBarWeight(
  normalizedName: string,
  rawName: string,
  hasPlatePerSideFormat: boolean
): boolean {
  const rawLower = rawName.toLowerCase();

  // Non-barbell keywords override everything
  if (NON_BARBELL_KEYWORDS.some(kw => rawLower.includes(kw))) {
    return false;
  }

  // Explicit barbell keyword → always add (user clearly uses barbell)
  // But for FORMAT_DEPENDENT_BAR_WEIGHT, only if plate format detected
  if (BARBELL_KEYWORDS.some(kw => rawLower.includes(kw))) {
    if (FORMAT_DEPENDENT_BAR_WEIGHT.has(normalizedName)) {
      return hasPlatePerSideFormat;
    }
    return true;
  }

  // ALWAYS_PLATE_ONLY: always add bar weight regardless of format
  if (ALWAYS_PLATE_ONLY.has(normalizedName)) {
    return true;
  }

  // FORMAT_DEPENDENT_BAR_WEIGHT: only add bar weight when x2 format detected
  if (FORMAT_DEPENDENT_BAR_WEIGHT.has(normalizedName)) {
    return hasPlatePerSideFormat;
  }

  return false;
}

export function addBarWeight(weight: number, normalizedName: string, rawName?: string): number {
  if (weight <= 0) return weight;
  if (usesBarbell(normalizedName, rawName)) return weight + BAR_WEIGHT;
  return weight;
}

export { BAR_WEIGHT };
