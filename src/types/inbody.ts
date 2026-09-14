export interface InBodyEntry {
  id: string;
  date: Date; // for a DEXA reading with an unknown date, this is a placeholder used only for chart ordering — see `dateUnknown`
  bodyFatPercentage: number;
  // Weight and muscle mass are only measured by InBody's bioimpedance scan.
  // A DEXA reading may report body fat % alone, so these are optional —
  // never invent a value for a source that didn't measure it.
  weight?: number; // lbs
  muscleMass?: number; // skeletal muscle mass in lbs
  bodyFatMass?: number; // lbs
  bmi?: number;
  visceralFat?: number; // Visceral Fat Level (InBody's 1-20 scale)
  visceralFatArea?: number; // cm²
  trunkFatMass?: number; // lbs — segmental fat at the trunk (belly fat proxy)
  legLeanMass?: number; // lbs
  ecwRatio?: number;
  basalMetabolicRate?: number;
  source?: 'inbody' | 'dexa'; // measurement method; undefined/missing means 'inbody' (legacy entries)
  dateUnknown?: boolean; // true when `date` is a placeholder, not the real measurement date — display it as "date unknown" instead
}

export interface InBodyData {
  entries: InBodyEntry[];
}
