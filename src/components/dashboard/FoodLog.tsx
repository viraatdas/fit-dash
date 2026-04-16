'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { FoodDay, NutrientInfo } from '@/types';

function NutrientBar({ label, value, unit, max, color }: { label: string; value: number; unit: string; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-disabled">{label}</span>
        <span className="font-mono text-[11px] text-n-text-secondary">{value}{unit}</span>
      </div>
      <div className="h-1.5 bg-n-surface-raised rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DayCard({ day }: { day: FoodDay }) {
  const [expanded, setExpanded] = useState(false);
  const dateStr = new Date(day.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <Card>
      <CardHeader>
        <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between">
          <CardTitle>{dateStr}</CardTitle>
          <div className="flex items-center gap-4">
            <span className="font-mono text-sm text-n-text-display">{day.totals.calories} cal</span>
            <span className="font-mono text-[10px] text-n-text-disabled">{expanded ? '▲' : '▼'}</span>
          </div>
        </button>
      </CardHeader>
      <CardContent>
        {/* Macro summary — always visible */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          {([
            ['Protein', day.totals.protein, 'g', 'text-n-accent'],
            ['Carbs', day.totals.carbs, 'g', 'text-n-warning'],
            ['Fat', day.totals.fat, 'g', 'text-n-text-secondary'],
            ['Fiber', day.totals.fiber, 'g', 'text-n-success'],
          ] as const).map(([label, value, unit, color]) => (
            <div key={label} className="text-center p-2 bg-n-surface-raised rounded-nothing-xs">
              <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-n-text-disabled mb-1">{label}</p>
              <p className={`font-mono text-lg ${color}`}>{value}<span className="text-[10px] ml-0.5">{unit}</span></p>
            </div>
          ))}
        </div>

        {expanded && (
          <div className="space-y-4">
            {/* Nutrient bars */}
            <div className="space-y-2 px-1">
              <NutrientBar label="Calories" value={day.totals.calories} unit=" kcal" max={2500} color="bg-n-text-display" />
              <NutrientBar label="Protein" value={day.totals.protein} unit="g" max={180} color="bg-n-accent" />
              <NutrientBar label="Carbs" value={day.totals.carbs} unit="g" max={300} color="bg-yellow-500" />
              <NutrientBar label="Fat" value={day.totals.fat} unit="g" max={100} color="bg-n-text-secondary" />
              <NutrientBar label="Fiber" value={day.totals.fiber} unit="g" max={35} color="bg-green-500" />
              {day.totals.sugar != null && day.totals.sugar > 0 && (
                <NutrientBar label="Sugar" value={day.totals.sugar} unit="g" max={50} color="bg-orange-400" />
              )}
              {day.totals.sodium != null && day.totals.sodium > 0 && (
                <NutrientBar label="Sodium" value={day.totals.sodium} unit="mg" max={2300} color="bg-blue-400" />
              )}
            </div>

            {/* Individual items */}
            <div className="border-t border-n-border pt-3 space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-disabled mb-2">Items</p>
              {day.items.map((item, i) => (
                <div key={i} className="flex justify-between items-center px-3 py-2 bg-n-surface-raised rounded-nothing-xs">
                  <span className="text-sm text-n-text-secondary">{item.description}</span>
                  <div className="flex gap-3 font-mono text-[10px] text-n-text-disabled shrink-0 ml-4">
                    <span>{item.nutrients.calories}cal</span>
                    <span>{item.nutrients.protein}p</span>
                    <span>{item.nutrients.carbs}c</span>
                    <span>{item.nutrients.fat}f</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WeeklyAverage({ days }: { days: FoodDay[] }) {
  if (days.length === 0) return null;

  const avg: NutrientInfo = {
    calories: Math.round(days.reduce((s, d) => s + d.totals.calories, 0) / days.length),
    protein: Math.round(days.reduce((s, d) => s + d.totals.protein, 0) / days.length),
    carbs: Math.round(days.reduce((s, d) => s + d.totals.carbs, 0) / days.length),
    fat: Math.round(days.reduce((s, d) => s + d.totals.fat, 0) / days.length),
    fiber: Math.round(days.reduce((s, d) => s + d.totals.fiber, 0) / days.length),
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily Average</CardTitle>
        <p className="text-xs text-n-text-disabled mt-1">Across {days.length} logged day{days.length > 1 ? 's' : ''}</p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-5 gap-2">
          {([
            ['Calories', avg.calories, 'kcal'],
            ['Protein', avg.protein, 'g'],
            ['Carbs', avg.carbs, 'g'],
            ['Fat', avg.fat, 'g'],
            ['Fiber', avg.fiber, 'g'],
          ] as const).map(([label, value, unit]) => (
            <div key={label} className="text-center p-3 border border-n-border-visible rounded-nothing-sm">
              <p className="font-mono text-[9px] uppercase tracking-[0.08em] text-n-text-disabled mb-2">{label}</p>
              <p className="font-mono text-xl text-n-text-display">{value}</p>
              <p className="font-mono text-[9px] text-n-text-disabled mt-1">{unit}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function FoodLog() {
  const [foodDays, setFoodDays] = useState<FoodDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    fetch('/api/food')
      .then(res => res.json())
      .then(result => {
        if (result.success && result.data) {
          setFoodDays(result.data);
        } else if (result.error) {
          setError(result.error);
        }
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-n-text-disabled text-center py-8">[LOADING FOOD LOG...]</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-n-accent text-center py-8">[ERROR: {error.toUpperCase()}]</p>
        </CardContent>
      </Card>
    );
  }

  if (foodDays.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-n-text-disabled text-center py-8">[NO FOOD ENTRIES LOGGED YET]</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <WeeklyAverage days={foodDays} />
      {foodDays.map(day => (
        <DayCard key={day.date} day={day} />
      ))}
    </div>
  );
}
