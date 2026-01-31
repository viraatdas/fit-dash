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

// Extract date (YYYY-MM-DD) from various formats
function extractDate(dateStr: string): string | null {
  if (!dateStr) return null;

  // Handle "2026-01-31 01:52:00 -0800" format
  const match = dateStr.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];

  // Handle ISO format "2026-01-31T01:52:00"
  if (dateStr.includes('T')) return dateStr.split('T')[0];

  return dateStr;
}

// Fields that should be summed vs averaged vs max
const SUM_FIELDS = ['steps', 'activeCalories', 'walkingDistance', 'flightsClimbed', 'exerciseMinutes', 'standHours'];

function processHealthExportData(payload: unknown): DailyHealth[] {
  const dailyMap = new Map<string, DailyHealth & { _counts: Record<string, number> }>();

  // Handle both formats: { data: { metrics: [...] } } or direct array
  let dataArray: Record<string, unknown>[] = [];

  if (Array.isArray(payload)) {
    dataArray = payload;
  } else if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    if (Array.isArray(p.data)) {
      dataArray = p.data;
    } else if (p.data && typeof p.data === 'object' && Array.isArray((p.data as Record<string, unknown>).metrics)) {
      // Original format with metrics array - handle separately
      return processMetricsFormat(p as unknown as HealthAutoExportPayload);
    }
  }

  // Process flat array of per-minute data
  for (const entry of dataArray) {
    const dateStr = entry.date as string;
    const date = extractDate(dateStr);
    if (!date) continue;

    if (!dailyMap.has(date)) {
      dailyMap.set(date, { date, _counts: {} });
    }

    const daily = dailyMap.get(date)!;

    // Process each field
    for (const [key, value] of Object.entries(entry)) {
      if (key === 'date' || typeof value !== 'number') continue;

      const metricKey = normalizeMetricName(key) || key as keyof DailyHealth;
      if (metricKey === 'date') continue;

      const currentValue = (daily as unknown as Record<string, number>)[metricKey] || 0;

      if (SUM_FIELDS.includes(metricKey)) {
        // Sum these fields
        (daily as unknown as Record<string, number>)[metricKey] = currentValue + value;
      } else {
        // Average these fields (like heart rate)
        daily._counts[metricKey] = (daily._counts[metricKey] || 0) + 1;
        (daily as unknown as Record<string, number>)[metricKey] = currentValue + value;
      }
    }
  }

  // Finalize averages and clean up
  const results: DailyHealth[] = [];
  dailyMap.forEach((daily) => {
    const { _counts, ...data } = daily;

    // Calculate averages for non-sum fields
    Object.entries(_counts).forEach(([key, count]) => {
      if (!SUM_FIELDS.includes(key) && count > 1) {
        (data as unknown as Record<string, number>)[key] =
          Math.round((data as unknown as Record<string, number>)[key] / count);
      }
    });

    // Round values
    if (data.steps) data.steps = Math.round(data.steps);
    if (data.activeCalories) data.activeCalories = Math.round(data.activeCalories);
    if (data.walkingDistance) data.walkingDistance = Math.round(data.walkingDistance * 100) / 100;

    results.push(data);
  });

  return results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// Handle the original metrics format
function processMetricsFormat(payload: HealthAutoExportPayload): DailyHealth[] {
  const dailyMap = new Map<string, DailyHealth>();

  if (!payload.data?.metrics) {
    return [];
  }

  for (const metric of payload.data.metrics) {
    const metricKey = normalizeMetricName(metric.name);
    if (!metricKey) continue;

    for (const dataPoint of metric.data || []) {
      const date = extractDate(dataPoint.date) || dataPoint.date;
      if (!date) continue;

      if (!dailyMap.has(date)) {
        dailyMap.set(date, { date });
      }

      const daily = dailyMap.get(date)!;
      const value = dataPoint.qty ?? dataPoint.value ?? dataPoint.Avg ?? 0;

      if (metricKey === 'walkingDistance') {
        daily[metricKey] = value * 0.000621371;
      } else if (metricKey === 'sleepHours') {
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
      // Merge with existing data - update existing dates or add new ones
      const dataMap = new Map<string, DailyHealth>();

      // Add existing data
      for (const d of healthDataStore) {
        const date = extractDate(d.date) || d.date;
        dataMap.set(date, { ...d, date });
      }

      // Merge new data (overwrites existing for same date)
      for (const d of processedData) {
        const existing = dataMap.get(d.date);
        if (existing) {
          // Merge fields - new data takes priority for non-zero values
          dataMap.set(d.date, {
            ...existing,
            ...Object.fromEntries(
              Object.entries(d).filter(([, v]) => v !== undefined && v !== 0)
            ),
          });
        } else {
          dataMap.set(d.date, d);
        }
      }

      healthDataStore = Array.from(dataMap.values())
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
