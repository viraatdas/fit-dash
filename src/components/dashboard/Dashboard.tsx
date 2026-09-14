'use client';

import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent, Button } from '@/components/ui';
import { RecoveryHero } from '@/components/dashboard/RecoveryHero';
import { WeekStrip } from '@/components/dashboard/WeekStrip';
import { SettingsMenu } from '@/components/dashboard/SettingsMenu';
import { Workout, InBodyEntry, DailyHealth } from '@/types';
import { SerializedWorkout } from '@/lib/cache/notion-cache';
import {
  getInBodyData,
  getLatestInBodyEntry,
} from '@/lib/storage';

// Lazy load heavy components — only downloaded when their tab is active
const WorkoutSummary = lazy(() => import('@/components/dashboard/WorkoutSummary').then(m => ({ default: m.WorkoutSummary })));
const Insights = lazy(() => import('@/components/dashboard/Insights').then(m => ({ default: m.Insights })));
const ExerciseAdvice = lazy(() => import('@/components/dashboard/ExerciseAdvice').then(m => ({ default: m.ExerciseAdvice })));
const RecompVerdict = lazy(() => import('@/components/dashboard/RecompVerdict').then(m => ({ default: m.RecompVerdict })));
const StrengthProgressChart = lazy(() => import('@/components/charts/StrengthProgressChart').then(m => ({ default: m.StrengthProgressChart })));
const WeightProgressChart = lazy(() => import('@/components/charts/WeightProgressChart').then(m => ({ default: m.WeightProgressChart })));
const CategorySummary = lazy(() => import('@/components/charts/CategorySummary').then(m => ({ default: m.CategorySummary })));
const HealthChart = lazy(() => import('@/components/charts/HealthChart').then(m => ({ default: m.HealthChart })));

const CACHE_KEY_HEALTH = 'fitdash_health';
const CACHE_TTL = 6 * 60 * 60 * 1000; // Health data session cache
const LS_KEY_WORKOUTS = 'fitdash_workouts_v1';

function getCache<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data as T;
  } catch {
    return null;
  }
}

function setCache(key: string, data: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
  } catch { /* storage full */ }
}

