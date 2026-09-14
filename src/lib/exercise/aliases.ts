import { fixKnownTypos } from './barbell';

// Maps common variations to canonical exercise names
const EXERCISE_ALIASES: Record<string, string> = {
  // Chest
  'bench': 'Bench Press',
  'bench press': 'Bench Press',
  'flat bench': 'Bench Press',
  'flat bench press': 'Bench Press',
  'barbell bench press': 'Barbell Bench Press',
  'dumbbell bench': 'Dumbbell Bench Press',
  'dumbbell bench press': 'Dumbbell Bench Press',
  'db bench': 'Dumbbell Bench Press',
  'db bench press': 'Dumbbell Bench Press',
  'bench press with dumbbells': 'Dumbbell Bench Press',
  'incline bench': 'Incline Bench Press',
  'incline bench press': 'Incline Bench Press',
  'incline dumbbell bench': 'Incline Dumbbell Bench Press',
  'incline dumbbell press': 'Incline Dumbbell Bench Press',
  'decline bench': 'Decline Bench Press',
  'chest press': 'Chest Press',
  'machine chest press': 'Machine Chest Press',
  'chest fly': 'Chest Fly',
  'chest flye': 'Chest Fly',
  'dumbbell fly': 'Dumbbell Chest Fly',
  'cable fly': 'Cable Chest Fly',
  'pec deck': 'Pec Deck',

  // Back
  'lat pulldown': 'Lat Pulldown',
  'lat pull down': 'Lat Pulldown',
  'pulldown': 'Lat Pulldown',
  'pull down': 'Lat Pulldown',
  'pull up': 'Pull Up',
  'pullup': 'Pull Up',
  'pull-up': 'Pull Up',
  'chin up': 'Chin Up',
  'chinup': 'Chin Up',
  'chin-up': 'Chin Up',
  'row': 'Row',
  'barbell row': 'Barbell Row',
  'bent over row': 'Barbell Row',
  'dumbbell row': 'Dumbbell Row',
  'db row': 'Dumbbell Row',
  'single arm row': 'Single Arm Dumbbell Row',
  'one arm row': 'Single Arm Dumbbell Row',
  'cable row': 'Cable Row',
  'seated row': 'Seated Cable Row',
  'seated cable row': 'Seated Cable Row',
  't bar row': 'T-Bar Row',
  't-bar row': 'T-Bar Row',
  'shrug': 'Shrugs',
  'shrugs': 'Shrugs',
  'dumbbell shrug': 'Dumbbell Shrugs',

  // Shoulders
  'shoulder press': 'Shoulder Press',
  'overhead press': 'Overhead Press',
  'ohp': 'Overhead Press',
  'military press': 'Military Press',
  'dumbbell shoulder press': 'Dumbbell Shoulder Press',
  'db shoulder press': 'Dumbbell Shoulder Press',
  'lateral raise': 'Lateral Raise',
  'side raise': 'Lateral Raise',
  'side lateral': 'Lateral Raise',
  'front raise': 'Front Raise',
  'rear delt fly': 'Rear Delt Fly',
  'reverse fly': 'Rear Delt Fly',
  'face pull': 'Face Pull',

  // Arms
  'bicep curl': 'Bicep Curl',
  'biceps curl': 'Bicep Curl',
  'curl': 'Bicep Curl',
  'dumbbell curl': 'Dumbbell Bicep Curl',
  'db curl': 'Dumbbell Bicep Curl',
  'barbell curl': 'Barbell Bicep Curl',
  'hammer curl': 'Hammer Curl',
  'preacher curl': 'Preacher Curl',
  'concentration curl': 'Concentration Curl',
  'tricep': 'Tricep Extension',
  'tricep extension': 'Tricep Extension',
  'triceps extension': 'Tricep Extension',
  'tricep pushdown': 'Tricep Pushdown',
  'triceps pushdown': 'Tricep Pushdown',
  'cable pushdown': 'Tricep Pushdown',
  'skull crusher': 'Skull Crusher',
  'skullcrusher': 'Skull Crusher',
  'close grip bench': 'Close Grip Bench Press',
  'dip': 'Dips',
  'dips': 'Dips',
  'tricep dip': 'Tricep Dips',

  // Legs
  'squat': 'Squat',
  'back squat': 'Back Squat',
  'front squat': 'Front Squat',
  'goblet squat': 'Goblet Squat',
  'hack squat': 'Hack Squat',
  'smith squat': 'Smith Machine Squat',
  'smith machine squat': 'Smith Machine Squat',
  'leg press': 'Leg Press',
  'lunge': 'Lunges',
  'lunges': 'Lunges',
  'walking lunge': 'Walking Lunges',
  'split squat': 'Split Squat',
  'bulgarian split squat': 'Bulgarian Split Squat',
  'leg extension': 'Leg Extension',
  'leg curl': 'Leg Curl',
  'hamstring curl': 'Leg Curl',
  'lying leg curl': 'Lying Leg Curl',
  'seated leg curl': 'Seated Leg Curl',
  'calf raise': 'Calf Raise',
  'calf raises': 'Calf Raise',
  'standing calf raise': 'Standing Calf Raise',
  'seated calf raise': 'Seated Calf Raise',
  'deadlift': 'Deadlift',
  'conventional deadlift': 'Conventional Deadlift',
  'sumo deadlift': 'Sumo Deadlift',
  'romanian deadlift': 'Romanian Deadlift',
  'rdl': 'Romanian Deadlift',
  'stiff leg deadlift': 'Stiff Leg Deadlift',
  'hip thrust': 'Hip Thrust',
  'glute bridge': 'Glute Bridge',

  // Core
  'plank': 'Plank',
  'side plank': 'Side Plank',
  'crunch': 'Crunches',
  'crunches': 'Crunches',
  'sit up': 'Sit Ups',
  'situp': 'Sit Ups',
  'sit-up': 'Sit Ups',
  'leg raise': 'Leg Raises',
  'leg raises': 'Leg Raises',
  'hanging leg raise': 'Hanging Leg Raises',
  'russian twist': 'Russian Twist',
  'ab wheel': 'Ab Wheel Rollout',
  'cable crunch': 'Cable Crunch',
};

