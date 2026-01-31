import { Exercise } from './exercise';

export interface Workout {
  id: string;
  date: Date;
  exercises: Exercise[];
}

export interface WorkoutData {
  workouts: Workout[];
  lastFetched: Date;
}