function loadWorkoutsFromLocalStorage(): SerializedWorkout[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY_WORKOUTS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function saveWorkoutsToLocalStorage(workouts: SerializedWorkout[]) {
  try {
    localStorage.setItem(LS_KEY_WORKOUTS, JSON.stringify(workouts));
  } catch { /* storage full or unavailable */ }
}

function parseWorkoutDates(workouts: SerializedWorkout[]): Workout[] {
  return workouts.map(w => ({ ...w, date: new Date(w.date) }));
}

function formatLastSynced(iso: string | null): string {
  if (!iso) return 'never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function TabLoading() {
  return (
    <div className="py-12 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-n-text-disabled">[LOADING...]</p>
    </div>
  );
}

// Polling backoff while a background refresh/build is in progress (cold
// start's 202, a rate-limited 429, or a normal `meta.refreshing`): starts
// fast, backs off, and gives up after a few minutes rather than forever.
const POLL_START_MS = 3000;
const POLL_MAX_MS = 10000;
const POLL_BACKOFF_FACTOR = 1.6;
const POLL_GIVE_UP_MS = 3 * 60 * 1000;

export interface DashboardProps {
  /** Server-rendered snapshot from the durable cache (memory/disk) — never blocks on Notion. */
  initialWorkouts: SerializedWorkout[] | null;
  initialMeta: { updatedAt: string; pageLastEdited: string | null } | null;
  /** Server-rendered snapshot from the health durable store — same key/format as /api/health. Lets the recovery hero + week strip render with no pop-in. */
  initialHealthData: DailyHealth[] | null;
}

export default function Dashboard({ initialWorkouts, initialMeta, initialHealthData }: DashboardProps) {
  const [workouts, setWorkouts] = useState<Workout[]>(() =>
    initialWorkouts ? parseWorkoutDates(initialWorkouts) : []
  );
  const [inBodyEntries, setInBodyEntries] = useState<InBodyEntry[]>([]);
  const [latestInBody, setLatestInBody] = useState<InBodyEntry | null>(null);
  const [healthData, setHealthData] = useState<DailyHealth[]>(() => initialHealthData ?? []);

  // `updating` = a fetch is literally in flight. `polling` = we're in an
  // active poll-until-refreshed cycle (spans the gaps between fetches too),
  // used for the persistent "syncing" indicator.
  const [updating, setUpdating] = useState(false);
  const [polling, setPolling] = useState(false);
  // True only for a cold start with zero data anywhere (a 202 "building"
  // response) — gets its own neutral message, never the red error banner.
  const [building, setBuilding] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(initialMeta?.updatedAt ?? null);
  // Only surfaced as the red banner when there is truly no data to show.
  const [syncError, setSyncError] = useState<string | null>(null);

  const hasHydratedFromLocalStorage = useRef(false);
  const workoutsCountRef = useRef(initialWorkouts?.length ?? 0);
  const lastUpdatedAtRef = useRef<string | null>(initialMeta?.updatedAt ?? null);
  const fetchWorkoutsRef = useRef<(opts?: { force?: boolean }) => Promise<void>>();
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollDeadlineRef = useRef<number | null>(null);
  const pollDelayRef = useRef(POLL_START_MS);

  const stopPolling = useCallback(() => {
    if (pollTimeoutRef.current) {
      clearTimeout(pollTimeoutRef.current);
      pollTimeoutRef.current = null;
    }
    pollDeadlineRef.current = null;
    pollDelayRef.current = POLL_START_MS;
    setPolling(false);
  }, []);

  const scheduleNextPoll = useCallback(() => {
    if (pollTimeoutRef.current) return; // already scheduled
    if (pollDeadlineRef.current === null) pollDeadlineRef.current = Date.now() + POLL_GIVE_UP_MS;

    if (Date.now() >= pollDeadlineRef.current) {
      stopPolling();
      if (workoutsCountRef.current === 0) {
        setBuilding(false);
        setSyncError('Still building the workout cache after several minutes — try Refresh.');
      }
      return;
    }

    setPolling(true);
    const delay = pollDelayRef.current;
    pollDelayRef.current = Math.min(pollDelayRef.current * POLL_BACKOFF_FACTOR, POLL_MAX_MS);
    pollTimeoutRef.current = setTimeout(() => {
      pollTimeoutRef.current = null;
      void fetchWorkoutsRef.current?.();
    }, delay);
  }, [stopPolling]);

  const fetchWorkouts = useCallback(async (opts: { force?: boolean } = {}) => {
    if (opts.force) stopPolling(); // manual refresh restarts the backoff from scratch
    setUpdating(true);
    try {
      const response = await fetch(opts.force ? '/api/notion?refresh=1' : '/api/notion', {
        cache: 'no-store',
      });
      const data = await response.json();

      if (!data.success) {
        if (data.retrying) {
          // Cold build (202) or rate-limited (429) — neutral state, not an
          // error, as long as we keep polling for it to resolve.
          setSyncError(null);
          if (workoutsCountRef.current === 0) setBuilding(true);
          scheduleNextPoll();
          return;
        }
        // Hard failure. Keep whatever's on screen — only the "no data at
        // all" case (handled by hasData below) shows this as a red banner.
        setBuilding(false);
        setSyncError(data.error || 'Failed to fetch workouts');
        return;
      }

      setBuilding(false);
      setSyncError(null);
      const newUpdatedAt: string | null = data.meta?.updatedAt ?? null;
      if (workoutsCountRef.current === 0 || newUpdatedAt !== lastUpdatedAtRef.current) {
        setWorkouts(parseWorkoutDates(data.workouts));
        workoutsCountRef.current = data.workouts.length;
        saveWorkoutsToLocalStorage(data.workouts);
      }
      lastUpdatedAtRef.current = newUpdatedAt;
      setLastSynced(newUpdatedAt ?? new Date().toISOString());

      if (data.meta?.refreshing) {
        scheduleNextPoll();
      } else {
        stopPolling();
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : 'Failed to fetch workouts');
      scheduleNextPoll(); // transient network errors are worth a few retries too
    } finally {
      setUpdating(false);
    }
  }, [scheduleNextPoll, stopPolling]);

  useEffect(() => {
    fetchWorkoutsRef.current = fetchWorkouts;
  }, [fetchWorkouts]);

  // Stop any in-flight poll timer on unmount.
  useEffect(() => stopPolling, [stopPolling]);

  const fetchHealthData = useCallback(async (skipCache = false) => {
    try {
      if (!skipCache) {
        const cached = getCache<DailyHealth[]>(CACHE_KEY_HEALTH);
        if (cached) {
          setHealthData(cached);
          return;
        }
      }

      const response = await fetch('/api/health');
      const data = await response.json();
      if (data.success && data.data) {
        setCache(CACHE_KEY_HEALTH, data.data);
        setHealthData(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch health data:', err);
    }
  }, []);

  const loadInBodyData = useCallback(() => {
    const data = getInBodyData();
    setInBodyEntries(data.entries);
    setLatestInBody(getLatestInBodyEntry());
  }, []);

  // On mount only: if the server had nothing cached, fall back to the
  // browser's own last-known copy for an instant render before the network
  // revalidation below completes. Runs post-hydration so it never causes a
  // server/client markup mismatch.
  useEffect(() => {
    if (hasHydratedFromLocalStorage.current) return;
    hasHydratedFromLocalStorage.current = true;
    if (!initialWorkouts || initialWorkouts.length === 0) {
      const fromLocalStorage = loadWorkoutsFromLocalStorage();
      if (fromLocalStorage && fromLocalStorage.length > 0) {
        setWorkouts(parseWorkoutDates(fromLocalStorage));
        workoutsCountRef.current = fromLocalStorage.length;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Background revalidation — never blanks the UI, just refreshes quietly.
    fetchWorkouts();
    fetchHealthData();
    loadInBodyData();
  }, [fetchWorkouts, fetchHealthData, loadInBodyData]);

  const handleRefresh = () => {
    fetchWorkouts({ force: true });
    fetchHealthData(true);
  };

  const hasData = workouts.length > 0;

  // All-time totals — shown as a small, low-emphasis row at the top of the
  // Progress tab (moved off the top of the page, which is now the recovery
  // hero + this-week strip).
  const totalWorkouts = workouts.length;
  const totalExercises = workouts.reduce((sum, w) => sum + w.exercises.length, 0);
  const totalSets = workouts.reduce(
    (sum, w) => sum + w.exercises.reduce((eSum, e) => eSum + e.sets.length, 0),
    0
  );

  return (
    <div className="min-h-screen bg-n-black">
      <header className="bg-n-surface border-b border-n-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex justify-between items-center">
            <h1 className="font-mono text-sm sm:text-base uppercase tracking-[0.08em] text-n-text-secondary">
              Fitness Dashboard
            </h1>
            <div className="flex items-center gap-3">
              {hasData && (
                <span className="hidden sm:inline font-mono text-[10px] uppercase tracking-[0.06em] text-n-text-disabled">
                  {updating || polling ? '[SYNCING...]' : `SYNCED ${formatLastSynced(lastSynced)}`}
                </span>
              )}
              <SettingsMenu onHealthUploaded={() => fetchHealthData(true)} />
              <Button onClick={handleRefresh} disabled={updating} variant="secondary" size="sm">
                {updating || polling ? '...' : 'Refresh'}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10">
        {!hasData && building && (
          <div className="mb-6 px-4 py-3 border border-n-border-visible bg-n-surface-raised rounded-nothing-sm font-mono text-xs uppercase tracking-[0.04em] text-n-text-secondary">
            [BUILDING WORKOUT CACHE — FIRST LOAD CAN TAKE A MINUTE...]
          </div>
        )}

        {!hasData && !building && syncError && (
          <div className="mb-6 px-4 py-3 border border-n-accent bg-n-accent-subtle rounded-nothing-sm font-mono text-xs uppercase tracking-[0.04em] text-n-accent">
            [ERROR: {syncError}]
          </div>
        )}

        {hasData && syncError && (
          <div className="mb-6 px-4 py-3 border border-n-warning bg-n-surface-raised rounded-nothing-sm font-mono text-[11px] uppercase tracking-[0.04em] text-n-warning">
            [SYNC ISSUE — SHOWING CACHED DATA FROM {formatLastSynced(lastSynced)}: {syncError}]
          </div>
        )}

        <div className="mb-4 sm:mb-6">
          <RecoveryHero healthData={healthData} latestInBody={latestInBody} />
        </div>
        <div className="mb-8">
          <WeekStrip workouts={workouts} healthData={healthData} />
        </div>

        <Tabs defaultValue="progress" className="space-y-8">
          <TabsList>
            <TabsTrigger value="progress">Progress</TabsTrigger>
            <TabsTrigger value="workouts">Workouts</TabsTrigger>
            <TabsTrigger value="insights">Insights</TabsTrigger>
            <TabsTrigger value="health">Health</TabsTrigger>
          </TabsList>

          <TabsContent value="insights" className="space-y-6">
            <Suspense fallback={<TabLoading />}>
              <RecompVerdict inBodyEntries={inBodyEntries} />
              <ExerciseAdvice />
              <Insights workouts={workouts} inBodyEntries={inBodyEntries} />
            </Suspense>
          </TabsContent>

          <TabsContent value="progress" className="space-y-6">
            <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-n-text-disabled">
              {totalWorkouts} total workouts · {totalExercises} exercises logged · {totalSets} total sets
            </p>
            <Suspense fallback={<TabLoading />}>
              <StrengthProgressChart workouts={workouts} />
              <div className="grid lg:grid-cols-2 gap-6">
                <WeightProgressChart workouts={workouts} />
                <CategorySummary workouts={workouts} />
              </div>
            </Suspense>
          </TabsContent>

          <TabsContent value="workouts" className="space-y-6">
            <Suspense fallback={<TabLoading />}>
              <WorkoutSummary workouts={workouts} limit={15} />
            </Suspense>
          </TabsContent>

          <TabsContent value="health" className="space-y-6">
            <Suspense fallback={<TabLoading />}>
              <HealthChart data={healthData} onDataUpdate={() => fetchHealthData(true)} />
            </Suspense>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
