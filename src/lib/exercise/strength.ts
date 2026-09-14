import { ExerciseSet } from '@/types';
import {
  format,
  startOfWeek,
  addWeeks,
  startOfMonth,
  addMonths,
  startOfQuarter,
  addQuarters,
  startOfYear,
  addYears,
} from 'date-fns';

/**
 * Estimated-1RM and lift-grouping helpers shared by every strength-related chart/route.
 *
 * Root cause this exists to guard against (see StrengthProgressChart history): the old
 * per-chart code picked whichever set had the heaviest raw WEIGHT regardless of reps, then
 * ran it through the Brzycki formula (`weight * 36 / (37 - reps)`), which explodes for
 * anything past ~12 reps (reps=20 -> 2.1x multiplier, reps=25 -> 3x, reps>=37 -> negative /
 * Infinity). Real sessions in the data use 15-25 rep sets for things like leg press and calf
 * raises, which produced "estimated 1RM" values of 700-900+ lbs on lifts the person never
 * actually moved anywhere near that. This module fixes both problems at once: a gentler
 * formula (Epley) plus a sane rep-range filter, so only sets that can actually predict a
 * near-max effort are used.
 */

/** Epley formula: weight * (1 + reps/30). Grows much more gently than Brzycki at higher
 *  reps and never divides by zero / goes negative, so a bad rep count degrades gracefully
 *  instead of exploding. Still only trustworthy within MIN/MAX_E1RM_REPS — see below. */
export function estimateOneRepMax(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return Math.round(weight);
  return Math.round(weight * (1 + reps / 30));
}

// Simple 1RM formulas (Epley, Brzycki, etc.) are only calibrated for near-max-effort sets.
// Outside this range the "1RM" they produce isn't a real estimate — it's either a diluted
// endurance set (high reps) or noise (0 reps). Sets outside this window are excluded from
// e1RM entirely rather than fed through the formula anyway.
export const MIN_E1RM_REPS = 1;
export const MAX_E1RM_REPS = 12;

/**
 * Best (highest) estimated 1RM across a session's sets, using only sets within the sane
 * rep range. Returns null when no set in the session qualifies (e.g. an all-high-rep leg
 * press day) rather than fabricating a number from an unreliable set.
 */
export function bestSessionE1RM(sets: ExerciseSet[]): number | null {
  let best: number | null = null;
  for (const s of sets) {
    if (s.weight > 0 && s.reps >= MIN_E1RM_REPS && s.reps <= MAX_E1RM_REPS) {
      const e = estimateOneRepMax(s.weight, s.reps);
      if (best === null || e > best) best = e;
    }
  }
  return best;
}

export type LiftGroupKey = 'chestPress' | 'squat' | 'row' | 'legPress';

/**
 * Explicit, curated mapping from EXACT canonical exercise name to a strength-chart lift
 * group. This intentionally replaces substring matching (`name.includes('chest')`,
 * `.includes('squat')`, `.includes('row')`), which lumped together movements with very
 * different loading — e.g. `.includes('chest')` would also catch "Chest Fly" (an isolation
 * move), and `.includes('squat')` catches Hack/Smith squat variants that load very
 * differently than a back squat. Only exact, deliberately-chosen canonical names land in a
 * group; anything not listed here (isolation work, machines with their own identity, etc.)
 * is simply excluded from the compound-lift trend lines rather than fuzzily guessed at.
 *
 * Covers BOTH naming vocabularies this app produces: the keyword-fallback normalizer
 * (aliases.ts — used whenever Redis/Gemini name-normalization is unavailable, verified
 * against a local snapshot) and Gemini's own canonical names (used in production — verified
 * against a real production parse pulled from the Fly volume, `notion_workouts_v3.json`).
 * They don't always agree on the exact string for the same real exercise — e.g. the fallback
 * says "Squat" where Gemini says "Barbell Squat" for the identical raw "Barbell squat(s)"
 * entries — so both spellings are listed explicitly rather than picking one.
 *
 * Row deliberately excludes dumbbell variants (Dumbbell Row, Single Arm Dumbbell Row,
 * Dumbbell Incline Row): per-hand dumbbell loads (in this data, 35-95 lbs) are not
 * comparable to barbell/cable/machine row loads (85-220 lbs, all genuinely comparable
 * total-system weight) — mixing them is the same "shows I could lift a shit ton more"
 * failure mode as the original bug, just for a different lift. Everything else that's a
 * genuine row movement — Low Row, ISO Lateral Row (+ "dy"/"back" variants seen in the raw
 * text), Seated Row, Cable Bent Over Row, Seated Low Row — landed in the same 85-220 lb
 * range as Barbell Row in the real data, so they stay grouped together.
 */
