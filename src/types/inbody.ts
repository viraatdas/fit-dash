export interface InBodyEntry {
  id: string;
  date: Date;
  weight: number; // lbs
  bodyFatPercentage: number;
  muscleMass: number; // skeletal muscle mass in lbs
  bodyFatMass?: number; // lbs
  bmi?: number;
  visceralFat?: number;
  legLeanMass?: number; // lbs
  ecwRatio?: number;
  basalMetabolicRate?: number;
}

export interface InBodyData {
  entries: InBodyEntry[];
}
