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
  // Current (what you did last time)
  currentWeight: number;
  currentReps: number;
  currentSets: number;
  // Target (what to aim for)
  targetWeight: number;
  targetReps: number;
  targetSets: number;
  lastPerformed: Date | null;
  trend: 'up' | 'maintain' | 'new';
  notes: string;
}

export function Insights({ workouts, inBodyEntries }: InsightsProps) {
  // Calculate exercise targets for next workout
  const exerciseTargets = useMemo(() => {
    if (workouts.length === 0) return [];

    const exerciseHistory: Record<string, {
      name: string;
      category: string;
      performances: Array<{ date: Date; maxWeight: number; bestSet: { reps: number; weight: number }; totalSets: number }>;
    }> = {};

    // Collect all exercise performances
    workouts.forEach(w => {
      w.exercises.forEach(e => {
        if (!exerciseHistory[e.normalizedName]) {
          exerciseHistory[e.normalizedName] = {
            name: e.normalizedName,
            category: e.category,
            performances: [],
          };
        }

        const validSets = e.sets.filter(s => s.weight > 0);
        if (validSets.length > 0) {
          const maxWeight = Math.max(...validSets.map(s => s.weight));
          const bestSet = validSets.reduce((best, s) =>
            s.weight > best.weight ? s : best, validSets[0]);

          exerciseHistory[e.normalizedName].performances.push({
            date: w.date,
            maxWeight,
            bestSet,
            totalSets: validSets.length,
          });
        }
      });
    });

    // Calculate targets for each exercise
    const targets: ExerciseTarget[] = [];

    Object.values(exerciseHistory).forEach(exercise => {
      if (exercise.performances.length === 0) return;

      // Sort by date (newest first)
      const sorted = [...exercise.performances].sort((a, b) => b.date.getTime() - a.date.getTime());
      const latest = sorted[0];
      const previous = sorted[1];

      // Calculate progression
      let targetWeight = latest.maxWeight;
      let trend: 'up' | 'maintain' | 'new' = 'maintain';
      let notes = '';

      // If completed all sets successfully (assume success if they logged it), suggest increase
      if (latest.totalSets >= 3 && latest.bestSet.reps >= 8) {
        // Standard 5-10lb increase for compound, 2.5-5lb for isolation
        const isCompound = ['Bench Press', 'Squat', 'Deadlift', 'Leg Press', 'Row'].some(
          c => exercise.name.toLowerCase().includes(c.toLowerCase())
        );
        const increment = isCompound ? 10 : 5;
        targetWeight = Math.ceil((latest.maxWeight + increment) / 5) * 5; // Round to nearest 5
        trend = 'up';
        notes = `+${increment} lbs from last session`;
      } else if (latest.totalSets < 3 || latest.bestSet.reps < 6) {
        // Struggled - maintain or slight reduction
        targetWeight = latest.maxWeight;
        notes = 'Focus on form and full ROM';
      } else {
        notes = 'Complete all sets before increasing';
      }

      // Check if weight decreased from previous session
      if (previous && latest.maxWeight < previous.maxWeight) {
        notes = 'Rebuild to previous max';
        targetWeight = previous.maxWeight;
      }

      // Determine target reps based on exercise type
      let targetReps = 10;
      let targetSets = 3;

      if (exercise.name.toLowerCase().includes('deadlift')) {
        targetReps = 5;
        targetSets = 3;
      } else if (exercise.name.toLowerCase().includes('squat') ||
                 exercise.name.toLowerCase().includes('bench') ||
                 exercise.name.toLowerCase().includes('press')) {
        targetReps = 8;
        targetSets = 4;
      } else if (exercise.name.toLowerCase().includes('curl') ||
                 exercise.name.toLowerCase().includes('extension') ||
                 exercise.name.toLowerCase().includes('fly') ||
                 exercise.name.toLowerCase().includes('raise')) {
        targetReps = 12;
        targetSets = 3;
      }

      targets.push({
        name: exercise.name,
        category: exercise.category,
        // Current performance
        currentWeight: latest.maxWeight,
        currentReps: latest.bestSet.reps,
        currentSets: latest.totalSets,
        // Targets
        targetWeight,
        targetReps,
        targetSets,
        lastPerformed: latest.date,
        trend,
        notes,
      });
    });

    // Sort by category, then by last performed (oldest first to prioritize exercises not done recently)
    return targets.sort((a, b) => {
      const categoryOrder = ['Lower Body', 'Upper Body', 'Back', 'Core'];
      const aOrder = categoryOrder.indexOf(a.category);
      const bOrder = categoryOrder.indexOf(b.category);
      if (aOrder !== bOrder) return aOrder - bOrder;

      const aDate = a.lastPerformed?.getTime() || 0;
      const bDate = b.lastPerformed?.getTime() || 0;
      return aDate - bDate; // Older first
    });
  }, [workouts]);

  // Get suggested workout based on what hasn't been done recently
  const suggestedWorkout = useMemo(() => {
    if (exerciseTargets.length === 0) return [];

    const now = new Date();
    const suggestions: ExerciseTarget[] = [];
    const categoriesIncluded = new Set<string>();

    // Pick exercises that haven't been done in a while, ensuring variety
    for (const target of exerciseTargets) {
      const daysSinceLast = target.lastPerformed
        ? differenceInDays(now, target.lastPerformed)
        : 999;

      // Include if not done in 5+ days, or if we need this category
      if (daysSinceLast >= 5 || !categoriesIncluded.has(target.category)) {
        if (!categoriesIncluded.has(target.category) || suggestions.length < 6) {
          suggestions.push(target);
          categoriesIncluded.add(target.category);
        }
      }

      if (suggestions.length >= 6) break;
    }

    // If we don't have enough, add more from any category
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

  // Analyze the last workout
  const lastWorkoutBreakdown = useMemo(() => {
    if (workouts.length === 0) return null;

    const lastWorkout = workouts[0]; // Most recent
    const previousWorkouts = workouts.slice(1);

    // Calculate total volume
    let totalVolume = 0;
    let totalSets = 0;
    let totalReps = 0;

    const exerciseBreakdowns = lastWorkout.exercises.map(exercise => {
      const sets = exercise.sets;
      const exerciseSets = sets.length;
      const exerciseReps = sets.reduce((sum, s) => sum + s.reps, 0);
      const exerciseVolume = sets.reduce((sum, s) => sum + (s.reps * s.weight), 0);
      const maxWeight = Math.max(...sets.map(s => s.weight));
      const avgReps = Math.round(exerciseReps / exerciseSets);

      totalVolume += exerciseVolume;
      totalSets += exerciseSets;
      totalReps += exerciseReps;

      // Find previous performances of this exercise
      let lastSessionMax = 0;
      let lastSessionReps = 0;
      let lastSessionSets = 0;
      let lastSessionVolume = 0;
      let allTimePR = 0;
      let timesPerformed = 0;
      let lastSessionDate: Date | null = null;

      for (const workout of previousWorkouts) {
        const prevExercise = workout.exercises.find(e => e.normalizedName === exercise.normalizedName);
        if (prevExercise && prevExercise.sets.length > 0) {
          const prevMax = Math.max(...prevExercise.sets.map(s => s.weight));
          const prevReps = prevExercise.sets.reduce((sum, s) => sum + s.reps, 0);
          const prevSets = prevExercise.sets.length;
          const prevVolume = prevExercise.sets.reduce((sum, s) => sum + (s.reps * s.weight), 0);

          // Track all-time PR
          if (prevMax > allTimePR) allTimePR = prevMax;

          // Track last session (first one we find)
          if (timesPerformed === 0) {
            lastSessionMax = prevMax;
            lastSessionReps = prevReps;
            lastSessionSets = prevSets;
            lastSessionVolume = prevVolume;
            lastSessionDate = workout.date;
          }
          timesPerformed++;
        }
      }

      // Calculate deltas from last session
      const weightDelta = maxWeight - lastSessionMax;
      const repsDelta = exerciseReps - lastSessionReps;
      const volumeDelta = exerciseVolume - lastSessionVolume;

      // Determine performance assessment
      let assessment: 'pr' | 'good' | 'same' | 'down' | 'new' = 'new';
      let assessmentNote = 'First time logging this exercise';

      if (timesPerformed > 0) {
        // Check if this is an all-time PR
        if (maxWeight > allTimePR) {
          assessment = 'pr';
          assessmentNote = `All-time PR! +${maxWeight - allTimePR} lbs over previous best`;
        } else if (maxWeight > lastSessionMax) {
          assessment = 'pr';
          assessmentNote = `+${weightDelta} lbs from last session`;
        } else if (maxWeight === lastSessionMax && exerciseReps > lastSessionReps) {
          assessment = 'good';
          assessmentNote = `Same weight, +${repsDelta} more reps than last time`;
        } else if (maxWeight === lastSessionMax && exerciseReps === lastSessionReps) {
          assessment = 'same';
          assessmentNote = 'Matched last session exactly';
        } else if (maxWeight === lastSessionMax) {
          assessment = 'same';
          assessmentNote = `Same weight, ${Math.abs(repsDelta)} fewer reps`;
        } else {
          assessment = 'down';
          assessmentNote = `${Math.abs(weightDelta)} lbs lighter than last session`;
        }
      }

      return {
        name: exercise.normalizedName,
        rawName: exercise.rawName,
        category: exercise.category,
        sets: exerciseSets,
        reps: exerciseReps,
        avgReps,
        maxWeight,
        volume: exerciseVolume,
        // Comparison data
        lastSessionMax,
        lastSessionReps,
        lastSessionVolume,
        lastSessionDate,
        allTimePR: Math.max(allTimePR, maxWeight), // Include current if it's the PR
        weightDelta,
        repsDelta,
        volumeDelta,
        timesPerformed,
        assessment,
        assessmentNote,
        setsDetail: sets,
      };
    });

    // Overall workout assessment
    const prCount = exerciseBreakdowns.filter(e => e.assessment === 'pr').length;
    const goodCount = exerciseBreakdowns.filter(e => e.assessment === 'good').length;
    const downCount = exerciseBreakdowns.filter(e => e.assessment === 'down').length;

    let overallAssessment = '';
    let overallEmoji = '💪';

    if (prCount > 0) {
      overallAssessment = `Great session! ${prCount} PR${prCount > 1 ? 's' : ''} hit.`;
      overallEmoji = '🔥';
    } else if (goodCount >= exerciseBreakdowns.length / 2) {
      overallAssessment = 'Solid workout. Maintained or improved on most exercises.';
      overallEmoji = '✅';
    } else if (downCount > exerciseBreakdowns.length / 2) {
      overallAssessment = 'Recovery day - lighter weights. Rest and come back stronger!';
      overallEmoji = '😴';
    } else {
      overallAssessment = 'Consistent session. Keep pushing!';
      overallEmoji = '💪';
    }

    // Category breakdown
    const categoryVolume: Record<string, number> = {};
    exerciseBreakdowns.forEach(e => {
      categoryVolume[e.category] = (categoryVolume[e.category] || 0) + e.volume;
    });

    return {
      date: lastWorkout.date,
      exerciseCount: lastWorkout.exercises.length,
      totalSets,
      totalReps,
      totalVolume,
      exercises: exerciseBreakdowns,
      overallAssessment,
      overallEmoji,
      categoryVolume,
      prCount,
    };
  }, [workouts]);

  // Calculate rule-based insights
  const insights = useMemo(() => {
    const result: Insight[] = [];

    if (workouts.length === 0) {
      return [{ type: 'tip' as const, title: 'Get Started', message: 'Start logging workouts to see personalized insights!', priority: 'medium' as const }];
    }

    // Workout frequency analysis
    const sortedWorkouts = [...workouts].sort((a, b) => b.date.getTime() - a.date.getTime());
    const recentWorkouts = sortedWorkouts.slice(0, 10);

    if (recentWorkouts.length >= 2) {
      const avgDaysBetween = recentWorkouts.slice(0, -1).reduce((sum, w, i) => {
        return sum + differenceInDays(w.date, recentWorkouts[i + 1].date);
      }, 0) / (recentWorkouts.length - 1);

      if (avgDaysBetween > 5) {
        result.push({
          type: 'consistency',
          title: 'Increase Frequency',
          message: `You're averaging ${avgDaysBetween.toFixed(1)} days between workouts. For optimal gains, aim for 3-4 sessions per week.`,
          priority: 'high',
        });
      } else if (avgDaysBetween < 2) {
        result.push({
          type: 'consistency',
          title: 'Recovery Matters',
          message: `You're training every ${avgDaysBetween.toFixed(1)} days. Make sure you're getting adequate rest for muscle recovery.`,
          priority: 'medium',
        });
      }
    }

    // Category balance analysis
    const categoryCounts: Record<string, number> = {};
    workouts.forEach(w => {
      w.exercises.forEach(e => {
        categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
      });
    });

    const totalExercises = Object.values(categoryCounts).reduce((a, b) => a + b, 0);
    const upperBody = (categoryCounts['Upper Body'] || 0) / totalExercises;
    const lowerBody = (categoryCounts['Lower Body'] || 0) / totalExercises;
    const back = (categoryCounts['Back'] || 0) / totalExercises;

    if (lowerBody < 0.2) {
      result.push({
        type: 'balance',
        title: 'More Leg Work',
        message: `Only ${(lowerBody * 100).toFixed(0)}% of your exercises target legs. For functional strength and aesthetics, aim for 30-40% lower body work.`,
        priority: 'high',
      });
    }

    if (back < 0.15) {
      result.push({
        type: 'balance',
        title: 'Strengthen Your Back',
        message: `Back exercises are only ${(back * 100).toFixed(0)}% of your training. A strong back improves posture and overall strength.`,
        priority: 'medium',
      });
    }

    // Progressive overload check
    const exerciseProgress: Record<string, { first: number; last: number; name: string }> = {};
    sortedWorkouts.reverse().forEach(w => {
      w.exercises.forEach(e => {
        const maxWeight = Math.max(...e.sets.map(s => s.weight));
        if (maxWeight > 0) {
          if (!exerciseProgress[e.normalizedName]) {
            exerciseProgress[e.normalizedName] = { first: maxWeight, last: maxWeight, name: e.normalizedName };
          } else {
            exerciseProgress[e.normalizedName].last = maxWeight;
          }
        }
      });
    });

    const progressingExercises = Object.values(exerciseProgress).filter(p => p.last > p.first);
    const stagnantExercises = Object.values(exerciseProgress).filter(p => p.last <= p.first && p.first > 0);

    if (progressingExercises.length > 0) {
      result.push({
        type: 'strength',
        title: 'Progressive Overload',
        message: `Great progress on ${progressingExercises.slice(0, 3).map(p => p.name).join(', ')}! Keep pushing.`,
        priority: 'low',
      });
    }

    if (stagnantExercises.length > 3) {
      result.push({
        type: 'strength',
        title: 'Break Through Plateaus',
        message: `Weight hasn't increased on ${stagnantExercises.length} exercises. Try varying rep ranges or adding intensity techniques.`,
        priority: 'medium',
      });
    }

    // Body composition insights
    if (inBodyEntries.length >= 2) {
      const sorted = [...inBodyEntries].sort((a, b) => a.date.getTime() - b.date.getTime());
      const first = sorted[0];
      const last = sorted[sorted.length - 1];

      const muscleChange = last.muscleMass - first.muscleMass;
      const fatChange = (last.bodyFatMass || last.weight * last.bodyFatPercentage / 100) -
                       (first.bodyFatMass || first.weight * first.bodyFatPercentage / 100);

      if (muscleChange > 0 && fatChange < 0) {
        result.push({
          type: 'body',
          title: 'Recomposition Success',
          message: `You've gained ${muscleChange.toFixed(1)} lbs muscle and lost ${Math.abs(fatChange).toFixed(1)} lbs fat. Textbook recomp!`,
          priority: 'low',
        });
      }
    }

    return result;
  }, [workouts, inBodyEntries]);

  const priorityColors = {
    high: 'border-l-red-400',
    medium: 'border-l-amber-400',
    low: 'border-l-green-400',
  };

  const typeIcons = {
    strength: '💪',
    consistency: '📅',
    balance: '⚖️',
    body: '📊',
    tip: '💡',
  };

  const categoryColors: Record<string, string> = {
    'Upper Body': 'bg-blue-100 text-blue-700',
    'Lower Body': 'bg-green-100 text-green-700',
    'Back': 'bg-purple-100 text-purple-700',
    'Core': 'bg-orange-100 text-orange-700',
    'Cardio': 'bg-red-100 text-red-700',
  };

  const formatDaysAgo = (date: Date | null) => {
    if (!date) return 'Never';
    const days = differenceInDays(new Date(), date);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
  };

  const assessmentColors: Record<string, string> = {
    pr: 'bg-green-100 text-green-700 border-green-200',
    good: 'bg-blue-100 text-blue-700 border-blue-200',
    same: 'bg-gray-100 text-gray-600 border-gray-200',
    down: 'bg-amber-100 text-amber-700 border-amber-200',
    new: 'bg-purple-100 text-purple-700 border-purple-200',
  };

  const assessmentLabels: Record<string, string> = {
    pr: '🏆 PR',
    good: '✅ Good',
    same: '➡️ Same',
    down: '📉 Light',
    new: '🆕 New',
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
                <p className="text-xs sm:text-sm font-light text-gray-400 mt-1">
                  {format(lastWorkoutBreakdown.date, 'EEEE, MMMM d, yyyy')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{lastWorkoutBreakdown.overallEmoji}</span>
                {lastWorkoutBreakdown.prCount > 0 && (
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                    {lastWorkoutBreakdown.prCount} PR{lastWorkoutBreakdown.prCount > 1 ? 's' : ''}!
                  </span>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Overall Stats */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              <div className="text-center p-2 bg-gray-50 rounded-lg">
                <p className="text-lg font-semibold text-gray-800">{lastWorkoutBreakdown.exerciseCount}</p>
                <p className="text-xs text-gray-400">Exercises</p>
              </div>
              <div className="text-center p-2 bg-gray-50 rounded-lg">
                <p className="text-lg font-semibold text-gray-800">{lastWorkoutBreakdown.totalSets}</p>
                <p className="text-xs text-gray-400">Sets</p>
              </div>
              <div className="text-center p-2 bg-gray-50 rounded-lg">
                <p className="text-lg font-semibold text-gray-800">{lastWorkoutBreakdown.totalReps}</p>
                <p className="text-xs text-gray-400">Reps</p>
              </div>
              <div className="text-center p-2 bg-gray-50 rounded-lg">
                <p className="text-lg font-semibold text-gray-800">{(lastWorkoutBreakdown.totalVolume / 1000).toFixed(1)}k</p>
                <p className="text-xs text-gray-400">Volume</p>
              </div>
            </div>

            {/* Overall Assessment */}
            <div className="p-3 bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg mb-4">
              <p className="text-sm text-gray-700">{lastWorkoutBreakdown.overallAssessment}</p>
            </div>

            {/* Exercise by Exercise Breakdown */}
            <div className="space-y-3">
              {lastWorkoutBreakdown.exercises.map((exercise, i) => (
                <div
                  key={i}
                  className="p-3 border border-gray-100 rounded-lg"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${categoryColors[exercise.category] || 'bg-gray-100 text-gray-600'}`}>
                        {exercise.category}
                      </span>
                      <h4 className="font-medium text-gray-800 text-sm">{exercise.name}</h4>
                    </div>
                    <span className={`px-2 py-0.5 text-xs rounded-full border ${assessmentColors[exercise.assessment]}`}>
                      {assessmentLabels[exercise.assessment]}
                    </span>
                  </div>

                  {/* Sets Detail */}
                  <div className="flex flex-wrap gap-2 mb-2">
                    {exercise.setsDetail.map((set, j) => (
                      <span key={j} className="px-2 py-1 bg-gray-50 rounded text-xs text-gray-600">
                        {set.reps} × {set.weight} lbs
                      </span>
                    ))}
                  </div>

                  {/* Comparison with Previous Session */}
                  {exercise.timesPerformed > 0 && (
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 p-2 bg-gray-50 rounded-lg mb-2">
                      <div className="flex-1 flex items-center justify-between sm:justify-start sm:gap-2">
                        <span className="text-xs text-gray-400">Last time:</span>
                        <span className="text-xs text-gray-600">
                          {exercise.lastSessionMax} lbs × {exercise.lastSessionReps} reps
                        </span>
                      </div>
                      <div className="flex-1 flex items-center justify-between sm:justify-start sm:gap-2">
                        <span className="text-xs text-gray-400">This time:</span>
                        <span className="text-xs font-medium text-gray-700">
                          {exercise.maxWeight} lbs × {exercise.reps} reps
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {exercise.weightDelta !== 0 && (
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                            exercise.weightDelta > 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {exercise.weightDelta > 0 ? '+' : ''}{exercise.weightDelta} lbs
                          </span>
                        )}
                        {exercise.repsDelta !== 0 && (
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                            exercise.repsDelta > 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {exercise.repsDelta > 0 ? '+' : ''}{exercise.repsDelta} reps
                          </span>
                        )}
                        {exercise.weightDelta === 0 && exercise.repsDelta === 0 && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                            Same
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* All-time PR indicator */}
                  {exercise.timesPerformed > 0 && exercise.maxWeight >= exercise.allTimePR && exercise.allTimePR > 0 && (
                    <div className="flex items-center gap-1 mb-2">
                      <span className="text-xs text-green-600 font-medium">
                        🏆 All-time PR: {exercise.allTimePR} lbs
                      </span>
                    </div>
                  )}

                  {/* Summary Stats */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">
                      {exercise.sets} sets • {exercise.reps} total reps • {(exercise.volume / 1000).toFixed(1)}k volume
                    </span>
                    <span className="text-gray-300">
                      {exercise.timesPerformed > 0 ? `Performed ${exercise.timesPerformed + 1}x` : ''}
                    </span>
                  </div>
                  <p className={`text-xs mt-1 ${exercise.assessment === 'pr' ? 'text-green-600' : exercise.assessment === 'down' ? 'text-amber-600' : 'text-gray-500'}`}>
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
          <div>
            <CardTitle>Next Workout Targets</CardTitle>
            <p className="text-xs sm:text-sm font-light text-gray-400 mt-1">
              Specific exercises and weights to aim for today
            </p>
          </div>
        </CardHeader>
        <CardContent>
          {suggestedWorkout.length === 0 ? (
            <p className="text-gray-400 font-light text-center py-4">
              Log some workouts to get personalized targets
            </p>
          ) : (
            <div className="space-y-4">
              {suggestedWorkout.map((target, i) => (
                <div
                  key={i}
                  className="p-4 bg-white border border-gray-100 rounded-xl hover:border-gray-200 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-xs rounded-full ${categoryColors[target.category] || 'bg-gray-100 text-gray-600'}`}>
                        {target.category}
                      </span>
                      <h4 className="font-medium text-gray-800">{target.name}</h4>
                    </div>
                    <span className="text-xs text-gray-400">
                      {formatDaysAgo(target.lastPerformed)}
                    </span>
                  </div>

                  {/* Current vs Goal comparison */}
                  <div className="flex items-center gap-2 sm:gap-4">
                    {/* Current */}
                    <div className="flex-1 p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Current</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl sm:text-2xl font-bold text-gray-600">{target.currentWeight}</span>
                        <span className="text-xs text-gray-400">lbs</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        {target.currentSets} × {target.currentReps} reps
                      </p>
                    </div>

                    {/* Arrow */}
                    <div className="flex-shrink-0">
                      <span className={`text-2xl ${target.trend === 'up' ? 'text-green-500' : 'text-gray-300'}`}>
                        →
                      </span>
                    </div>

                    {/* Goal */}
                    <div className={`flex-1 p-3 rounded-lg ${target.trend === 'up' ? 'bg-green-50 border border-green-100' : 'bg-blue-50 border border-blue-100'}`}>
                      <p className={`text-xs uppercase tracking-wide mb-2 ${target.trend === 'up' ? 'text-green-600' : 'text-blue-600'}`}>Goal</p>
                      <div className="flex items-baseline gap-1">
                        <span className={`text-xl sm:text-2xl font-bold ${target.trend === 'up' ? 'text-green-700' : 'text-blue-700'}`}>
                          {target.targetWeight}
                        </span>
                        <span className={`text-xs ${target.trend === 'up' ? 'text-green-500' : 'text-blue-500'}`}>lbs</span>
                        {target.trend === 'up' && (
                          <span className="text-green-500 text-sm ml-1">↑</span>
                        )}
                      </div>
                      <p className={`text-xs mt-1 ${target.trend === 'up' ? 'text-green-500' : 'text-blue-500'}`}>
                        {target.targetSets} × {target.targetReps} reps
                      </p>
                    </div>
                  </div>

                  {/* Notes */}
                  {target.notes && (
                    <p className={`text-xs mt-3 ${target.trend === 'up' ? 'text-green-600' : 'text-amber-600'}`}>
                      💡 {target.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* All Exercise PRs and Targets */}
      <Card>
        <CardHeader>
          <CardTitle>All Exercise Targets</CardTitle>
          <p className="text-xs sm:text-sm font-light text-gray-400 mt-1">
            Your current performance vs what to aim for next
          </p>
        </CardHeader>
        <CardContent>
          {exerciseTargets.length === 0 ? (
            <p className="text-gray-400 font-light text-center py-4">
              No exercise history yet
            </p>
          ) : (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-3 text-xs font-medium text-gray-400 uppercase">Exercise</th>
                    <th className="text-center py-2 px-2 text-xs font-medium text-gray-400 uppercase">
                      <span className="hidden sm:inline">Current</span>
                      <span className="sm:hidden">Now</span>
                    </th>
                    <th className="text-center py-2 px-2 text-xs font-medium text-gray-400 uppercase">Goal</th>
                    <th className="text-center py-2 px-2 text-xs font-medium text-gray-400 uppercase hidden sm:table-cell">Target Sets × Reps</th>
                  </tr>
                </thead>
                <tbody>
                  {exerciseTargets.slice(0, 20).map((target, i) => (
                    <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-3 px-3">
                        <div className="font-medium text-gray-700">{target.name}</div>
                        <div className="text-xs text-gray-400">{target.category}</div>
                        <div className="text-xs text-gray-300 sm:hidden mt-1">
                          {target.currentSets}×{target.currentReps} → {target.targetSets}×{target.targetReps}
                        </div>
                      </td>
                      <td className="text-center py-3 px-2">
                        <div className="text-gray-600 font-medium">{target.currentWeight}</div>
                        <div className="text-xs text-gray-400">lbs</div>
                      </td>
                      <td className="text-center py-3 px-2">
                        <div className={`font-bold ${target.trend === 'up' ? 'text-green-600' : 'text-blue-600'}`}>
                          {target.targetWeight}
                          {target.trend === 'up' && <span className="text-green-500 ml-1 text-sm">↑</span>}
                        </div>
                        <div className={`text-xs ${target.trend === 'up' ? 'text-green-500' : 'text-blue-500'}`}>
                          {target.targetWeight > target.currentWeight ? `+${target.targetWeight - target.currentWeight}` : 'lbs'}
                        </div>
                      </td>
                      <td className="text-center py-3 px-2 text-gray-500 hidden sm:table-cell">
                        <span className="text-gray-400">{target.currentSets}×{target.currentReps}</span>
                        <span className="mx-1 text-gray-300">→</span>
                        <span className="font-medium text-gray-600">{target.targetSets}×{target.targetReps}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {exerciseTargets.length > 20 && (
                <p className="text-xs text-gray-400 text-center mt-2 px-3">
                  Showing top 20 of {exerciseTargets.length} exercises
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Training Insights */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Training Insights</CardTitle>
            <p className="text-xs sm:text-sm font-light text-gray-400 mt-1">
              Personalized recommendations based on your data
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {insights.map((insight, i) => (
              <div
                key={i}
                className={`p-4 bg-gray-50 rounded-lg border-l-4 ${priorityColors[insight.priority]}`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span>{typeIcons[insight.type]}</span>
                  <h4 className="font-medium text-gray-700">{insight.title}</h4>
                </div>
                <p className="text-sm text-gray-500 font-light">{insight.message}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
