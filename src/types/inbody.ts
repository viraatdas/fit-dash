export interface InBodyEntry {
  id: string;
  date: Date;
  weight: number; // lbs
  bodyFatPercentage: number;
  muscleMass: number; // skeletal muscle mass in lbs
  bodyFatMass?: number; // lbs
  bmi?: number;
  visceralFat?: number; // Visceral Fat Level (InBody's 1-20 scale)
  visceralFatArea?: number; // cm²
  trunkFatMass?: number; // lbs — segmental fat at the trunk (belly fat proxy)
  legLeanMass?: number; // lbs
  ecwRatio?: number;
  basalMetabolicRate?: number;
}

export interface InBodyData {
  entries: InBodyEntry[];
}
