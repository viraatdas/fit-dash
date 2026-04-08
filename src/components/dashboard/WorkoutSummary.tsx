'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { Workout } from '@/types';

interface WorkoutSummaryProps {
  workouts: Workout[];
  limit?: number;
}

export function WorkoutSummary({ workouts, limit = 5 }: WorkoutSummaryProps) {
  const displayWorkouts = workouts.slice(0, limit);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggle = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Workouts</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {displayWorkouts.length === 0 ? (
          <p className="px-6 py-4 font-mono text-xs text-n-text-disabled uppercase tracking-[0.04em]">[NO WORKOUTS FOUND]</p>
        ) : (
          <div className="divide-y divide-n-border">
            {displayWorkouts.map((workout) => {
              const isExpanded = expandedId === workout.id;
              const totalSets = workout.exercises.reduce((sum, e) => sum + e.sets.length, 0);
              const totalReps = workout.exercises.reduce((sum, e) => sum + e.sets.reduce((s, set) => s + set.reps, 0), 0);
              const avgReps = totalSets > 0 ? Math.round(totalReps / totalSets) : 0;

              return (
                <div key={workout.id}>
                  <button
                    onClick={() => toggle(workout.id)}
                    className="w-full px-6 py-4 text-left hover:bg-n-surface-raised transition-colors duration-150"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <svg
                          className={`w-3 h-3 text-n-text-disabled transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M9 18l6-6-6-6" />
                        </svg>
                        <span className="text-sm text-n-text-primary">
                          {format(workout.date, 'EEEE, MMM d, yyyy')}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-n-text-disabled">
                          {totalSets}s
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-n-text-disabled">
                          ~{avgReps}r
                        </span>
                        <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-n-text-secondary">
                          {workout.exercises.length} exercise{workout.exercises.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    {!isExpanded && (
                      <div className="flex flex-wrap gap-2 ml-5">
                        {workout.exercises.slice(0, 5).map((exercise, idx) => (
                          <span
                            key={idx}
                            className="inline-block px-3 py-1 font-mono text-[10px] uppercase tracking-[0.04em] border border-n-border-visible text-n-text-secondary rounded-pill"
                          >
                            {exercise.normalizedName}
                          </span>
                        ))}
                        {workout.exercises.length > 5 && (
                          <span className="inline-block px-3 py-1 font-mono text-[10px] uppercase tracking-[0.04em] text-n-text-disabled">
                            +{workout.exercises.length - 5} more
                          </span>
                        )}
                      </div>
                    )}
                  </button>

                  {isExpanded && (
                    <div className="px-6 pb-4">
                      <div className="ml-5 space-y-3">
                        {workout.exercises.map((exercise, idx) => {
                          const sets = exercise.sets;
                          const numSets = sets.length;
                          const exAvgReps = numSets > 0
                            ? Math.round(sets.reduce((s, set) => s + set.reps, 0) / numSets)
                            : 0;
                          const exAvgWeight = numSets > 0
                            ? Math.round(sets.reduce((s, set) => s + set.weight, 0) / numSets)
                            : 0;
                          const maxWeight = numSets > 0
                            ? Math.max(...sets.map(s => s.weight))
                            : 0;

                          return (
                            <div key={idx} className="p-3 border border-n-border rounded-nothing-sm">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-[9px] uppercase tracking-[0.06em] px-2 py-0.5 border border-n-border-visible text-n-text-disabled rounded-pill">
                                    {exercise.category}
                                  </span>
                                  <span className="text-sm text-n-text-primary">{exercise.normalizedName}</span>
                                </div>
                                {maxWeight > 0 && (
                                  <span className="font-mono text-xs text-n-text-display">{maxWeight} lbs</span>
                                )}
                              </div>

                              {/* Stats row */}
                              <div className="flex gap-4 mb-2">
                                <div>
                                  <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-n-text-disabled">SETS </span>
                                  <span className="font-mono text-xs text-n-text-secondary">{numSets}</span>
                                </div>
                                <div>
                                  <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-n-text-disabled">AVG REPS </span>
                                  <span className="font-mono text-xs text-n-text-secondary">{exAvgReps}</span>
                                </div>
                                <div>
                                  <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-n-text-disabled">AVG WEIGHT </span>
                                  <span className="font-mono text-xs text-n-text-secondary">{exAvgWeight > 0 ? `${exAvgWeight} lbs` : 'BW'}</span>
                                </div>
                              </div>

                              {/* Individual sets */}
                              <div className="flex flex-wrap gap-1.5">
                                {sets.map((set, j) => (
                                  <span key={j} className="px-2 py-0.5 bg-n-surface-raised rounded-nothing-xs font-mono text-[10px] text-n-text-secondary">
                                    {set.reps} x {set.weight > 0 ? set.weight : 'BW'}
                                  </span>
                                ))}
                                {sets.length === 0 && (
                                  <span className="font-mono text-[10px] text-n-text-disabled">[NO SETS PARSED]</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
