export interface HealthMetric {
  date: string;
  value: number;
  unit: string;
}

export interface DailyHealth {
  date: string;
  steps?: number;
  activeCalories?: number;
  restingHeartRate?: number;
  heartRateVariability?: number;
  sleepHours?: number;
  weight?: number;
  walkingDistance?: number; // in miles
  flightsClimbed?: number;
  exerciseMinutes?: number;
  standHours?: number;
}

export interface HealthData {
  lastUpdated: string;
  dailyData: DailyHealth[];
}

// Health Auto Export app format
export interface HealthAutoExportPayload {
  data: {
    metrics: Array<{
      name: string;
      units: string;
      data: Array<{
        date: string;
        qty?: number;
        value?: number;
        Avg?: number;
        Min?: number;
        Max?: number;
      }>;
    }>;
  };
}
