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

/**
 * Per-day rolling baseline series, for rendering a shaded baseline band
 * behind a resting-HR/HRV sparkline across a whole date range (rather than
 * just "today" like computeRecovery above).
 *
 * Same baseline definition as computeRecovery: for a given day, the
 * baseline is the mean ± 1 SD of that metric over the PRIOR 7 days (older,
 * excluding the day itself) — generalized to every day in `data` instead of
 * only the newest. `data` must be newest-first, same convention as
 * computeRecovery.
 *
 * A day's band is null (no shading) when fewer than MIN_BASELINE_DAYS of
 * its prior 7 days have a value for that metric.
 */
export const MIN_BASELINE_DAYS = 3;

export interface BaselineDayPoint {
  date: string;
  restingHr: number | null;
  hrv: number | null;
  rhrBaselineMean: number | null;
  rhrBaselineLow: number | null; // mean - 1 SD
  rhrBaselineHigh: number | null; // mean + 1 SD
  hrvBaselineMean: number | null;
  hrvBaselineLow: number | null;
  hrvBaselineHigh: number | null;
}

function stddev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function computeBaselineSeries(data: DailyHealth[]): BaselineDayPoint[] {
  if (!data) return [];

  return data.map((day, i) => {
    // Days OLDER than `day` (data is newest-first, so these are the next 7 entries).
    const priorWindow = data.slice(i + 1, i + 8);
    const rhrValues = priorWindow
      .map(d => d.restingHeartRate)
      .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
    const hrvValues = priorWindow
      .map(d => d.heartRateVariability)
      .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));

    const rhrMean = rhrValues.length >= MIN_BASELINE_DAYS ? avg(rhrValues) : null;
    const hrvMean = hrvValues.length >= MIN_BASELINE_DAYS ? avg(hrvValues) : null;
    const rhrSD = rhrMean !== null ? stddev(rhrValues, rhrMean) : null;
    const hrvSD = hrvMean !== null ? stddev(hrvValues, hrvMean) : null;

    return {
      date: day.date,
      restingHr: day.restingHeartRate ?? null,
      hrv: day.heartRateVariability ?? null,
      rhrBaselineMean: rhrMean,
      rhrBaselineLow: rhrMean !== null && rhrSD !== null ? rhrMean - rhrSD : null,
      rhrBaselineHigh: rhrMean !== null && rhrSD !== null ? rhrMean + rhrSD : null,
      hrvBaselineMean: hrvMean,
      hrvBaselineLow: hrvMean !== null && hrvSD !== null ? hrvMean - hrvSD : null,
      hrvBaselineHigh: hrvMean !== null && hrvSD !== null ? hrvMean + hrvSD : null,
    };
  });
}
