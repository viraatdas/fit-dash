const BAR_WEIGHT = 45; // Standard Olympic barbell in lbs

// Exercises where the user ALWAYS logs plate weight only (never included bar)
const ALWAYS_PLATE_ONLY = new Set([
  'Bench Press',
  'Barbell Bench Press',
  'Incline Bench Press',
  'Decline Bench Press',
  'Close Grip Bench Press',
  'Chest Press',
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

// Exercises where the user USED to include bar weight but recently switched to plate-only.
// For these, only add bar weight when the x2 per-side format is detected.
const RECENTLY_SWITCHED = new Set([
  'Calf Raise',
  'Standing Calf Raise',
]);

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

  return ALWAYS_PLATE_ONLY.has(normalizedName) || RECENTLY_SWITCHED.has(normalizedName);
}

/**
 * Determines if bar weight should be added, considering the set format.
 * - ALWAYS_PLATE_ONLY exercises: always add bar weight
 * - RECENTLY_SWITCHED exercises: only add if x2 per-side format was detected
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
  // But for RECENTLY_SWITCHED, only if plate format detected
  if (BARBELL_KEYWORDS.some(kw => rawLower.includes(kw))) {
    if (RECENTLY_SWITCHED.has(normalizedName)) {
      return hasPlatePerSideFormat;
    }
    return true;
  }

  // ALWAYS_PLATE_ONLY: always add bar weight regardless of format
  if (ALWAYS_PLATE_ONLY.has(normalizedName)) {
    return true;
  }

  // RECENTLY_SWITCHED: only add bar weight when x2 format detected
  if (RECENTLY_SWITCHED.has(normalizedName)) {
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
