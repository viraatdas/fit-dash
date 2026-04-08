'use client';

import { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { Workout, InBodyEntry } from '@/types';
import { differenceInDays, format } from 'date-fns';

interface InsightsProps {
  workouts: Workout[];
  inBodyEntries: InBodyEntry[];
}

interface Insight {
  type: 'strength' | 'consistency' | 'balance' | 'body' | 'tip';
  title: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
}

interface ExerciseTarget {
  name: string;
  category: string;
  currentWeight: number;
  currentReps: number;
  currentSets: number;
  targetWeight: number;
  targetReps: number;
  targetSets: number;
  lastPerformed: Date | null;
  trend: 'up' | 'maintain' | 'new';
  notes: string;
}

export function Insights({ workouts, inBodyEntries }: InsightsProps) {
  const exerciseTargets = useMemo(() => {
    if (workouts.length === 0) return [];

    const exerciseHistory: Record<string, {
      name: string;
      category: string;
      performances: Array<{ date: Date; maxWeight: number; bestSet: { reps: number; weight: number }; totalSets: number }>;
    }> = {};

    workouts.forEach(w => {
      w.exercises.forEach(e => {
        if (!exerciseHistory[e.normalizedName]) {
          exerciseHistory[e.normalizedName] = { name: e.normalizedName, category: e.category, performances: [] };
        }
        const validSets = e.sets.filter(s => s.weight > 0);
        if (validSets.length > 0) {
          const maxWeight = Math.max(...validSets.map(s => s.weight));
          const bestSet = validSets.reduce((best, s) => s.weight > best.weight ? s : best, validSets[0]);
          exerciseHistory[e.normalizedName].performances.push({ date: w.date, maxWeight, bestSet, totalSets: validSets.length });
        }
      });
    });

    const targets: ExerciseTarget[] = [];

    Object.values(exerciseHistory).forEach(exercise => {
      if (exercise.performances.length === 0) return;
      const sorted = [...exercise.performances].sort((a, b) => b.date.getTime() - a.date.getTime());
      const latest = sorted[0];
      const previous = sorted[1];

      let targetWeight = latest.maxWeight;
      let trend: 'up' | 'maintain' | 'new' = 'maintain';
      let notes = '';

      if (latest.totalSets >= 3 && latest.bestSet.reps >= 8) {
        const isCompound = ['Bench Press', 'Squat', 'Deadlift', 'Leg Press', 'Row'].some(
          c => exercise.name.toLowerCase().includes(c.toLowerCase())
        );
        const increment = isCompound ? 10 : 5;
        targetWeight = Math.ceil((latest.maxWeight + increment) / 5) * 5;
        trend = 'up';
        notes = `+${increment} lbs from last session`;
      } else if (latest.totalSets < 3 || latest.bestSet.reps < 6) {
        targetWeight = latest.maxWeight;
        notes = 'Focus on form and full ROM';
      } else {
        notes = 'Complete all sets before increasing';
      }

      if (previous && latest.maxWeight < previous.maxWeight) {
        notes = 'Rebuild to previous max';
        targetWeight = previous.maxWeight;
      }

      let targetReps = 10;
      let targetSets = 3;

      if (exercise.name.toLowerCase().includes('deadlift')) { targetReps = 5; targetSets = 3; }
      else if (exercise.name.toLowerCase().includes('squat') || exercise.name.toLowerCase().includes('bench') || exercise.name.toLowerCase().includes('press')) { targetReps = 8; targetSets = 4; }
      else if (exercise.name.toLowerCase().includes('curl') || exercise.name.toLowerCase().includes('extension') || exercise.name.toLowerCase().includes('fly') || exercise.name.toLowerCase().includes('raise')) { targetReps = 12; targetSets = 3; }

      targets.push({
        name: exercise.name, category: exercise.category,
        currentWeight: latest.maxWeight, currentReps: latest.bestSet.reps, currentSets: latest.totalSets,
        targetWeight, targetReps, targetSets, lastPerformed: latest.date, trend, notes,
      });
    });

    return targets.sort((a, b) => {
      const categoryOrder = ['Lower Body', 'Upper Body', 'Back', 'Core'];
      const aOrder = categoryOrder.indexOf(a.category);
      const bOrder = categoryOrder.indexOf(b.category);
      if (aOrder !== bOrder) return aOrder - bOrder;
      const aDate = a.lastPerformed?.getTime() || 0;
      const bDate = b.lastPerformed?.getTime() || 0;
      return aDate - bDate;
    });
  }, [workouts]);

  const suggestedWorkout = useMemo(() => {
    if (exerciseTargets.length === 0) return [];
    const now = new Date();
    const suggestions: ExerciseTarget[] = [];
    const categoriesIncluded = new Set<string>();

    for (const target of exerciseTargets) {
      const daysSinceLast = target.lastPerformed ? differenceInDays(now, target.lastPerformed) : 999;
      if (daysSinceLast >= 5 || !categoriesIncluded.has(target.category)) {
        if (!categoriesIncluded.has(target.category) || suggestions.length < 6) {
          suggestions.push(target);
          categoriesIncluded.add(target.category);
        }
      }
      if (suggestions.length >= 6) break;
    }

    if (suggestions.length < 4) {
      for (const target of exerciseTargets) {
        if (!suggestions.includes(target)) {
          suggestions.push(target);
          if (suggestions.length >= 4) break;
        }
      }
    }
    return suggestions;
  }, [exerciseTargets]);

  const lastWorkoutBreakdown = useMemo(() => {
    if (workouts.length === 0) return null;
    const lastWorkout = workouts[0];
    const previousWorkouts = workouts.slice(1);

    let totalVolume = 0;
    let totalSets = 0;
    let totalReps = 0;

    const exerciseBreakdowns = lastWorkout.exercises.filter(e => e.sets.length > 0).map(exercise => {
      const sets = exercise.sets;
      const exerciseSets = sets.length;
      const exerciseReps = sets.reduce((sum, s) => sum + s.reps, 0);
      const exerciseVolume = sets.reduce((sum, s) => sum + (s.reps * s.weight), 0);
      const maxWeight = sets.length > 0 ? Math.max(...sets.map(s => s.weight)) : 0;

      totalVolume += exerciseVolume;
      totalSets += exerciseSets;
      totalReps += exerciseReps;

      let lastSessionMax = 0;
      let lastSessionReps = 0;
      let allTimePR = 0;
      let timesPerformed = 0;

      for (const workout of previousWorkouts) {
        const prevExercise = workout.exercises.find(e => e.normalizedName === exercise.normalizedName);
        if (prevExercise && prevExercise.sets.length > 0) {
          const prevMax = Math.max(...prevExercise.sets.map(s => s.weight));
          const prevReps = prevExercise.sets.reduce((sum, s) => sum + s.reps, 0);
          if (prevMax > allTimePR) allTimePR = prevMax;
          if (timesPerformed === 0) { lastSessionMax = prevMax; lastSessionReps = prevReps; }
          timesPerformed++;
        }
      }

      const weightDelta = maxWeight - lastSessionMax;
      const repsDelta = exerciseReps - lastSessionReps;

      let assessment: 'pr' | 'good' | 'same' | 'down' | 'new' = 'new';
      let assessmentNote = 'First time logging';

      if (timesPerformed > 0) {
        if (maxWeight > allTimePR) { assessment = 'pr'; assessmentNote = `ALL-TIME PR! +${maxWeight - allTimePR} LBS`; }
        else if (maxWeight > lastSessionMax) { assessment = 'pr'; assessmentNote = `+${weightDelta} LBS FROM LAST`; }
        else if (maxWeight === lastSessionMax && exerciseReps > lastSessionReps) { assessment = 'good'; assessmentNote = `SAME WEIGHT, +${repsDelta} REPS`; }
        else if (maxWeight === lastSessionMax && exerciseReps === lastSessionReps) { assessment = 'same'; assessmentNote = 'MATCHED LAST SESSION'; }
        else if (maxWeight === lastSessionMax) { assessment = 'same'; assessmentNote = `SAME WEIGHT, ${Math.abs(repsDelta)} FEWER REPS`; }
        else { assessment = 'down'; assessmentNote = `${Math.abs(weightDelta)} LBS LIGHTER`; }
      }

      return {
        name: exercise.normalizedName, category: exercise.category,
        sets: exerciseSets, reps: exerciseReps, maxWeight, volume: exerciseVolume,
        lastSessionMax, weightDelta, repsDelta, timesPerformed, allTimePR: Math.max(allTimePR, maxWeight),
        assessment, assessmentNote, setsDetail: sets,
      };
    });

    const prCount = exerciseBreakdowns.filter(e => e.assessment === 'pr').length;
    const goodCount = exerciseBreakdowns.filter(e => e.assessment === 'good').length;
    const downCount = exerciseBreakdowns.filter(e => e.assessment === 'down').length;

    let overallAssessment = '';
    if (prCount > 0) overallAssessment = `${prCount} PR${prCount > 1 ? 's' : ''} HIT. STRONG SESSION.`;
    else if (goodCount >= exerciseBreakdowns.length / 2) overallAssessment = 'SOLID. MAINTAINED OR IMPROVED MOST EXERCISES.';
    else if (downCount > exerciseBreakdowns.length / 2) overallAssessment = 'RECOVERY DAY. REST AND COME BACK STRONGER.';
    else overallAssessment = 'CONSISTENT SESSION. KEEP PUSHING.';

    return {
      date: lastWorkout.date, exerciseCount: lastWorkout.exercises.length,
      totalSets, totalReps, totalVolume, exercises: exerciseBreakdowns,
      overallAssessment, prCount,
    };
  }, [workouts]);

  const insights = useMemo(() => {
    const result: Insight[] = [];
    if (workouts.length === 0) {
      return [{ type: 'tip' as const, title: 'Get Started', message: 'Start logging workouts to see personalized insights.', priority: 'medium' as const }];
    }

    const sortedWorkouts = [...workouts].sort((a, b) => b.date.getTime() - a.date.getTime());
    const recentWorkouts = sortedWorkouts.slice(0, 10);

    if (recentWorkouts.length >= 2) {
      const avgDaysBetween = recentWorkouts.slice(0, -1).reduce((sum, w, i) => {
        return sum + differenceInDays(w.date, recentWorkouts[i + 1].date);
      }, 0) / (recentWorkouts.length - 1);

      if (avgDaysBetween > 5) {
        result.push({ type: 'consistency', title: 'Increase Frequency', message: `Averaging ${avgDaysBetween.toFixed(1)} days between workouts. Aim for 3-4 sessions/week.`, priority: 'high' });
      } else if (avgDaysBetween < 2) {
        result.push({ type: 'consistency', title: 'Recovery Matters', message: `Training every ${avgDaysBetween.toFixed(1)} days. Ensure adequate rest for recovery.`, priority: 'medium' });
      }
    }

    const categoryCounts: Record<string, number> = {};
    workouts.forEach(w => { w.exercises.forEach(e => { categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1; }); });

    const totalExercises = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
    const lowerBody = (categoryCounts['Lower Body'] || 0) / totalExercises;
    const back = (categoryCounts['Back'] || 0) / totalExercises;

    if (lowerBody < 0.2) {
      result.push({ type: 'balance', title: 'More Leg Work', message: `Only ${(lowerBody * 100).toFixed(0)}% lower body. Aim for 30-40%.`, priority: 'high' });
    }
    if (back < 0.15) {
      result.push({ type: 'balance', title: 'Strengthen Back', message: `Back is ${(back * 100).toFixed(0)}% of training. Strong back improves posture.`, priority: 'medium' });
    }

    const exerciseProgress: Record<string, { first: number; last: number; name: string }> = {};
    sortedWorkouts.reverse().forEach(w => {
      w.exercises.forEach(e => {
        const maxWeight = Math.max(...e.sets.map(s => s.weight));
        if (maxWeight > 0) {
          if (!exerciseProgress[e.normalizedName]) exerciseProgress[e.normalizedName] = { first: maxWeight, last: maxWeight, name: e.normalizedName };
          else exerciseProgress[e.normalizedName].last = maxWeight;
        }
      });
    });

    const progressingExercises = Object.values(exerciseProgress).filter(p => p.last > p.first);
    const stagnantExercises = Object.values(exerciseProgress).filter(p => p.last <= p.first && p.first > 0);

    if (progressingExercises.length > 0) {
      result.push({ type: 'strength', title: 'Progressive Overload', message: `Progress on ${progressingExercises.slice(0, 3).map(p => p.name).join(', ')}. Keep pushing.`, priority: 'low' });
    }
    if (stagnantExercises.length > 3) {
      result.push({ type: 'strength', title: 'Break Plateaus', message: `${stagnantExercises.length} exercises stagnant. Try varying rep ranges.`, priority: 'medium' });
    }

    if (inBodyEntries.length >= 2) {
      const sorted = [...inBodyEntries].sort((a, b) => a.date.getTime() - b.date.getTime());
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const muscleChange = last.muscleMass - first.muscleMass;
      const fatChange = (last.bodyFatMass || last.weight * last.bodyFatPercentage / 100) - (first.bodyFatMass || first.weight * first.bodyFatPercentage / 100);

      if (muscleChange > 0 && fatChange < 0) {
        result.push({ type: 'body', title: 'Recomposition Success', message: `+${muscleChange.toFixed(1)} lbs muscle, -${Math.abs(fatChange).toFixed(1)} lbs fat. Textbook recomp.`, priority: 'low' });
      }
    }

    return result;
  }, [workouts, inBodyEntries]);

  const priorityIndicator = {
    high: 'border-l-2 border-l-n-accent',
    medium: 'border-l-2 border-l-n-warning',
    low: 'border-l-2 border-l-n-success',
  };

  const assessmentStyles: Record<string, string> = {
    pr: 'border-n-success text-n-success',
    good: 'border-n-interactive text-n-interactive',
    same: 'border-n-border-visible text-n-text-secondary',
    down: 'border-n-warning text-n-warning',
    new: 'border-n-text-disabled text-n-text-disabled',
  };

  const assessmentLabels: Record<string, string> = {
    pr: 'PR', good: 'GOOD', same: 'SAME', down: 'LIGHT', new: 'NEW',
  };

  const formatDaysAgo = (date: Date | null) => {
    if (!date) return 'Never';
    const days = differenceInDays(new Date(), date);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days}d ago`;
  };

  return (
    <div className="space-y-6">
      {/* Last Workout Breakdown */}
      {lastWorkoutBreakdown && (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
              <div>
                <CardTitle>Last Workout Breakdown</CardTitle>
                <p className="text-xs text-n-text-disabled mt-1">
                  {format(lastWorkoutBreakdown.date, 'EEEE, MMMM d, yyyy')}
                </p>
              </div>
              {lastWorkoutBreakdown.prCount > 0 && (
                <span className="font-mono text-[11px] uppercase tracking-[0.06em] px-3 py-1 border border-n-success text-n-success rounded-pill">
                  {lastWorkoutBreakdown.prCount} PR{lastWorkoutBreakdown.prCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {/* Overall Stats */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {[
                { value: lastWorkoutBreakdown.exerciseCount, label: 'EXERCISES' },
                { value: lastWorkoutBreakdown.totalSets, label: 'SETS' },
                { value: lastWorkoutBreakdown.totalReps, label: 'REPS' },
              ].map((stat) => (
                <div key={stat.label} className="text-center p-3 bg-n-surface-raised rounded-nothing-sm">
                  <p className="text-lg font-mono text-n-text-display tracking-tight">{stat.value}</p>
                  <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-n-text-disabled mt-1">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* Overall Assessment */}
            <div className="px-4 py-3 border border-n-border-visible rounded-nothing-sm mb-4">
              <p className="font-mono text-[11px] uppercase tracking-[0.04em] text-n-text-secondary">{lastWorkoutBreakdown.overallAssessment}</p>
            </div>

            {/* Exercise Breakdown */}
            <div className="space-y-3">
              {lastWorkoutBreakdown.exercises.map((exercise, i) => (
                <div key={i} className="p-4 border border-n-border rounded-nothing-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.06em] px-2 py-0.5 border border-n-border-visible text-n-text-disabled rounded-pill">
                        {exercise.category}
                      </span>
                      <h4 className="text-sm text-n-text-primary">{exercise.name}</h4>
                    </div>
                    <span className={`font-mono text-[10px] uppercase tracking-[0.06em] px-2 py-0.5 border rounded-pill ${assessmentStyles[exercise.assessment]}`}>
                      {assessmentLabels[exercise.assessment]}
                    </span>
                  </div>

                  {/* Sets */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {exercise.setsDetail.map((set, j) => (
                      <span key={j} className="px-2 py-1 bg-n-surface-raised rounded-nothing-xs font-mono text-[11px] text-n-text-secondary">
                        {set.reps} x {set.weight}
                      </span>
                    ))}
                  </div>

                  {/* Comparison */}
                  {exercise.timesPerformed > 0 && (
                    <div className="flex flex-wrap gap-3 p-3 bg-n-surface-raised rounded-nothing-xs mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] uppercase text-n-text-disabled">PREV:</span>
                        <span className="font-mono text-[11px] text-n-text-secondary">{exercise.lastSessionMax} lbs</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] uppercase text-n-text-disabled">NOW:</span>
                        <span className="font-mono text-[11px] text-n-text-primary">{exercise.maxWeight} lbs</span>
                      </div>
                      {exercise.weightDelta !== 0 && (
                        <span className={`font-mono text-[11px] ${exercise.weightDelta > 0 ? 'text-n-success' : 'text-n-warning'}`}>
                          {exercise.weightDelta > 0 ? '+' : ''}{exercise.weightDelta}
                        </span>
                      )}
                    </div>
                  )}

                  {/* All-time PR */}
                  {exercise.timesPerformed > 0 && exercise.maxWeight >= exercise.allTimePR && exercise.allTimePR > 0 && (
                    <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-n-success mb-2">
                      ALL-TIME PR: {exercise.allTimePR} LBS
                    </p>
                  )}

                  <p className={`font-mono text-[10px] uppercase tracking-[0.04em] ${exercise.assessment === 'pr' ? 'text-n-success' : exercise.assessment === 'down' ? 'text-n-warning' : 'text-n-text-disabled'}`}>
                    {exercise.assessmentNote}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Next Workout Targets */}
      <Card>
        <CardHeader>
          <CardTitle>Next Workout Targets</CardTitle>
          <p className="text-xs text-n-text-disabled mt-1">Exercises and weights to aim for</p>
        </CardHeader>
        <CardContent>
          {suggestedWorkout.length === 0 ? (
            <p className="font-mono text-xs text-n-text-disabled uppercase tracking-[0.04em] text-center py-4">[LOG WORKOUTS FOR TARGETS]</p>
          ) : (
            <div className="space-y-4">
              {suggestedWorkout.map((target, i) => (
                <div key={i} className="p-4 border border-n-border rounded-nothing-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-[0.06em] px-2 py-0.5 border border-n-border-visible text-n-text-disabled rounded-pill">
                        {target.category}
                      </span>
                      <h4 className="text-sm text-n-text-primary">{target.name}</h4>
                    </div>
                    <span className="font-mono text-[10px] text-n-text-disabled">{formatDaysAgo(target.lastPerformed)}</span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 p-3 bg-n-surface-raised rounded-nothing-xs">
                      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-disabled mb-1">CURRENT</p>
                      <p className="text-xl font-mono text-n-text-secondary tracking-tight">{target.currentWeight}</p>
                      <p className="font-mono text-[10px] text-n-text-disabled mt-1">{target.currentSets} x {target.currentReps}</p>
                    </div>

                    <span className={`font-mono text-lg ${target.trend === 'up' ? 'text-n-success' : 'text-n-text-disabled'}`}>&rarr;</span>

                    <div className={`flex-1 p-3 rounded-nothing-xs border ${target.trend === 'up' ? 'border-n-success bg-n-surface-raised' : 'border-n-border-visible bg-n-surface-raised'}`}>
                      <p className={`font-mono text-[10px] uppercase tracking-[0.08em] ${target.trend === 'up' ? 'text-n-success' : 'text-n-interactive'} mb-1`}>TARGET</p>
                      <p className={`text-xl font-mono tracking-tight ${target.trend === 'up' ? 'text-n-text-display' : 'text-n-interactive'}`}>
                        {target.targetWeight}
                      </p>
                      <p className={`font-mono text-[10px] mt-1 ${target.trend === 'up' ? 'text-n-success' : 'text-n-interactive'}`}>
                        {target.targetSets} x {target.targetReps}
                      </p>
                    </div>
                  </div>

                  {target.notes && (
                    <p className={`font-mono text-[10px] uppercase tracking-[0.04em] mt-3 ${target.trend === 'up' ? 'text-n-success' : 'text-n-warning'}`}>
                      {target.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* All Exercise Targets */}
      <Card>
        <CardHeader>
          <CardTitle>All Exercise Targets</CardTitle>
          <p className="text-xs text-n-text-disabled mt-1">Current vs next target</p>
        </CardHeader>
        <CardContent>
          {exerciseTargets.length === 0 ? (
            <p className="font-mono text-xs text-n-text-disabled uppercase tracking-[0.04em] text-center py-4">[NO HISTORY]</p>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-n-border-visible">
                    <th className="text-left py-3 px-3 font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-secondary">Exercise</th>
                    <th className="text-right py-3 px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-secondary">Now</th>
                    <th className="text-right py-3 px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-secondary">Goal</th>
                    <th className="text-right py-3 px-2 font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-secondary hidden sm:table-cell">Sets x Reps</th>
                  </tr>
                </thead>
                <tbody>
                  {exerciseTargets.slice(0, 20).map((target, i) => (
                    <tr key={i} className="border-b border-n-border hover:bg-n-surface-raised transition-colors duration-150">
                      <td className="py-3 px-3">
                        <div className="text-sm text-n-text-primary">{target.name}</div>
                        <div className="font-mono text-[10px] text-n-text-disabled uppercase">{target.category}</div>
                      </td>
                      <td className="text-right py-3 px-2 font-mono text-sm text-n-text-secondary">{target.currentWeight}</td>
                      <td className="text-right py-3 px-2">
                        <span className={`font-mono text-sm font-bold ${target.trend === 'up' ? 'text-n-success' : 'text-n-interactive'}`}>
                          {target.targetWeight}
                        </span>
                        {target.targetWeight > target.currentWeight && (
                          <span className="font-mono text-[10px] text-n-success ml-1">+{target.targetWeight - target.currentWeight}</span>
                        )}
                      </td>
                      <td className="text-right py-3 px-2 font-mono text-[11px] text-n-text-disabled hidden sm:table-cell">
                        {target.currentSets}x{target.currentReps} &rarr; {target.targetSets}x{target.targetReps}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {exerciseTargets.length > 20 && (
                <p className="font-mono text-[10px] text-n-text-disabled text-center mt-3 uppercase tracking-[0.04em]">
                  Showing 20 of {exerciseTargets.length}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Training Insights */}
      <Card>
        <CardHeader>
          <CardTitle>Training Insights</CardTitle>
          <p className="text-xs text-n-text-disabled mt-1">Based on your data</p>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {insights.map((insight, i) => (
              <div key={i} className={`p-4 bg-n-surface-raised rounded-nothing-sm ${priorityIndicator[insight.priority]}`}>
                <h4 className="font-mono text-[11px] uppercase tracking-[0.06em] text-n-text-primary mb-1">{insight.title}</h4>
                <p className="text-sm text-n-text-secondary">{insight.message}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
