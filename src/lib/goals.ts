/**
 * Body composition goals used across charts and insights.
 * Goal: reduce belly fat while progressively increasing weights (recomp).
 */

export const BODY_GOAL = {
  name: 'Recomp',
  description: 'Reduce belly fat, progressive overload',

  // Body composition targets
  targetBodyFatPercentage: 12,          // athletic lean range for a 25yo male
  targetWeightRange: { min: 160, max: 170 }, // stay-in-band during recomp
  targetMuscleGainLbsPerMonth: 0.5,     // realistic trained-lifter recomp rate
  targetVisceralFatArea: 35,            // cm² — comfortably under the 100 threshold

  // Strength targets
  targetStrengthGainPctPerMonth: 2.5,   // avg 1RM growth for intermediate lifter

  // Nutrition targets (g/lb of bodyweight)
  proteinGramsPerLbBodyweight: 1.0,     // classic recomp protein target
  fiberGramsPerDay: 30,

  // Calorie strategy — slight deficit on the back of training volume
  calorieDeficitVsMaintenance: 150,     // kcal/day below TDEE (TDEE ≈ BMR × 1.55)
  tdeeActivityMultiplier: 1.55,         // moderately active (3-5 lifts/week)
} as const;

export function targetProteinGrams(weightLbs: number): number {
  return Math.round(weightLbs * BODY_GOAL.proteinGramsPerLbBodyweight);
}

export function targetDailyCalories(bmr: number): number {
  const tdee = Math.round(bmr * BODY_GOAL.tdeeActivityMultiplier);
  return tdee - BODY_GOAL.calorieDeficitVsMaintenance;
}

export function projectMuscleTarget(startLbs: number, monthsAhead: number): number {
  return +(startLbs + BODY_GOAL.targetMuscleGainLbsPerMonth * monthsAhead).toFixed(1);
}

export function projectStrengthTarget(startLbs: number, monthsAhead: number): number {
  return Math.round(startLbs * Math.pow(1 + BODY_GOAL.targetStrengthGainPctPerMonth / 100, monthsAhead));
}
