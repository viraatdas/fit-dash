import { ExerciseCategory } from '@/types';

interface CategoryKeywords {
  category: ExerciseCategory;
  keywords: string[];
}

const CATEGORY_MAPPINGS: CategoryKeywords[] = [
  {
    category: 'Upper Body',
    keywords: [
      'chest', 'press', 'bench', 'tricep', 'bicep', 'curl', 'shoulder',
      'deltoid', 'delt', 'fly', 'flye', 'pushup', 'push up', 'push-up',
      'dip', 'overhead', 'incline', 'decline', 'pec', 'arm'
    ],
  },
  {
    category: 'Lower Body',
    keywords: [
      'squat', 'leg', 'lunge', 'calf', 'deadlift', 'hamstring', 'quad',
      'glute', 'hip', 'thigh', 'extension', 'curl', 'press'
    ],
  },
  {
    category: 'Back',
    keywords: [
      'row', 'lat', 'pulldown', 'pull-down', 'pull down', 'pull up',
      'pullup', 'pull-up', 'chin up', 'chinup', 'chin-up', 'back',
      'rear delt', 'rhomboid', 'trap', 'shrug'
    ],
  },
  {
    category: 'Core',
    keywords: [
      'plank', 'crunch', 'ab', 'core', 'oblique', 'sit up', 'situp',
      'sit-up', 'leg raise', 'russian twist', 'woodchop', 'dead bug'
    ],
  },
  {
    category: 'Cardio',
    keywords: [
      'run', 'jog', 'bike', 'cycle', 'swim', 'row', 'cardio', 'treadmill',
      'elliptical', 'stair', 'jump rope', 'burpee', 'hiit', 'sprint'
    ],
  },
];

export function categorizeExercise(exerciseName: string): ExerciseCategory {
  const lowerName = exerciseName.toLowerCase();

  // Check for specific patterns that override general categorization
  // "Leg curl" should be Lower Body, not Back (due to 'curl')
  if (lowerName.includes('leg')) {
    return 'Lower Body';
  }

  // "Row" in cardio context vs back exercise
  if (lowerName.includes('row') && !lowerName.includes('cardio')) {
    return 'Back';
  }

  // Check each category's keywords
  for (const { category, keywords } of CATEGORY_MAPPINGS) {
    for (const keyword of keywords) {
      if (lowerName.includes(keyword)) {
        return category;
      }
    }
  }

  return 'Other';
}