// Substring matches must prefer the MOST SPECIFIC alias, not the first one declared.
// (Object.entries() iterates in insertion order, and several short/generic keys like
// 'squat', 'row', 'bench' are declared early — without sorting, they'd shadow every
// longer, more specific alias that also happens to contain them as a substring, e.g.
// "hack squat" or "dumbbell bench press" would incorrectly resolve to the generic
// 'squat'/'bench' alias instead of their own more specific entry.)
const SORTED_ALIASES: [string, string][] = Object.entries(EXERCISE_ALIASES).sort(
  (a, b) => b[0].length - a[0].length
);

function resolveBaseCanonicalName(lowerName: string, exerciseName: string): string {
  // Check exact match first
  if (EXERCISE_ALIASES[lowerName]) {
    return EXERCISE_ALIASES[lowerName];
  }

  // Check if any alias is contained in the name — longest (most specific) match wins.
  for (const [alias, canonical] of SORTED_ALIASES) {
    if (lowerName.includes(alias)) {
      return canonical;
    }
  }

  // Capitalize each word if no match found
  return exerciseName
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// The alias table only spells out "Dumbbell X" for a handful of movements (bench, curl,
// row, shrug, shoulder press). Data shows the same gap for many others — "Dumbbell squats",
// "Squats with dumbbells", "Dumbbell lunge", "Dumbbell lateral raise", "Dumbell calf
// raises", etc. all resolve to the bare movement name (Squat, Lunges, Lateral Raise, Calf
// Raise) via the generic substring match above, silently dropping the equipment. That's not
// just cosmetic: every downstream consumer that groups history by normalizedName (weight
// charts, PR checks, targets) ends up comparing dumbbell numbers against barbell/machine
// numbers for the "same" exercise. Rather than hand-enumerating every movement, detect the
// dumbbell qualifier generically and prepend it whenever the resolved name doesn't already
// carry it.
const DUMBBELL_KEYWORDS = ['dumbbell', 'dumbell', 'db '];

export function getCanonicalName(exerciseName: string): string {
  // Fixes a confirmed real typo ("Backbell rows" -> "barbell rows") before alias matching,
  // same correction barbell.ts applies for its own bar-weight keyword check — see
  // fixKnownTypos there for why. Applied here too (including to the capitalize-fallback
  // input) so the exercise identity itself, not just the weight, reflects what was meant.
  const corrected = fixKnownTypos(exerciseName);
  const lowerName = corrected.toLowerCase().trim();
  const base = resolveBaseCanonicalName(lowerName, corrected);

  if (!base.toLowerCase().includes('dumbbell') && DUMBBELL_KEYWORDS.some(kw => lowerName.includes(kw))) {
    return `Dumbbell ${base}`;
  }

  return base;
}
