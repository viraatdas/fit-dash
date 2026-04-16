'use client';

import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent, Button, ThemeToggle } from '@/components/ui';
import { StatsOverview } from '@/components/dashboard/StatsOverview';
import { Workout, InBodyEntry, DailyHealth } from '@/types';
import {
  getInBodyData,
  addInBodyEntry,
  deleteInBodyEntry,
  getLatestInBodyEntry,
} from '@/lib/storage';

// Lazy load heavy components — only downloaded when their tab is active
const WorkoutSummary = lazy(() => import('@/components/dashboard/WorkoutSummary').then(m => ({ default: m.WorkoutSummary })));
const Insights = lazy(() => import('@/components/dashboard/Insights').then(m => ({ default: m.Insights })));
const ExerciseAdvice = lazy(() => import('@/components/dashboard/ExerciseAdvice').then(m => ({ default: m.ExerciseAdvice })));
const FoodLog = lazy(() => import('@/components/dashboard/FoodLog').then(m => ({ default: m.FoodLog })));
const RecompVerdict = lazy(() => import('@/components/dashboard/RecompVerdict').then(m => ({ default: m.RecompVerdict })));
const StrengthProgressChart = lazy(() => import('@/components/charts/StrengthProgressChart').then(m => ({ default: m.StrengthProgressChart })));
const WeightProgressChart = lazy(() => import('@/components/charts/WeightProgressChart').then(m => ({ default: m.WeightProgressChart })));
const CategorySummary = lazy(() => import('@/components/charts/CategorySummary').then(m => ({ default: m.CategorySummary })));
const BodyCompositionChart = lazy(() => import('@/components/charts/BodyCompositionChart').then(m => ({ default: m.BodyCompositionChart })));
const BodyRecompChart = lazy(() => import('@/components/charts/BodyRecompChart').then(m => ({ default: m.BodyRecompChart })));
const HealthChart = lazy(() => import('@/components/charts/HealthChart').then(m => ({ default: m.HealthChart })));
const InBodyForm = lazy(() => import('@/components/forms/InBodyForm').then(m => ({ default: m.InBodyForm })));
const InBodyHistory = lazy(() => import('@/components/forms/InBodyHistory').then(m => ({ default: m.InBodyHistory })));

const CACHE_KEY_WORKOUTS = 'fitdash_workouts';
const CACHE_KEY_HEALTH = 'fitdash_health';
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours — matches CDN TTL

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

function parseWorkoutDates(workouts: (Workout & { date: string })[]) {
  return workouts.map(w => ({ ...w, date: new Date(w.date) }));
}

function TabLoading() {
  return (
    <div className="py-12 text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-n-text-disabled">[LOADING...]</p>
    </div>
  );
}

export default function Dashboard() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [inBodyEntries, setInBodyEntries] = useState<InBodyEntry[]>([]);
  const [latestInBody, setLatestInBody] = useState<InBodyEntry | null>(null);
  const [healthData, setHealthData] = useState<DailyHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkouts = useCallback(async (skipCache = false) => {
    try {
      setLoading(true);
      setError(null);

      if (!skipCache) {
        const cached = getCache<(Workout & { date: string })[]>(CACHE_KEY_WORKOUTS);
        if (cached) {
          setWorkouts(parseWorkoutDates(cached));
          setLoading(false);
          return;
        }
      }

      const response = await fetch(skipCache ? '/api/notion?refresh=1' : '/api/notion');
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch workouts');
      }

      setCache(CACHE_KEY_WORKOUTS, data.workouts);
      setWorkouts(parseWorkoutDates(data.workouts));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch workouts');
    } finally {
      setLoading(false);
    }
  }, []);

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

  useEffect(() => {
    fetchWorkouts();
    fetchHealthData();
    loadInBodyData();
  }, [fetchWorkouts, fetchHealthData, loadInBodyData]);

  const handleRefresh = () => {
    fetchWorkouts(true);
    fetchHealthData(true);
  };

  const handleAddInBody = (entry: Omit<InBodyEntry, 'id'>) => {
    addInBodyEntry(entry);
    loadInBodyData();
  };

  const handleDeleteInBody = (id: string) => {
    deleteInBodyEntry(id);
    loadInBodyData();
  };

  return (
    <div className="min-h-screen bg-n-black">
      <header className="bg-n-surface border-b border-n-border sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex justify-between items-center">
            <h1 className="font-mono text-sm sm:text-base uppercase tracking-[0.08em] text-n-text-secondary">
              Fitness Dashboard
            </h1>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Button onClick={handleRefresh} disabled={loading} variant="secondary" size="sm">
                {loading ? '...' : 'Refresh'}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10">
        {error && (
          <div className="mb-6 px-4 py-3 border border-n-accent bg-n-accent-subtle rounded-nothing-sm font-mono text-xs uppercase tracking-[0.04em] text-n-accent">
            [ERROR: {error}]
          </div>
        )}

        <div className="mb-8">
          <StatsOverview workouts={workouts} latestInBody={latestInBody} />
        </div>

        <Tabs defaultValue="progress" className="space-y-8">
          <TabsList>
            <TabsTrigger value="insights">Insights</TabsTrigger>
            <TabsTrigger value="progress">Progress</TabsTrigger>
            <TabsTrigger value="food">Food</TabsTrigger>
            <TabsTrigger value="workouts">Workouts</TabsTrigger>
            <TabsTrigger value="body">Body</TabsTrigger>
            <TabsTrigger value="health">Health</TabsTrigger>
          </TabsList>

          <TabsContent value="insights" className="space-y-6">
            <Suspense fallback={<TabLoading />}>
              <RecompVerdict inBodyEntries={inBodyEntries} />
              <ExerciseAdvice />
              <Insights workouts={workouts} inBodyEntries={inBodyEntries} />
            </Suspense>
          </TabsContent>

          <TabsContent value="food" className="space-y-6">
            <Suspense fallback={<TabLoading />}>
              <FoodLog />
            </Suspense>
          </TabsContent>

          <TabsContent value="progress" className="space-y-6">
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

          <TabsContent value="body" className="space-y-6">
            <Suspense fallback={<TabLoading />}>
              <BodyRecompChart entries={inBodyEntries} />
              <BodyCompositionChart entries={inBodyEntries} />
              <InBodyForm onSubmit={handleAddInBody} />
              <InBodyHistory entries={inBodyEntries} onDelete={handleDeleteInBody} />
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
