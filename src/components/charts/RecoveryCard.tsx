'use client';

import { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { DailyHealth } from '@/types';
import { computeRecovery } from '@/lib/health/recovery';

interface RecoveryCardProps {
  data: DailyHealth[];
}

export function RecoveryCard({ data }: RecoveryCardProps) {
  const recovery = useMemo(() => computeRecovery(data), [data]);

  const scoreColor =
    recovery.score === null ? 'text-n-text-disabled' :
    recovery.score >= 80 ? 'text-n-success' :
    recovery.score >= 60 ? 'text-n-interactive' :
    recovery.score >= 40 ? 'text-n-warning' : 'text-n-accent';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recovery</CardTitle>
        <p className="text-xs text-n-text-disabled mt-1">
          Rest score from resting heart rate + HRV vs your 7-day baseline
        </p>
      </CardHeader>
      <CardContent>
        {recovery.score === null ? (
          <p className="font-mono text-xs text-n-text-disabled uppercase tracking-[0.04em]">
            [NOT ENOUGH DATA — SYNC 2+ DAYS WITH HR + HRV]
          </p>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
            <div className="text-center sm:text-left">
              <p className={`text-4xl sm:text-5xl font-mono tracking-tight ${scoreColor}`}>
                {recovery.score}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-secondary mt-1">
                {recovery.label}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4 flex-1">
              <div>
                <p className="text-xl font-mono text-n-text-primary">
                  {recovery.restingHr}
                  <span className="text-xs text-n-text-disabled ml-1">bpm</span>
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-secondary mt-1">
                  Resting HR{' '}
                  <span className={recovery.restingHrDelta !== null && recovery.restingHrDelta <= 0 ? 'text-n-success' : 'text-n-accent'}>
                    {recovery.restingHrDelta !== null && recovery.restingHrDelta > 0 ? '+' : ''}
                    {recovery.restingHrDelta} vs base
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xl font-mono text-n-text-primary">
                  {recovery.hrv}
                  <span className="text-xs text-n-text-disabled ml-1">ms</span>
                </p>
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-secondary mt-1">
                  HRV{' '}
                  <span className={recovery.hrvDeltaPct !== null && recovery.hrvDeltaPct >= 0 ? 'text-n-success' : 'text-n-accent'}>
                    {recovery.hrvDeltaPct !== null && recovery.hrvDeltaPct > 0 ? '+' : ''}
                    {recovery.hrvDeltaPct}% vs base
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
