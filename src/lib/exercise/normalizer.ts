import { ExerciseCategory } from '@/types';
import { categorizeExercise } from './categories';
import { getCanonicalName } from './aliases';

interface NormalizedExercise {
  name: string;
  category: ExerciseCategory;
}

export function normalizeExercise(rawName: string): NormalizedExercise {
  const canonicalName = getCanonicalName(rawName);
  const category = categorizeExercise(canonicalName);

  return {
    name: canonicalName,
    category,
  };
}
