import { DailyHealth } from '@/types';
import { getCached, setCached, deleteCached } from '@/lib/cache/store';

/**
 * Durable health-data store, shared by `/api/health` (webhook receiver +
 * client reads) and any server-side reader (e.g. a Server Component that
 * wants today's/this-week's health numbers without an HTTP round-trip).
 *
 * Backed by the same file-store cache (`src/lib/cache/store.ts`) as the rest
 * of the app: memory-layer fast, disk-durable, independent of Redis.
 */

export const HEALTH_STORE_KEY = 'health:data';

export interface StoredHealthData {
  data: DailyHealth[]; // newest-first
  lastUpdated: string | null;
}

/** Reads the durable store directly (memory → disk). Safe to call from a Server Component. */
export async function getHealthData(): Promise<StoredHealthData> {
  try {
    const stored = await getCached<StoredHealthData>(HEALTH_STORE_KEY);
    if (stored) {
      return { data: stored.data || [], lastUpdated: stored.lastUpdated || null };
    }
  } catch (err) {
    console.error('Failed to load health data from store:', err);
  }
  return { data: [], lastUpdated: null };
}

export async function saveHealthData(data: DailyHealth[], lastUpdated: string): Promise<void> {
  try {
    await setCached<StoredHealthData>(HEALTH_STORE_KEY, { data, lastUpdated });
  } catch (err) {
    console.error('Failed to save health data to store:', err);
  }
}

export async function clearHealthData(): Promise<void> {
  await deleteCached(HEALTH_STORE_KEY);
}
