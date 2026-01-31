'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/ui';
import { Workout, InBodyEntry } from '@/types';
import { format, differenceInDays } from 'date-fns';

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

interface AIInsight {
  analysis: string;
  recommendations: string[];
  focus_areas: string[];
}

export function Insights({ workouts, inBodyEntries }: InsightsProps) {
  const [aiInsights, setAiInsights] = useState<AIInsight | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const fetchAIInsights = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workouts: workouts.slice(0, 20).map(w => ({
            date: format(w.date, 'yyyy-MM-dd'),
            exercises: w.exercises.map(e => ({
              name: e.normalizedName,
              category: e.category,
              sets: e.sets,
            })),
          })),
          inBody: inBodyEntries.map(e => ({
            date: format(e.date, 'yyyy-MM-dd'),
            weight: e.weight,
            bodyFat: e.bodyFatPercentage,
            muscle: e.muscleMass,
          })),
        }),
      });

      if (!response.ok) throw new Error('Failed to get AI insights');

      const data = await response.json();
      setAiInsights(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze');
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>Training Insights</CardTitle>
              <p className="text-sm font-light text-gray-400 mt-1">
                Personalized recommendations based on your data
              </p>
            </div>
            <Button
              onClick={fetchAIInsights}
              disabled={loading}
              variant="outline"
              size="sm"
            >
              {loading ? 'Analyzing...' : '✨ AI Analysis'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="text-red-500 text-sm mb-4">{error}</p>
          )}

          {aiInsights && (
            <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-green-50 rounded-xl border border-blue-100">
              <h4 className="font-medium text-gray-700 mb-2">AI Analysis</h4>
              <p className="text-sm text-gray-600 font-light mb-4">{aiInsights.analysis}</p>

              {aiInsights.focus_areas.length > 0 && (
                <div className="mb-3">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Focus Areas</span>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {aiInsights.focus_areas.map((area, i) => (
                      <span key={i} className="px-2 py-1 bg-white rounded-full text-xs text-gray-600 border">
                        {area}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {aiInsights.recommendations.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Recommendations</span>
                  <ul className="mt-2 space-y-2">
                    {aiInsights.recommendations.map((rec, i) => (
                      <li key={i} className="text-sm text-gray-600 font-light flex items-start gap-2">
                        <span className="text-green-500 mt-0.5">→</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

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
