'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';

interface Recommendation {
  exercise: string;
  reason: string;
  replaces_or_complements: string;
  priority: 'high' | 'medium' | 'low';
}

interface AdviceData {
  current_assessment: string;
  gaps: string[];
  recommendations: Recommendation[];
}

export function ExerciseAdvice() {
  const [data, setData] = useState<AdviceData | null>(null);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    fetch('/api/advice')
      .then(res => res.ok ? res.json() : null)
      .then(result => {
        if (result?.recommendations) setData(result);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const priorityStyles: Record<string, string> = {
    high: 'border-l-2 border-l-n-accent',
    medium: 'border-l-2 border-l-n-warning',
    low: 'border-l-2 border-l-n-success',
  };

  const priorityLabels: Record<string, string> = { high: 'HIGH', medium: 'MED', low: 'LOW' };
  const priorityColors: Record<string, string> = { high: 'text-n-accent', medium: 'text-n-warning', low: 'text-n-success' };

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle>Exercise Recommendations</CardTitle></CardHeader>
        <CardContent>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-n-text-disabled text-center py-4">[LOADING...]</p>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Exercise Recommendations</CardTitle>
        <p className="text-xs text-n-text-disabled mt-1">Based on your current routine</p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="px-4 py-3 border border-n-border-visible rounded-nothing-sm">
            <p className="text-sm text-n-text-secondary">{data.current_assessment}</p>
          </div>

          {data.gaps.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {data.gaps.map((gap, i) => (
                <span key={i} className="font-mono text-[10px] uppercase tracking-[0.06em] px-3 py-1 border border-n-accent text-n-accent rounded-pill">
                  {gap}
                </span>
              ))}
            </div>
          )}

          <div className="space-y-3">
            {data.recommendations.map((rec, i) => (
              <div key={i} className={`p-4 bg-n-surface-raised rounded-nothing-sm ${priorityStyles[rec.priority]}`}>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm text-n-text-display">{rec.exercise}</h4>
                  <span className={`font-mono text-[10px] uppercase tracking-[0.08em] ${priorityColors[rec.priority]}`}>
                    {priorityLabels[rec.priority]}
                  </span>
                </div>
                <p className="text-sm text-n-text-secondary mb-2">{rec.reason}</p>
                <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-n-text-disabled">
                  Complements: {rec.replaces_or_complements}
                </p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
