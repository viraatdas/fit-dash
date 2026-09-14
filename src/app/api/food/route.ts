import { NextResponse } from 'next/server';
import {
  getCachedFood,
  requestFoodRefresh,
  isFoodRefreshing,
  getLastFoodError,
  ensureFoodFreshEnough,
} from '@/lib/cache/food-cache';

export const maxDuration = 120;

// Bounded wait only for a true cold start (no durable copy anywhere yet).
const COLD_START_MAX_WAIT_MS = 25_000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get('refresh') === '1';

  let cached = await getCachedFood();

  if (!cached) {
    await ensureFoodFreshEnough(COLD_START_MAX_WAIT_MS);
    cached = await getCachedFood();
  } else {
    // Durable copy exists — return it immediately; `?refresh=1` kicks a
    // background refresh instead of blocking on one.
    requestFoodRefresh({ force: forceRefresh });
  }

  if (cached) {
    const response = NextResponse.json({
      success: true,
      data: cached.data,
      meta: {
        updatedAt: new Date(cached.fetchedAt).toISOString(),
        stale: isFoodRefreshing(),
        refreshing: isFoodRefreshing(),
      },
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  const lastError = getLastFoodError();
  return NextResponse.json(
    {
      success: false,
      error: lastError?.message || 'Building the food cache for the first time — check back shortly.',
      retrying: true,
    },
    { status: 202 },
  );
}
