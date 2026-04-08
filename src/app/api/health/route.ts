import { NextResponse } from 'next/server';
import { DailyHealth, HealthAutoExportPayload } from '@/types';
import { getRedis } from '@/lib/redis';

const REDIS_KEY = 'health-data';

// Cache for in-memory access
let healthDataCache: DailyHealth[] | null = null;
let lastUpdatedCache: string | null = null;

async function loadFromStore(): Promise<{ data: DailyHealth[]; lastUpdated: string | null }> {
  const redis = getRedis();
  if (redis) {
    try {
      const stored = await redis.get<{ data: DailyHealth[]; lastUpdated: string }>(REDIS_KEY);
      if (stored) {
        return { data: stored.data || [], lastUpdated: stored.lastUpdated || null };
      }
    } catch (err) {
      console.error('Failed to load from Redis:', err);
    }
  }
  return { data: [], lastUpdated: null };
}

async function saveToStore(data: DailyHealth[], lastUpdated: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(REDIS_KEY, { data, lastUpdated });
    } catch (err) {
      console.error('Failed to save to Redis:', err);
    }
  }
}

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

// Extract hour from datetime string like "2026-01-30 14:32:00 -0800"
function extractHour(dateStr: string): number | null {
  // Match HH:MM:SS pattern
  const match = dateStr.match(/(\d{2}):(\d{2}):\d{2}/);
  if (match) return parseInt(match[1]);

  // Match ISO format
  if (dateStr.includes('T')) {
    const timePart = dateStr.split('T')[1];
    if (timePart) return parseInt(timePart.substring(0, 2));
  }

  return null;
}

