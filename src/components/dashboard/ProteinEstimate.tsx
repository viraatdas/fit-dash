'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { Workout, InBodyEntry } from '@/types';

interface ProteinEstimateProps {
  workouts: Workout[];
  inBodyEntries: InBodyEntry[];
}

interface ProteinData {
  estimatedDailyIntake: number;
  recommendedDailyIntake: number;
  explanation: string;
}

export function ProteinEstimate({ workouts, inBodyEntries }: ProteinEstimateProps) {
  const [data, setData] = useState<ProteinData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    if (workouts.length === 0 && inBodyEntries.length === 0) return;

    hasFetched.current = true;

    const fetchEstimate = async () => {
      setLoading(true);
      setError(null);

      try {
        const sortedWorkouts = [...workouts]
          .sort((a, b) => b.date.getTime() - a.date.getTime())
          .slice(0, 20);

        const sortedInBody = [...inBodyEntries]
          .sort((a, b) => b.date.getTime() - a.date.getTime())
          .slice(0, 5);

        const res = await fetch('/api/insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workouts: sortedWorkouts,
            inBody: sortedInBody,
            prompt: buildProteinPrompt(sortedWorkouts, sortedInBody),
          }),
        });

        if (!res.ok) {
          throw new Error(`Request failed (${res.status})`);
        }

        const result = await res.json();

        // The insights endpoint returns parsed JSON from Claude.
        // Our custom prompt asks for protein-specific fields, but the
        // endpoint parses the first JSON object it finds. We look for
        // protein fields; fall back to computing from body weight.
        const estimated = result.estimatedDailyIntake ?? result.estimated_daily_intake;
        const recommended = result.recommendedDailyIntake ?? result.recommended_daily_intake;
        const explanation = result.explanation ?? result.analysis ?? '';

        if (estimated != null && recommended != null) {
          setData({
            estimatedDailyIntake: Math.round(estimated),
            recommendedDailyIntake: Math.round(recommended),
            explanation,
          });
        } else {
          // Fallback: compute from body weight if AI didn't return expected shape
          const latestWeight = sortedInBody.length > 0 ? sortedInBody[0].weight : null;
          if (latestWeight) {
            setData({
              estimatedDailyIntake: Math.round(latestWeight * 0.7),
              recommendedDailyIntake: Math.round(latestWeight * 0.9),
              explanation: explanation || 'Estimated based on body weight. For accurate results, track your actual food intake.',
            });
          } else {
            throw new Error('Insufficient data to estimate protein needs');
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to estimate protein');
      } finally {
        setLoading(false);
      }
    };

    fetchEstimate();
  }, [workouts, inBodyEntries]);

  const latestInBody = inBodyEntries.length > 0
    ? [...inBodyEntries].sort((a, b) => b.date.getTime() - a.date.getTime())[0]
    : null;

  if (workouts.length === 0 && inBodyEntries.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Protein Estimate</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-mono text-xs text-n-text-disabled uppercase tracking-[0.04em] text-center py-4">
            [LOG WORKOUTS AND BODY COMPOSITION FOR ESTIMATES]
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Protein Estimate</CardTitle>
        <p className="text-xs text-n-text-disabled mt-1">
          AI-estimated daily protein based on your training and body composition
        </p>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="text-center py-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-n-text-disabled">
              [ANALYZING...]
            </p>
          </div>
        )}

        {error && (
          <div className="text-center py-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-n-text-disabled">
              [ERROR: {error.toUpperCase()}]
            </p>
          </div>
        )}

        {data && !loading && (
          <div className="space-y-4">
            {/* Big numbers */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 bg-n-surface-raised rounded-nothing-sm text-center">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-disabled mb-2">
                  Estimated Intake
                </p>
                <p className="font-mono text-3xl tracking-tight text-n-text-display">
                  {data.estimatedDailyIntake}
                  <span className="text-sm text-n-text-secondary ml-1">g</span>
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-disabled mt-1">
                  per day
                </p>
              </div>

              <div className="p-4 border border-n-border-visible rounded-nothing-sm text-center">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-disabled mb-2">
                  Recommended
                </p>
                <p className="font-mono text-3xl tracking-tight text-n-accent">
                  {data.recommendedDailyIntake}
                  <span className="text-sm text-n-text-secondary ml-1">g</span>
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-disabled mt-1">
                  per day
                </p>
              </div>
            </div>

            {/* Gap indicator */}
            {data.estimatedDailyIntake < data.recommendedDailyIntake && (
              <div className="px-4 py-3 border border-n-border rounded-nothing-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-disabled">
                    Deficit
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.04em] text-n-accent">
                    {data.recommendedDailyIntake - data.estimatedDailyIntake}g below target
                  </span>
                </div>
              </div>
            )}

            {data.estimatedDailyIntake >= data.recommendedDailyIntake && (
              <div className="px-4 py-3 border border-n-border rounded-nothing-sm">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-disabled">
                    Status
                  </span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.04em] text-n-success">
                    Meeting target
                  </span>
                </div>
              </div>
            )}

            {/* Body weight context */}
            {latestInBody && (
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 bg-n-surface-raised rounded-nothing-xs text-center">
                  <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-n-text-disabled mb-1">
                    Body Weight
                  </p>
                  <p className="font-mono text-sm text-n-text-secondary">
                    {latestInBody.weight} lbs
                  </p>
                </div>
                <div className="p-3 bg-n-surface-raised rounded-nothing-xs text-center">
                  <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-n-text-disabled mb-1">
                    Muscle Mass
                  </p>
                  <p className="font-mono text-sm text-n-text-secondary">
                    {latestInBody.muscleMass} lbs
                  </p>
                </div>
                <div className="p-3 bg-n-surface-raised rounded-nothing-xs text-center">
                  <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-n-text-disabled mb-1">
                    g/lb Body Wt
                  </p>
                  <p className="font-mono text-sm text-n-text-secondary">
                    {(data.recommendedDailyIntake / latestInBody.weight).toFixed(2)}
                  </p>
                </div>
              </div>
            )}

            {/* AI Explanation */}
            {data.explanation && (
              <div className="px-4 py-3 border-l-2 border-l-n-border-visible">
                <p className="text-sm text-n-text-secondary leading-relaxed">
                  {data.explanation}
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function buildProteinPrompt(workouts: Workout[], inBodyEntries: InBodyEntry[]): string {
  const latestInBody = inBodyEntries[0];
  const bodyWeight = latestInBody?.weight;
  const muscleMass = latestInBody?.muscleMass;
  const bodyFat = latestInBody?.bodyFatPercentage;

  // Compute training frequency
  const uniqueDates = new Set(workouts.map(w => new Date(w.date).toISOString().split('T')[0]));
  const trainingDaysPerWeek = workouts.length > 1
    ? (uniqueDates.size / ((new Date(workouts[0].date).getTime() - new Date(workouts[workouts.length - 1].date).getTime()) / (7 * 24 * 60 * 60 * 1000))) || 0
    : 0;

  // Compute total weekly volume
  let totalVolume = 0;
  let totalSets = 0;
  workouts.forEach(w => {
    w.exercises.forEach(e => {
      e.sets.forEach(s => {
        totalVolume += s.reps * s.weight;
        totalSets++;
      });
    });
  });

  // Get max weights for key compound lifts
  const compoundLifts: Record<string, number> = {};
  workouts.forEach(w => {
    w.exercises.forEach(e => {
      const name = e.normalizedName.toLowerCase();
      if (e.sets.length > 0 && (name.includes('bench') || name.includes('squat') || name.includes('deadlift') ||
          name.includes('press') || name.includes('row'))) {
        const max = Math.max(...e.sets.map(s => s.weight));
        if (max > 0 && (!compoundLifts[e.normalizedName] || max > compoundLifts[e.normalizedName])) {
          compoundLifts[e.normalizedName] = max;
        }
      }
    });
  });

  // Check progression trends
  const exerciseFirstLast: Record<string, { first: number; last: number }> = {};
  const chronological = [...workouts].reverse();
  chronological.forEach(w => {
    w.exercises.forEach(e => {
      if (e.sets.length === 0) return;
      const max = Math.max(...e.sets.map(s => s.weight));
      if (max > 0) {
        if (!exerciseFirstLast[e.normalizedName]) {
          exerciseFirstLast[e.normalizedName] = { first: max, last: max };
        } else {
          exerciseFirstLast[e.normalizedName].last = max;
        }
      }
    });
  });

  const progressingCount = Object.values(exerciseFirstLast).filter(e => e.last > e.first).length;
  const stagnantCount = Object.values(exerciseFirstLast).filter(e => e.last <= e.first).length;

  return `You are a sports nutritionist estimating daily protein needs for a client.

Body composition (latest InBody):
- Body weight: ${bodyWeight ? `${bodyWeight} lbs` : 'Unknown'}
- Skeletal muscle mass: ${muscleMass ? `${muscleMass} lbs` : 'Unknown'}
- Body fat percentage: ${bodyFat ? `${bodyFat}%` : 'Unknown'}

Training data (last ${workouts.length} sessions):
- Training frequency: ~${trainingDaysPerWeek.toFixed(1)} days/week
- Total sets across sessions: ${totalSets}
- Total volume (reps x weight): ${(totalVolume / 1000).toFixed(0)}k lbs
- Key compound lift maxes: ${Object.entries(compoundLifts).map(([name, w]) => `${name}: ${w} lbs`).join(', ') || 'N/A'}
- Progression: ${progressingCount} exercises trending up, ${stagnantCount} stagnant

Goals: Build muscle, reduce body fat, improve functional strength.

Based on:
1. Their current training volume and intensity
2. Their body weight and muscle mass
3. Their training frequency
4. Whether they are progressing or stagnant (higher protein helps break plateaus)

Estimate their likely current daily protein intake and recommend an optimal daily protein intake.

The recommended intake should be between 0.8-1.0g per pound of body weight for someone actively lifting, adjusted based on their specific training intensity and goals.

The estimated current intake is your best guess based on their lifting performance — if they are progressing well, they are likely eating adequate protein; if stagnant, they may be under-eating.

Respond in JSON format:
{
  "estimated_daily_intake": <number in grams>,
  "recommended_daily_intake": <number in grams>,
  "explanation": "<2-3 sentences explaining your reasoning>"
}`;
}