const LIFT_GROUPS: Record<string, LiftGroupKey> = {
  'Bench Press': 'chestPress',
  'Barbell Bench Press': 'chestPress',
  'Incline Bench Press': 'chestPress',
  'Decline Bench Press': 'chestPress',
  'Close Grip Bench Press': 'chestPress',
  'Chest Press': 'chestPress',
  'Machine Chest Press': 'chestPress',
  'Incline Chest Press': 'chestPress',
  'ISO Lateral Chest Press': 'chestPress',
  'Dumbbell Bench Press': 'chestPress',
  'Incline Dumbbell Bench Press': 'chestPress',

  Squat: 'squat',
  'Back Squat': 'squat',
  'Front Squat': 'squat',
  'Barbell Squat': 'squat', // Gemini's name for the same raw "Barbell squat(s)" entries
  'Hack Squat': 'squat',
  'Smith Machine Squat': 'squat',
  'Goblet Squat': 'squat',
  'Dumbbell Squat': 'squat',

  'Barbell Row': 'row',
  'T-Bar Row': 'row',
  Row: 'row',
  'Cable Row': 'row',
  'Seated Cable Row': 'row', // fallback-normalizer name
  'Seated Row': 'row', // Gemini's name for the same equipment
  'Low Row': 'row',
  'Seated Low Row': 'row',
  'ISO Lateral Row': 'row',
  'ISO Lateral Back Row': 'row',
  'Cable Bent Over Row': 'row',
  // NOT included: Dumbbell Row, Single Arm Dumbbell Row, Dumbbell Incline Row — per-hand
  // dumbbell loads, a different equipment class from everything else in this group (see
  // the block comment above).

  'Leg Press': 'legPress',
  'Seated Leg Press': 'legPress',
  'Incline Leg Press': 'legPress',
};

export function getLiftGroup(normalizedName: string): LiftGroupKey | null {
  return LIFT_GROUPS[normalizedName.trim()] ?? null;
}

// Compound lifts the strength chart doesn't track as one of its 4 dedicated lines (no
// dedicated deadlift/overhead-press chart group exists) but that are still genuine
// "how strong am I getting" compound movements other consumers (weekly retro) care about.
// Includes both naming vocabularies (see the LIFT_GROUPS comment above) — e.g. Gemini names
// the same raw entries "Barbell Deadlift" where the fallback normalizer says "Deadlift".
const ADDITIONAL_COMPOUND_LIFTS = new Set([
  'Deadlift',
  'Barbell Deadlift',
  'Conventional Deadlift',
  'Sumo Deadlift',
  'Romanian Deadlift',
  'Stiff Leg Deadlift',
  'Overhead Press',
  'Military Press',
  'Shoulder Press',
  'Dumbbell Shoulder Press',
]);

/** Exact-name compound-lift check — replaces `name.includes('press')`-style substring
 *  matching (which also catches isolation work like "Tricep pushdown" or lumps together
 *  unrelated presses) with the same curated identity used for the strength chart groups. */
export function isCompoundLift(normalizedName: string): boolean {
  return getLiftGroup(normalizedName) !== null || ADDITIONAL_COMPOUND_LIFTS.has(normalizedName);
}

export interface OutlierGuardOptions {
  /** How many neighboring points (on each side) to compare a point against. */
  windowSize?: number;
  /** Flag a point if it's more than this many times the local (median) baseline. */
  maxRatio?: number;
}

/**
 * Conservative safety net, NOT a substitute for correct parsing/grouping: drops points that
 * are far above the robust (median) baseline of their nearby same-series neighbors. This
 * catches whatever still slips through after the parser/grouping fixes — a stray equipment
 * mismatch, a typo'd weight, an LLM parse gone sideways — without silently trusting every
 * parsed number at face value. A point with too little surrounding context to judge (e.g.
 * the very first point in a brand-new series) is always kept.
 */
