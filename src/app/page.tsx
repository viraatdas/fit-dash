'use client';

import { useState, useEffect, useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent, Button } from '@/components/ui';
import { StatsOverview, WorkoutSummary, Insights } from '@/components/dashboard';
import {
  WeightProgressChart,
  CategorySummary,
  BodyCompositionChart,
  StrengthProgressChart,
  BodyRecompChart,
  HealthChart,
} from '@/components/charts';
import { InBodyForm, InBodyHistory } from '@/components/forms';
import { Workout, InBodyEntry, DailyHealth } from '@/types';
import {
  getInBodyData,
  addInBodyEntry,
  deleteInBodyEntry,
  getLatestInBodyEntry,
} from '@/lib/storage';

export default function Dashboard() {
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [inBodyEntries, setInBodyEntries] = useState<InBodyEntry[]>([]);
  const [latestInBody, setLatestInBody] = useState<InBodyEntry | null>(null);
  const [healthData, setHealthData] = useState<DailyHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkouts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/notion');
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch workouts');
      }

      // Convert date strings back to Date objects
      const parsedWorkouts = data.workouts.map((w: Workout & { date: string }) => ({
        ...w,
        date: new Date(w.date),
      }));

      setWorkouts(parsedWorkouts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch workouts');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchHealthData = useCallback(async () => {
    try {
      const response = await fetch('/api/health');
      const data = await response.json();
      if (data.success && data.data) {
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

  const handleAddInBody = (entry: Omit<InBodyEntry, 'id'>) => {
    addInBodyEntry(entry);
    loadInBodyData();
  };

  const handleDeleteInBody = (id: string) => {
    deleteInBodyEntry(id);
    loadInBodyData();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <div className="flex justify-between items-center">
            <h1 className="text-lg sm:text-2xl font-light text-gray-500 tracking-wide">Fitness Dashboard</h1>
            <Button onClick={fetchWorkouts} disabled={loading} variant="outline" size="sm">
              {loading ? '...' : 'Refresh'}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-lg text-red-600 font-light">
            {error}
          </div>
        )}

        <div className="mb-8">
          <StatsOverview workouts={workouts} latestInBody={latestInBody} />
        </div>

        <Tabs defaultValue="insights" className="space-y-6">
          <TabsList>
            <TabsTrigger value="insights">Insights</TabsTrigger>
            <TabsTrigger value="progress">Progress</TabsTrigger>
            <TabsTrigger value="workouts">Workouts</TabsTrigger>
            <TabsTrigger value="body">Body</TabsTrigger>
            <TabsTrigger value="health">Health</TabsTrigger>
          </TabsList>

          <TabsContent value="insights" className="space-y-6">
            <Insights workouts={workouts} inBodyEntries={inBodyEntries} />
          </TabsContent>

          <TabsContent value="progress" className="space-y-6">
            <StrengthProgressChart workouts={workouts} />
            <div className="grid lg:grid-cols-2 gap-6">
              <WeightProgressChart workouts={workouts} />
              <CategorySummary workouts={workouts} />
            </div>
          </TabsContent>

          <TabsContent value="workouts" className="space-y-6">
            <WorkoutSummary workouts={workouts} limit={15} />
          </TabsContent>

          <TabsContent value="body" className="space-y-6">
            <BodyRecompChart entries={inBodyEntries} />
            <BodyCompositionChart entries={inBodyEntries} />
            <InBodyForm onSubmit={handleAddInBody} />
            <InBodyHistory entries={inBodyEntries} onDelete={handleDeleteInBody} />
          </TabsContent>

          <TabsContent value="health" className="space-y-6">
            <HealthChart data={healthData} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
