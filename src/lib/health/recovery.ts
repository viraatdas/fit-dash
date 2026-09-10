import { DailyHealth } from '@/types';

/**
 * Recovery ("rest") score derived from resting heart rate + HRV.
 *
 * There is no sleep-tracker data (and iOS does not expose Screen Time to
 * third parties), so rest is inferred the way sports science does it:
 * a resting HR below your recent baseline and an HRV above your recent
 * baseline both signal good recovery.
 *
 * Expects `data` newest-first (as /api/health returns it).
 */
export interface RecoveryResult {
  score: number | null; // 0-100, null when there isn't enough data
  label: string;
  restingHr: number | null;
  restingHrDelta: number | null; // today minus 7d baseline (negative = good)
  hrv: number | null;
  hrvDeltaPct: number | null; // today vs 7d baseline, % (positive = good)
  baselineDays: number;
}

function avg(values: (number | undefined | null)[]): number | null {
  const xs = values.filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function computeRecovery(data: DailyHealth[]): RecoveryResult {
  const empty: RecoveryResult = {
    score: null,
    label: 'Not enough data',
    restingHr: null,
    restingHrDelta: null,
    hrv: null,
    hrvDeltaPct: null,
    baselineDays: 0,
  };
  if (!data || data.length < 2) return empty;

  const today = data[0];
  const baseline = data.slice(1, 8);

  const restingHr = today.restingHeartRate ?? null;
  const hrv = today.heartRateVariability ?? null;
  const baselineRhr = avg(baseline.map(d => d.restingHeartRate));
  const baselineHrv = avg(baseline.map(d => d.heartRateVariability));
  const baselineDays = baseline.filter(d => d.restingHeartRate || d.heartRateVariability).length;

  if (restingHr === null || hrv === null || baselineRhr === null || baselineHrv === null || baselineHrv === 0) {
    return { ...empty, restingHr, hrv, baselineDays };
  }

  const restingHrDelta = restingHr - baselineRhr;
  const hrvDeltaPct = ((hrv - baselineHrv) / baselineHrv) * 100;

  // Resting HR: 3+ bpm below baseline = 100, 5+ bpm above = 0
  const rhrScore = clamp(((5 - restingHrDelta) / 8) * 100, 0, 100);
  // HRV: +15% vs baseline = 100, -15% = 0
  const hrvScore = clamp(((hrvDeltaPct + 15) / 30) * 100, 0, 100);

  const score = Math.round(0.5 * rhrScore + 0.5 * hrvScore);
  const label =
    score >= 80 ? 'Primed' :
    score >= 60 ? 'Good to go' :
    score >= 40 ? 'Fair' : 'Rest up';

  return {
    score,
    label,
    restingHr: Math.round(restingHr),
    restingHrDelta: Math.round(restingHrDelta * 10) / 10,
    hrv: Math.round(hrv),
    hrvDeltaPct: Math.round(hrvDeltaPct),
    baselineDays,
  };
}