export function filterOutliers<T>(
  points: T[],
  getValue: (point: T) => number,
  { windowSize = 5, maxRatio = 1.75 }: OutlierGuardOptions = {}
): T[] {
  const values = points.map(getValue);
  return points.filter((_, i) => {
    const v = values[i];
    if (v <= 0) return true;

    const neighbors: number[] = [];
    for (let j = Math.max(0, i - windowSize); j <= Math.min(values.length - 1, i + windowSize); j++) {
      if (j !== i) neighbors.push(values[j]);
    }
    if (neighbors.length < 2) return true;

    const sorted = [...neighbors].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (median <= 0) return true;

    return v <= median * maxRatio;
  });
}

/** Robust "current best" weight for an exercise's raw max-weight series (WeightProgressChart,
 *  PR checks, etc.): the heaviest weight among sets that are themselves not outliers relative
 *  to the exercise's own recent history. Falls back to the plain max when there isn't enough
 *  history to judge (e.g. the exercise's first ever session). */
export function robustMaxWeight(
  history: Array<{ date: Date; maxWeight: number }>
): Array<{ date: Date; maxWeight: number }> {
  const sorted = [...history].sort((a, b) => a.date.getTime() - b.date.getTime());
  return filterOutliers(sorted, p => p.maxWeight);
}

// --- Chart date-range controls, shared by StrengthProgressChart and WeightProgressChart ---

export type ChartRangeKey = '1M' | '3M' | '6M' | '1Y' | 'MAX';

export const CHART_RANGE_OPTIONS: ChartRangeKey[] = ['1M', '3M', '6M', '1Y', 'MAX'];

export const CHART_RANGE_LABELS: Record<ChartRangeKey, string> = {
  '1M': 'past 1 month',
  '3M': 'past 3 months',
  '6M': 'past 6 months',
  '1Y': 'past 1 year',
  MAX: 'all time',
};

const CHART_RANGE_DAYS: Record<Exclude<ChartRangeKey, 'MAX'>, number> = {
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
};

/** Start of the selected window, or null for MAX (no lower bound). Anchored to `latest` (the
 *  most recent data point) rather than `Date.now()` so a range still shows data when the most
 *  recent workout wasn't today. */
export function chartRangeStart(range: ChartRangeKey, latest: Date): Date | null {
  if (range === 'MAX') return null;
  return new Date(latest.getTime() - CHART_RANGE_DAYS[range] * 24 * 60 * 60 * 1000);
}

/** Default range: 1Y if that window contains at least 2 points, else MAX — so a chart whose
 *  most recent data sits in a long gap doesn't default to an empty-looking view. */
export function defaultChartRange(timestamps: number[]): ChartRangeKey {
  if (timestamps.length === 0) return 'MAX';
  const latest = Math.max(...timestamps);
  const start = chartRangeStart('1Y', new Date(latest));
  const withinYear = start ? timestamps.filter(t => t >= start.getTime()).length : timestamps.length;
  return withinYear >= 2 ? '1Y' : 'MAX';
}

// --- Explicit, documented per-session corrections ---
//
// A last resort for a GENUINE data-entry typo (not a parsing bug, not a formula artifact —
// both of those get fixed generally, above) where the raw Notion text itself is wrong and the
// intended value can be inferred from neighboring sessions for that same lift. Keyed by
// ISO date + exact normalizedName so it can never silently apply to the wrong session.
// Every entry must document the raw (as-parsed) value, the correction, and why.
//
// Empty right now: the one session investigated so far under this process — 2026-01-14
// "Seated leg press" (raw: "1x25 - 205", "1x25 - 220", "1x25 - 235") — turned out to be a
// completely legitimate ascending 3-set pyramid at 25 reps each, not a typo. It only looked
// like a spike because of the Brzycki/high-rep e1RM bug (weight=235, reps=25 -> old e1RM 705),
// which is now fixed generally via bestSessionE1RM's MIN/MAX_E1RM_REPS filter above — that
// session simply no longer contributes an (unreliable) e1RM point, rather than being patched
// with a fabricated number.
export interface DataCorrection {
  date: string; // ISO date (yyyy-MM-dd), matched against the workout's local date
  normalizedName: string;
  rawWeight: number;
  correctedWeight: number;
  reason: string;
}

