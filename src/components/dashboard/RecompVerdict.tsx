'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { InBodyEntry } from '@/types';

interface RecompInsight {
  verdict: string;
  status: 'on_track' | 'needs_adjustment' | 'insufficient_data';
  rate_analysis: string;
  belly_fat_take: string;
  strength_take: string;
  actions: string[];
  logging_note?: string;
  context: {
    inBody: {
      latest: { date: string; weight: number; bodyFatPercentage: number; muscleMass: number; bodyFatMass?: number };
      prior: { date: string } | null;
      daysBetween: number | null;
      deltas: { weight: number; muscleMass: number; bodyFatPercentage: number; bodyFatMass: number | null } | null;
    };
    workouts: { sessionCount: number; avgDaysBetween: number | null };
    food: { daysLogged: number; avgCalories: number; avgProtein: number };
  };
}

const statusStyles: Record<RecompInsight['status'], { border: string; text: string; label: string }> = {
  on_track: { border: 'border-l-n-success', text: 'text-n-success', label: 'ON TRACK' },
  needs_adjustment: { border: 'border-l-n-warning', text: 'text-n-warning', label: 'NEEDS ADJUSTMENT' },
  insufficient_data: { border: 'border-l-n-text-disabled', text: 'text-n-text-disabled', label: 'INSUFFICIENT DATA' },
};

export function RecompVerdict({ inBodyEntries }: { inBodyEntries: InBodyEntry[] }) {
  const [data, setData] = useState<RecompInsight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current || inBodyEntries.length === 0) return;
    fetchedRef.current = true;

    const payload = {
      goal: 'Reduce belly fat while progressively increasing weight lifted (body recomposition).',
      inBodyEntries: inBodyEntries.map(e => ({
        date: e.date instanceof Date ? e.date.toISOString().slice(0, 10) : e.date,
        weight: e.weight,
        bodyFatPercentage: e.bodyFatPercentage,
        muscleMass: e.muscleMass,
        bodyFatMass: e.bodyFatMass,
        bmi: e.bmi,
        visceralFat: e.visceralFat,
        visceralFatArea: e.visceralFatArea,
        trunkFatMass: e.trunkFatMass,
        basalMetabolicRate: e.basalMetabolicRate,
      })),
    };

    fetch('/api/recomp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(r => r.json())
      .then(json => {
        if (json.error) setError(json.error);
        else setData(json);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [inBodyEntries]);

  if (inBodyEntries.length === 0) return null;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recomp Verdict</CardTitle>
          <p className="text-xs text-n-text-disabled mt-1">AI-analyzed progress toward your goal</p>
        </CardHeader>
        <CardContent>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-n-text-disabled text-center py-8">
            [ANALYZING RECOMP PROGRESS...]
          </p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recomp Verdict</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-n-accent text-center py-4">
            [ERROR: {error.toUpperCase()}]
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const style = statusStyles[data.status];
  const deltas = data.context.inBody.deltas;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
          <div>
            <CardTitle>Recomp Verdict</CardTitle>
            <p className="text-xs text-n-text-disabled mt-1">
              Goal: reduce belly fat, progressive overload
            </p>
          </div>
          <span className={`font-mono text-[10px] uppercase tracking-[0.06em] px-3 py-1 border rounded-pill ${style.text} border-current`}>
            {style.label}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {/* One-line verdict */}
        <div className={`p-4 border-l-2 ${style.border} bg-n-surface-raised rounded-nothing-sm mb-4`}>
          <p className="text-sm text-n-text-primary">{data.verdict}</p>
        </div>

        {/* Deltas snapshot */}
        {deltas && data.context.inBody.prior && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: 'WEIGHT', value: deltas.weight, unit: 'lb', goodDir: 0 },
              { label: 'MUSCLE', value: deltas.muscleMass, unit: 'lb', goodDir: 1 },
              { label: 'BODY FAT', value: deltas.bodyFatPercentage, unit: '%', goodDir: -1 },
            ].map(m => {
              const isGood = m.goodDir === 0 ? true : m.goodDir > 0 ? m.value > 0 : m.value < 0;
              const color = m.value === 0 ? 'text-n-text-secondary' : isGood ? 'text-n-success' : 'text-n-warning';
              return (
                <div key={m.label} className="text-center p-3 bg-n-surface-raised rounded-nothing-sm">
                  <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-n-text-disabled mb-1">{m.label}</p>
                  <p className={`font-mono text-lg ${color}`}>
                    {m.value > 0 ? '+' : ''}{m.value}<span className="text-[10px] ml-0.5">{m.unit}</span>
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Rate analysis */}
        <div className="space-y-3 mb-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-disabled mb-1">RATE OF CHANGE</p>
            <p className="text-sm text-n-text-secondary leading-relaxed">{data.rate_analysis}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-disabled mb-1">BELLY FAT TRAJECTORY</p>
            <p className="text-sm text-n-text-secondary leading-relaxed">{data.belly_fat_take}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-disabled mb-1">PROGRESSIVE OVERLOAD</p>
            <p className="text-sm text-n-text-secondary leading-relaxed">{data.strength_take}</p>
          </div>
        </div>

        {/* Actions */}
        {data.actions && data.actions.length > 0 && (
          <div className="border-t border-n-border pt-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-disabled mb-2">DO NEXT</p>
            <ul className="space-y-2">
              {data.actions.map((a, i) => (
                <li key={i} className="flex gap-2 text-sm text-n-text-primary">
                  <span className="font-mono text-n-accent">→</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Logging warning */}
        {data.logging_note && (
          <div className="mt-4 p-3 border border-n-warning rounded-nothing-sm">
            <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-n-warning">{data.logging_note}</p>
          </div>
        )}

        {/* Data footprint */}
        <p className="font-mono text-[9px] uppercase tracking-[0.06em] text-n-text-disabled mt-4">
          Based on: {data.context.workouts.sessionCount} workouts
          {data.context.workouts.avgDaysBetween ? ` (${data.context.workouts.avgDaysBetween}d apart)` : ''}
          {' · '}{data.context.food.daysLogged} food days
          {data.context.food.avgProtein ? ` (avg ${data.context.food.avgProtein}g protein)` : ''}
          {data.context.inBody.daysBetween != null ? ` · InBody ${data.context.inBody.daysBetween}d gap` : ''}
        </p>
      </CardContent>
    </Card>
  );
}
