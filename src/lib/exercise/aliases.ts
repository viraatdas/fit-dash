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

export function getCanonicalName(exerciseName: string): string {
  const lowerName = exerciseName.toLowerCase().trim();

  // Check exact match first
  if (EXERCISE_ALIASES[lowerName]) {
    return EXERCISE_ALIASES[lowerName];
  }

  // Check if any alias is contained in the name
  for (const [alias, canonical] of Object.entries(EXERCISE_ALIASES)) {
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