function processHealthExportData(payload: unknown): DailyHealth[] {
  const dailyMap = new Map<string, DailyHealth & {
    _counts: Record<string, number>;
    _hourlyHR: Map<number, { sum: number; count: number }>;
  }>();

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

  // Process flat array of per-sample data
  for (const entry of dataArray) {
    const dateStr = entry.date as string;
    const date = extractDate(dateStr);
    if (!date) continue;

    if (!dailyMap.has(date)) {
      dailyMap.set(date, { date, _counts: {}, _hourlyHR: new Map() });
    }

    const daily = dailyMap.get(date)!;

    // Process each field
    for (const [key, value] of Object.entries(entry)) {
      if (key === 'date') continue;

      // Handle pre-built hourlyHeartRate array
      if (key === 'hourlyHeartRate' && Array.isArray(value)) {
        daily.hourlyHeartRate = value;
        continue;
      }

      if (typeof value !== 'number') continue;

      const metricKey = normalizeMetricName(key) || key as keyof DailyHealth;
      if (metricKey === 'date') continue;

      // Special handling for heart_rate - aggregate into hourly buckets
      if (key === 'heart_rate' || key === 'heartRate') {
        const hour = extractHour(dateStr);
        if (hour !== null) {
          const hourData = daily._hourlyHR.get(hour) || { sum: 0, count: 0 };
          hourData.sum += value;
          hourData.count += 1;
          daily._hourlyHR.set(hour, hourData);
        }
        continue;
      }

      const currentValue = (daily as unknown as Record<string, number>)[metricKey] || 0;

      if (SUM_FIELDS.includes(metricKey)) {
        // Sum these fields
        (daily as unknown as Record<string, number>)[metricKey] = currentValue + value;
      } else {
        // Average these fields
        daily._counts[metricKey] = (daily._counts[metricKey] || 0) + 1;
        (daily as unknown as Record<string, number>)[metricKey] = currentValue + value;
      }
    }
  }

  // Finalize averages, build hourly HR, and clean up
  const results: DailyHealth[] = [];
  dailyMap.forEach((daily) => {
    const { _counts, _hourlyHR, ...data } = daily;

    // Calculate averages for non-sum fields
    Object.entries(_counts).forEach(([key, count]) => {
      if (!SUM_FIELDS.includes(key) && count > 1) {
        (data as unknown as Record<string, number>)[key] =
          Math.round((data as unknown as Record<string, number>)[key] / count);
      }
    });

    // Build hourlyHeartRate array from collected samples
    if (_hourlyHR.size > 0 && !data.hourlyHeartRate) {
      data.hourlyHeartRate = Array.from(_hourlyHR.entries())
        .map(([hour, { sum, count }]) => ({
          hour,
          heartRate: Math.round(sum / count),
          readings: count,
        }))
        .sort((a, b) => a.hour - b.hour);
    }

    // Round values
    if (data.steps) data.steps = Math.round(data.steps);
    if (data.activeCalories) data.activeCalories = Math.round(data.activeCalories);
    if (data.walkingDistance) data.walkingDistance = Math.round(data.walkingDistance * 100) / 100;

    results.push(data);
  });

  return results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// Handle the original metrics format (from file export)
function processMetricsFormat(payload: HealthAutoExportPayload): DailyHealth[] {
  const dailyMap = new Map<string, DailyHealth & { _counts: Record<string, number> }>();

  if (!payload.data?.metrics) {
    return [];
  }

  for (const metric of payload.data.metrics) {
    const metricKey = normalizeMetricName(metric.name);
    if (!metricKey) continue;

    for (const dataPoint of metric.data || []) {
      const date = extractDate(dataPoint.date);
      if (!date) continue;

      if (!dailyMap.has(date)) {
        dailyMap.set(date, { date, _counts: {} });
      }

      const daily = dailyMap.get(date)!;
      let value = dataPoint.qty ?? dataPoint.value ?? dataPoint.Avg ?? 0;

      // Convert units
      if (metricKey === 'walkingDistance') {
        value = value * 0.000621371; // meters to miles
      } else if (metricKey === 'sleepHours') {
        value = value / 60; // minutes to hours
      }

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
    if (data.flightsClimbed) data.flightsClimbed = Math.round(data.flightsClimbed);

    results.push(data);
  });

  return results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// DELETE - Clear all health data (to fix corrupted data)
export async function DELETE(request: Request) {
  // Optional: Verify webhook secret
  const authHeader = request.headers.get('authorization');
  if (WEBHOOK_SECRET && authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(REDIS_KEY);
      healthDataCache = [];
      lastUpdatedCache = null;
      return NextResponse.json({ success: true, message: 'Health data cleared' });
    } catch (err) {
      console.error('Failed to clear Redis:', err);
      return NextResponse.json({ error: 'Failed to clear data' }, { status: 500 });
    }
  }

  healthDataCache = [];
  lastUpdatedCache = null;
  return NextResponse.json({ success: true, message: 'Health data cleared (in-memory only)' });
}

// GET - Retrieve stored health data (add ?debug=1 to see last payload format)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const debug = url.searchParams.get('debug');

  // Return debug info about last received payload
  if (debug === '1') {
    return NextResponse.json({
      success: true,
      lastPayload: lastPayloadDebug,
      message: 'This shows the format of the last received payload from Health Auto Export',
    });
  }

  // Load from blob if cache is empty
  if (healthDataCache === null) {
    const loaded = await loadFromStore();
    healthDataCache = loaded.data;
    lastUpdatedCache = loaded.lastUpdated;
  }

  const response = NextResponse.json({
    success: true,
    lastUpdated: lastUpdatedCache,
    data: healthDataCache,
  });
  response.headers.set('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  return response;
}

// GET debug info about last received payload
let lastPayloadDebug: { timestamp: string; format: string; sampleKeys: string[]; sampleData: unknown; totalItems: number } | null = null;

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

    // Debug: Capture payload format info
    let format = 'unknown';
    let sampleKeys: string[] = [];
    let sampleData: unknown = null;
    let totalItems = 0;

    if (Array.isArray(payload)) {
      format = 'array';
      totalItems = payload.length;
      if (payload[0]) {
        sampleKeys = Object.keys(payload[0]);
        sampleData = payload[0];
      }
    } else if (payload && typeof payload === 'object') {
      const p = payload as Record<string, unknown>;
      if (Array.isArray(p.data)) {
        format = 'object_with_data_array';
        totalItems = p.data.length;
        if (p.data[0]) {
          sampleKeys = Object.keys(p.data[0] as object);
          sampleData = p.data[0];
        }
      } else if (p.data && typeof p.data === 'object' && Array.isArray((p.data as Record<string, unknown>).metrics)) {
        format = 'metrics_format';
        const metrics = (p.data as Record<string, unknown>).metrics as Array<{ name: string }>;
        sampleKeys = metrics.map(m => m.name);
        totalItems = metrics.length;
      } else {
        format = 'object_other';
        sampleKeys = Object.keys(p);
        sampleData = p;
      }
    }

    lastPayloadDebug = {
      timestamp: new Date().toISOString(),
      format,
      sampleKeys,
      sampleData,
      totalItems,
    };
    console.log('Health API received:', JSON.stringify(lastPayloadDebug));

    // Process the data
    const processedData = processHealthExportData(payload);

    if (processedData.length > 0) {
      // Load existing data from blob if cache is empty
      if (healthDataCache === null) {
        const loaded = await loadFromStore();
        healthDataCache = loaded.data;
        lastUpdatedCache = loaded.lastUpdated;
      }

      // Merge with existing data - update existing dates or add new ones
      const dataMap = new Map<string, DailyHealth>();

      // Add existing data
      for (const d of healthDataCache) {
        const date = extractDate(d.date) || d.date;
        dataMap.set(date, { ...d, date });
      }

      // Merge new data - REPLACE values for same date (don't accumulate)
      // Health Auto Export sends full daily totals, not incremental data
      for (const d of processedData) {
        const existing = dataMap.get(d.date);
        if (existing) {
          // Merge: keep existing values, but replace with new non-zero values
          const merged: DailyHealth = { ...existing };
          for (const [key, value] of Object.entries(d)) {
            if (key === 'date' || value === undefined) continue;

            // Handle hourlyHeartRate array - replace with new data
            if (key === 'hourlyHeartRate' && Array.isArray(value)) {
              merged.hourlyHeartRate = value;
              continue;
            }

            // Skip zero values (means no data, keep existing)
            if (value === 0) continue;

            // Replace with new value (don't accumulate)
            (merged as unknown as Record<string, number>)[key] = value as number;
          }
          dataMap.set(d.date, merged);
        } else {
          dataMap.set(d.date, d);
        }
      }

      healthDataCache = Array.from(dataMap.values())
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 90);

      lastUpdatedCache = new Date().toISOString();

      // Persist to blob
      await saveToStore(healthDataCache, lastUpdatedCache);
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${processedData.length} days of health data`,
      lastUpdated: lastUpdatedCache,
    });
  } catch (error) {
    console.error('Health data error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process health data' },
      { status: 500 }
    );
  }
}
