import { NextResponse } from 'next/server';
import { DailyHealth, HealthAutoExportPayload } from '@/types';

// In production, you'd want to use Vercel KV, Blob, or a database
// For now, we'll store in memory (resets on redeploy) and also return to client
let healthDataStore: DailyHealth[] = [];
let lastUpdated: string | null = null;

const WEBHOOK_SECRET = process.env.HEALTH_WEBHOOK_SECRET;

// Metric name mappings from Health Auto Export
const METRIC_MAPPINGS: Record<string, keyof DailyHealth> = {
  'step_count': 'steps',
  'steps': 'steps',
  'active_energy': 'activeCalories',
  'active_calories': 'activeCalories',
  'resting_heart_rate': 'restingHeartRate',
  'heart_rate_variability_sdnn': 'heartRateVariability',
  'hrv': 'heartRateVariability',
  'sleep_analysis': 'sleepHours',
  'sleep': 'sleepHours',
  'weight': 'weight',
  'body_mass': 'weight',
  'walking_running_distance': 'walkingDistance',
  'distance_walking_running': 'walkingDistance',
  'flights_climbed': 'flightsClimbed',
  'apple_exercise_time': 'exerciseMinutes',
  'exercise_time': 'exerciseMinutes',
  'apple_stand_hour': 'standHours',
  'stand_hours': 'standHours',
};

function normalizeMetricName(name: string): keyof DailyHealth | null {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return METRIC_MAPPINGS[normalized] || null;
}

function processHealthExportData(payload: HealthAutoExportPayload): DailyHealth[] {
  const dailyMap = new Map<string, DailyHealth>();

  if (!payload.data?.metrics) {
    return [];
  }

  for (const metric of payload.data.metrics) {
    const metricKey = normalizeMetricName(metric.name);
    if (!metricKey) continue;

    for (const dataPoint of metric.data || []) {
      const date = dataPoint.date?.split('T')[0] || dataPoint.date;
      if (!date) continue;

      if (!dailyMap.has(date)) {
        dailyMap.set(date, { date });
      }

      const daily = dailyMap.get(date)!;
      const value = dataPoint.qty ?? dataPoint.value ?? dataPoint.Avg ?? 0;

      // Convert units if needed
      if (metricKey === 'walkingDistance') {
        // Assume meters, convert to miles
        daily[metricKey] = value * 0.000621371;
      } else if (metricKey === 'sleepHours') {
        // Assume minutes, convert to hours
        daily[metricKey] = value / 60;
      } else {
        (daily as unknown as Record<string, number | string>)[metricKey] = value;
      }
    }
  }

  return Array.from(dailyMap.values()).sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

// GET - Retrieve stored health data
export async function GET() {
  return NextResponse.json({
    success: true,
    lastUpdated,
    data: healthDataStore,
  });
}

// POST - Receive health data from Health Auto Export app
export async function POST(request: Request) {
  try {
    // Optional: Verify webhook secret
    const authHeader = request.headers.get('authorization');
    if (WEBHOOK_SECRET && authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
      // Still allow if no secret is set (for easier setup)
      if (WEBHOOK_SECRET) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const payload = await request.json();

    // Process the data
    const processedData = processHealthExportData(payload);

    if (processedData.length > 0) {
      // Merge with existing data (keep last 90 days)
      const existingDates = new Set(healthDataStore.map(d => d.date));
      const newData = processedData.filter(d => !existingDates.has(d.date));

      healthDataStore = [...newData, ...healthDataStore]
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 90);

      lastUpdated = new Date().toISOString();
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${processedData.length} days of health data`,
      lastUpdated,
    });
  } catch (error) {
    console.error('Health data error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process health data' },
      { status: 500 }
    );
  }
}
