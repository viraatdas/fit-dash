'use client';

import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { Card, CardContent } from '@/components/ui';
import { DailyHealth, InBodyEntry } from '@/types';
import { computeRecovery } from '@/lib/health/recovery';
import { getDefaultDexaEntry } from '@/lib/storage';
import { todayKey, laDayKey, daysBetweenKeys } from '@/lib/la-week';

interface RecoveryHeroProps {
  /** Newest-first, same convention as /api/health and computeRecovery(). */
  healthData: DailyHealth[];
  latestInBody: InBodyEntry | null;
}

// Plain-language call to action per recovery.ts's verdict label.
const CALL_BY_LABEL: Record<string, string> = {
  'Primed': 'Train hard',
  'Good to go': 'Train normally',
  'Fair': 'Go easy',
  'Rest up': 'Rest or light day',
};

const SCORE_COLOR = {
  none: 'text-n-text-disabled',
  primed: 'text-n-success',
  good: 'text-n-interactive',
  fair: 'text-n-warning',
  rest: 'text-n-accent',
} as const;

function scoreBand(score: number | null): keyof typeof SCORE_COLOR {
  if (score === null) return 'none';
  if (score >= 80) return 'primed';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'rest';
}

export function RecoveryHero({ healthData, latestInBody }: RecoveryHeroProps) {
  const recovery = useMemo(() => computeRecovery(healthData), [healthData]);
  const color = SCORE_COLOR[scoreBand(recovery.score)];
  const call = CALL_BY_LABEL[recovery.label] ?? null;

  const latestDay = healthData.length > 0 ? healthData[0] : null;
  // "Stale" = older than yesterday (LA calendar days) — yesterday itself is fine.
  const isStale = latestDay ? daysBetweenKeys(todayKey(), laDayKey(latestDay.date)) > 1 : false;

  // Body Fat must render correctly on the very first paint (server + client),
  // with no pop-in once `latestInBody` loads from localStorage post-mount —
  // seed from the known default (DEXA, 24.2%) so the common case never changes
  // visually across that transition; it only reconciles if the user's own
  // browser data actually differs.
  const bodyFat = latestInBody ?? getDefaultDexaEntry();
  const isDexaUnknownDate = bodyFat.source === 'dexa' && bodyFat.dateUnknown;
  const bodyFatSubtext = isDexaUnknownDate
    ? 'DEXA · date unknown'
    : bodyFat.source === 'dexa'
    ? `DEXA · ${format(bodyFat.date, 'MMM d, yyyy')}`
    : format(bodyFat.date, 'MMM d, yyyy');

  return (
    <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-stretch">
      <Card className="flex-1 min-w-0">
        <CardContent className="py-5 sm:py-6 px-4 sm:px-8">
          <div className="flex items-baseline gap-3 sm:gap-4 flex-wrap">
            <p className={`text-4xl sm:text-6xl font-mono tracking-tight ${color}`}>{recovery.score ?? '–'}</p>
            <div>
              <p className={`font-mono text-sm sm:text-base uppercase tracking-[0.08em] ${color}`}>{recovery.label}</p>
              {call && <p className="text-n-text-primary text-sm sm:text-base mt-0.5">{call}</p>}
            </div>
          </div>

          {recovery.score === null ? (
            <p className="font-mono text-xs text-n-text-disabled uppercase tracking-[0.04em] mt-4">
              [NOT ENOUGH DATA — SYNC 2+ DAYS WITH HR + HRV]
            </p>
          ) : (
            <div className="flex flex-col sm:flex-row flex-wrap gap-x-6 gap-y-1.5 mt-4">
              <p className="font-mono text-xs sm:text-sm text-n-text-secondary">
                Resting HR {recovery.restingHr} bpm ·{' '}
                <span className={recovery.restingHrDelta !== null && recovery.restingHrDelta <= 0 ? 'text-n-success' : 'text-n-warning'}>
                  {recovery.restingHrDelta !== null && recovery.restingHrDelta > 0 ? '+' : ''}
                  {recovery.restingHrDelta} vs 7-day baseline
                </span>
              </p>
              <p className="font-mono text-xs sm:text-sm text-n-text-secondary">
                HRV {recovery.hrv} ms ·{' '}
                <span className={recovery.hrvDeltaPct !== null && recovery.hrvDeltaPct >= 0 ? 'text-n-success' : 'text-n-warning'}>
                  {recovery.hrvDeltaPct !== null && recovery.hrvDeltaPct > 0 ? '+' : ''}
                  {recovery.hrvDeltaPct}% vs 7-day baseline
                </span>
              </p>
            </div>
          )}

          {latestDay && (
            <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-n-text-disabled mt-4 flex items-center gap-2">
              as of {format(parseISO(latestDay.date), 'MMM d, yyyy')}
              {isStale && (
                <span className="px-1.5 py-0.5 border border-n-warning text-n-warning rounded-pill normal-case tracking-normal">stale</span>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="sm:w-44 shrink-0">
        <CardContent className="text-center py-4 sm:py-5 px-3 sm:px-4 h-full flex flex-col justify-center">
          <p className="text-3xl sm:text-4xl font-mono text-n-text-display tracking-tight">{bodyFat.bodyFatPercentage}%</p>
          <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-secondary mt-1">Body Fat</p>
          <p className="font-mono text-[9px] text-n-text-disabled mt-1">{bodyFatSubtext}</p>
        </CardContent>
      </Card>
    </div>
  );
}
