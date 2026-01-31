export type ExerciseCategory =
  | 'Upper Body'
  | 'Lower Body'
  | 'Back'
  | 'Core'
  | 'Cardio'
  | 'Other';

export interface ExerciseSet {
  reps: number;
  weight: number; // in lbs, normalized
}

export interface Exercise {
  rawName: string;
  normalizedName: string;
  category: ExerciseCategory;
  sets: ExerciseSet[];
}
