import { NextResponse } from 'next/server';
import {
  getCachedWorkouts,
  requestBackgroundRefresh,
  isRefreshing,
  getLastRefreshError,
  ensureFreshEnough,
} from '@/lib/cache/notion-cache';

export const maxDuration = 60;

// Only used on a true cold start (no cache anywhere yet) — bounded wait for
// the very first crawl so the request doesn't hang for the full crawl
// duration. The crawl itself keeps running in the background past this.
const COLD_START_MAX_WAIT_MS = 25_000;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get('refresh') === '1';

  let cached = await getCachedWorkouts();

  if (!cached) {
    // No data anywhere (fresh deploy / empty cache dir) — this is the only
    // case where we wait on Notion instead of returning immediately.
    await ensureFreshEnough(COLD_START_MAX_WAIT_MS);
    cached = await getCachedWorkouts();
  } else {
    // Cached data exists — always return it immediately; refresh happens
    // out-of-band (single-flight + throttled + 429-aware inside the cache
    // module), so this never blocks the response.
    requestBackgroundRefresh({ force: forceRefresh });
  }

  if (cached) {
    const response = NextResponse.json({
      success: true,
      workouts: cached.workouts,
      meta: {
        updatedAt: new Date(cached.parsedAt).toISOString(),
        pageLastEdited: cached.pageLastEdited,
        stale: isRefreshing(),
        refreshing: isRefreshing(),
      },
    });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  // Truly nothing to serve yet — surface a clear, non-500 error while the
  // background crawl (kicked off by ensureFreshEnough above) keeps going.
  const lastError = getLastRefreshError();
  const rateLimited = lastError?.rateLimited ?? false;

  return NextResponse.json(
    {
      success: false,
      error: rateLimited
        ? `Notion is rate-limiting us right now (retry in ~${lastError?.retryAfterSeconds ?? 60}s). Building the cache in the background.`
        : 'Building the workout cache for the first time — this can take a bit. Refresh shortly.',
      retrying: true,
    },
    { status: rateLimited ? 429 : 202 }
  );
}