export const DATA_CORRECTIONS: DataCorrection[] = [];

/** Applies any matching correction to a session's sets (by date + exact exercise name),
 *  scaling every set's weight by the same ratio as the corrected value so per-set relative
 *  loading (e.g. a pyramid) is preserved rather than collapsing all sets to one number. */
export function applyDataCorrection(
  date: Date,
  normalizedName: string,
  sets: ExerciseSet[]
): ExerciseSet[] {
  if (DATA_CORRECTIONS.length === 0) return sets;
  const isoDate = date.toISOString().slice(0, 10);
  const correction = DATA_CORRECTIONS.find(
    c => c.date === isoDate && c.normalizedName === normalizedName
  );
  if (!correction || correction.rawWeight <= 0) return sets;
  const ratio = correction.correctedWeight / correction.rawWeight;
  return sets.map(s => (s.weight === correction.rawWeight ? { ...s, weight: Math.round(s.weight * ratio) } : s));
}

// --- Shared X-axis tick generation, used by StrengthProgressChart and WeightProgressChart ---
//
// Recharts' default tick generation for a `type="number" scale="time"` axis (no explicit
// `ticks` prop) evenly divides the numeric domain rather than snapping to calendar
// boundaries. With many data points and a coarse tick FORMATTER (month-only for 6M/1Y/MAX),
// several of those evenly-spaced-but-misaligned ticks land within the same calendar month and
// render the identical label back-to-back ("Mar '26 Mar '26 Mar '26 ..."). Passing explicit
// `ticks` generated at real calendar boundaries fixes this at the source, and thinning them
// to `maxTicks` keeps short-day labels ("Sep 3") from colliding on a narrow chart.

/** Calendar-boundary ticks within [domainStart, domainEnd], thinned to at most `maxTicks`.
 *  Granularity follows the selected range: week starts for 1M/3M, month starts for 6M/1Y,
 *  quarter starts for a MAX span up to ~2 years, year starts beyond that. */
export function computeChartTicks(
  range: ChartRangeKey,
  domainStart: number,
  domainEnd: number,
  maxTicks = 7
): number[] {
  if (domainEnd <= domainStart) return [domainStart];

  let unitStart: (d: Date) => Date;
  let addUnit: (d: Date, n: number) => Date;

  if (range === '1M' || range === '3M') {
    unitStart = d => startOfWeek(d, { weekStartsOn: 1 });
    addUnit = addWeeks;
  } else if (range === '6M' || range === '1Y') {
    unitStart = startOfMonth;
    addUnit = addMonths;
  } else {
    const twoYearsMs = 2 * 365 * 24 * 60 * 60 * 1000;
    if (domainEnd - domainStart <= twoYearsMs) {
      unitStart = startOfQuarter;
      addUnit = addQuarters;
    } else {
      unitStart = startOfYear;
      addUnit = addYears;
    }
  }

  const all: number[] = [];
  let cursor = unitStart(new Date(domainStart));
  if (cursor.getTime() < domainStart) cursor = addUnit(cursor, 1);
  while (cursor.getTime() <= domainEnd) {
    all.push(cursor.getTime());
    cursor = addUnit(cursor, 1);
  }
  if (all.length === 0) return [domainStart];

  const step = Math.max(1, Math.ceil(all.length / maxTicks));
  const thinned: number[] = [];
  for (let i = 0; i < all.length; i += step) thinned.push(all[i]);
  return thinned;
}

/** X-axis tick label: day-level ("Sep 3") for short ranges, month+year ("Mar '26") for
 *  longer ones — and a year suffix on day-level ticks too whenever the visible window itself
 *  spans a year boundary, so no tick is ever ambiguous about which year it falls in. */
export function formatChartTick(timestamp: number, range: ChartRangeKey, spansYearBoundary: boolean): string {
  const date = new Date(timestamp);
  if (range === '1M' || range === '3M') {
    return spansYearBoundary ? format(date, "MMM d ''yy") : format(date, 'MMM d');
  }
  return format(date, "MMM ''yy");
}

/** Full date for tooltips, e.g. "Wed, Jan 14, 2026" — independent of the axis tick range. */
export function formatChartTooltipDate(timestamp: number): string {
  return format(new Date(timestamp), 'EEE, MMM d, yyyy');
}
