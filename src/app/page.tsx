import Dashboard from '@/components/dashboard/Dashboard';
import { getCachedWorkouts, requestBackgroundRefresh } from '@/lib/cache/notion-cache';
import { getHealthData } from '@/lib/health/data-store';

// Always render fresh from the server-side cache (memory/disk) — this page
// never awaits Notion/Gemini/Redis, so it's always fast even when those are
// down or cold. Freshness comes from the background refresh kicked off
// below, plus the client's own revalidation.
export const dynamic = 'force-dynamic';

export default async function Home() {
  const [cached, health] = await Promise.all([
    getCachedWorkouts(),
    // Same durable store /api/health reads from — lets the recovery hero +
    // this-week strip render in the initial HTML with no pop-in.
    getHealthData(),
  ]);

  // Non-blocking: single-flight + throttled + 429-aware inside the cache
  // module, so this never delays the response.
  requestBackgroundRefresh();

  return (
    <Dashboard
      initialWorkouts={cached?.workouts ?? null}
      initialMeta={
        cached ? { updatedAt: new Date(cached.parsedAt).toISOString(), pageLastEdited: cached.pageLastEdited } : null
      }
      initialHealthData={health.data}
    />
  );
}
