'use client';

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui';
import { Workout } from '@/types';
import { BODY_GOAL } from '@/lib/goals';
import {
  bestSessionE1RM,
  getLiftGroup,
  filterOutliers,
  applyDataCorrection,
  chartRangeStart,
  defaultChartRange,
  ChartRangeKey,
  CHART_RANGE_LABELS,
  LiftGroupKey,
} from '@/lib/exercise/strength';
import { RangeSelector } from './RangeSelector';

interface StrengthProgressChartProps {
  workouts: Workout[];
}

interface ProgressDataPoint {
  timestamp: number;
  chestPress?: number;
  squat?: number;
  row?: number;
  legPress?: number;
  avgStrength: number;
  trendLine: number;
  goalLine: number;
}

const LIFT_GROUP_KEYS: LiftGroupKey[] = ['chestPress', 'squat', 'row', 'legPress'];

// legPress is tracked (its own e1RM series still gets computed) but deliberately excluded
// from avgStrength/the headline stat below: it isn't drawn as a chart line, and its scale
// (e1RM ~270-480) is wildly different from chest/squat/row (~50-240). Including it meant the
// composite average — and therefore the headline % and goal line — swung whenever leg press
// entered or left the selected window, independent of whether anyone actually got stronger.
const AVG_STRENGTH_GROUPS: LiftGroupKey[] = ['chestPress', 'squat', 'row'];

/** Median of a small numeric array — used to anchor the goal line / range stat on a value
 *  that isn't just whatever a single (possibly noisy) data point happened to be. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** X-axis tick label: day-level ("Sep 3") for short ranges, month+year ("Mar '26") for
 *  longer ones — and a year suffix on day-level ticks too whenever the visible window itself
 *  spans a year boundary, so no tick is ever ambiguous about which year it falls in. */
function formatTick(timestamp: number, range: ChartRangeKey, spansYearBoundary: boolean): string {
  const date = new Date(timestamp);
  if (range === '1M' || range === '3M') {
    return spansYearBoundary ? format(date, "MMM d ''yy") : format(date, 'MMM d');
  }
  return format(date, "MMM ''yy");
}

const CHART_COLORS = {
  primary: '#E8E8E8',
  trend: '#4A9E5C',
  chest: '#D4A843',
  squat: '#D71921',
  row: '#5B9BF6',
};

export function StrengthProgressChart({ workouts }: StrengthProgressChartProps) {
  const progressData = useMemo(() => {
    const sorted = [...workouts].sort((a, b) => a.date.getTime() - b.date.getTime());

    type RawPoint = { timestamp: number; value: number };
    const rawSeries: Record<LiftGroupKey, RawPoint[]> = {
      chestPress: [], squat: [], row: [], legPress: [],
    };

    // Best (robust) e1RM per lift group per session — never the heaviest-weight-set-
    // regardless-of-reps that used to explode on high-rep sets.
    for (const workout of sorted) {
      const bestByGroup = new Map<LiftGroupKey, number>();
      for (const exercise of workout.exercises) {
        const group = getLiftGroup(exercise.normalizedName);
        if (!group) continue;
        const sets = applyDataCorrection(workout.date, exercise.normalizedName, exercise.sets);
        const e1rm = bestSessionE1RM(sets);
        if (e1rm === null) continue;
        const current = bestByGroup.get(group);
        if (current === undefined || e1rm > current) bestByGroup.set(group, e1rm);
      }
      if (bestByGroup.size === 0) continue;
      bestByGroup.forEach((value, group) => {
        rawSeries[group].push({ timestamp: workout.date.getTime(), value });
      });
    }

    // Safety net: drop points that are a wild multiple of that lift's own recent baseline —
    // this is what catches an equipment mismatch or stray parsing edge case that slips
    // through, not a replacement for parsing/grouping the data correctly in the first place.
    const cleanSeries: Record<LiftGroupKey, RawPoint[]> = {
      chestPress: filterOutliers(rawSeries.chestPress, p => p.value),
      squat: filterOutliers(rawSeries.squat, p => p.value),
      row: filterOutliers(rawSeries.row, p => p.value),
      legPress: filterOutliers(rawSeries.legPress, p => p.value),
    };

    const dataMap = new Map<number, ProgressDataPoint>();
    for (const group of LIFT_GROUP_KEYS) {
      for (const p of cleanSeries[group]) {
        let point = dataMap.get(p.timestamp);
        if (!point) {
          point = { timestamp: p.timestamp, avgStrength: 0, trendLine: 0, goalLine: 0 };
          dataMap.set(p.timestamp, point);
        }
        (point as unknown as Record<string, number>)[group] = p.value;
      }
    }

    const dataPoints = Array.from(dataMap.values()).sort((a, b) => a.timestamp - b.timestamp);

    // avgStrength: carry the last-known value forward per DRAWN lift (chest/squat/row —
    // not legPress, see AVG_STRENGTH_GROUPS above) so a squat-only day doesn't skew the
    // average toward squat — every point averages all drawn lifts seen so far using each
    // one's most recent reading, not just whichever lifts happened on that exact date.
    const lastKnown: Partial<Record<LiftGroupKey, number>> = {};
    for (const point of dataPoints) {
      for (const group of AVG_STRENGTH_GROUPS) {
        const v = (point as unknown as Record<string, number | undefined>)[group];
        if (typeof v === 'number') lastKnown[group] = v;
      }
      const known = Object.values(lastKnown).filter((v): v is number => typeof v === 'number');
      point.avgStrength = known.length > 0 ? Math.round(known.reduce((a, b) => a + b, 0) / known.length) : 0;
    }

    if (dataPoints.length >= 2) {
      const n = dataPoints.length;
      const sumX = dataPoints.reduce((sum, _, i) => sum + i, 0);
      const sumY = dataPoints.reduce((sum, p) => sum + p.avgStrength, 0);
      const sumXY = dataPoints.reduce((sum, p, i) => sum + i * p.avgStrength, 0);
      const sumX2 = dataPoints.reduce((sum, _, i) => sum + i * i, 0);

      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      dataPoints.forEach((point, i) => {
        point.trendLine = Math.round(intercept + slope * i);
      });

      // Goal line — anchor to the median of the first few points rather than a single
      // (possibly noisy) first data point, then compound at the target monthly rate.
      const anchorWindow = dataPoints.slice(0, Math.min(3, dataPoints.length));
      const anchorValue = median(anchorWindow.map(p => p.avgStrength));
      const anchorTimestamp = dataPoints[0].timestamp;
      const monthlyMultiplier = 1 + BODY_GOAL.targetStrengthGainPctPerMonth / 100;
      dataPoints.forEach((point) => {
        const monthsElapsed = (point.timestamp - anchorTimestamp) / (1000 * 60 * 60 * 24 * 30);
        point.goalLine = Math.round(anchorValue * Math.pow(monthlyMultiplier, monthsElapsed));
      });
    }

    return dataPoints;
  }, [workouts]);

  // Range defaults to 1Y (or MAX if that's too sparse) — computed once real data is
  // available rather than locked in at mount, since `workouts` can arrive asynchronously
  // after an initial empty/cached render. Stops auto-updating the moment the user picks a
  // range themselves.
  const [range, setRange] = useState<ChartRangeKey>('MAX');
  const [rangeTouched, setRangeTouched] = useState(false);

  useEffect(() => {
    if (rangeTouched || progressData.length === 0) return;
    setRange(defaultChartRange(progressData.map(p => p.timestamp)));
  }, [progressData, rangeTouched]);

  const handleRangeChange = (next: ChartRangeKey) => {
    setRangeTouched(true);
    setRange(next);
  };

  const rangeData = useMemo(() => {
    if (progressData.length === 0) return [];
    const latestTs = progressData[progressData.length - 1].timestamp;
    const start = chartRangeStart(range, new Date(latestTs));
    return start ? progressData.filter(p => p.timestamp >= start.getTime()) : progressData;
  }, [progressData, range]);

  // Headline stat recomputed for the selected range as the mean of each DRAWN lift's own
  // % change (median of its first/last few points within the range), not a % change on the
  // composite avgStrength line. This is composition-independent: which lifts happen to be
  // present doesn't change the weight any other lift carries, only the raw avgStrength
  // *value* did that (see AVG_STRENGTH_GROUPS above) — a lift only contributes here if it
  // has at least 2 of its own points in the range (enough to judge a start vs. an end).
  const progressStats = useMemo(() => {
    const perLiftChanges: number[] = [];
    for (const group of AVG_STRENGTH_GROUPS) {
      const values = rangeData
        .map(p => (p as unknown as Record<string, number | undefined>)[group])
        .filter((v): v is number => typeof v === 'number');
      if (values.length < 2) continue;
      const startVal = median(values.slice(0, Math.min(3, values.length)));
      const endVal = median(values.slice(-Math.min(3, values.length)));
      if (startVal <= 0) continue;
      perLiftChanges.push((endVal - startVal) / startVal);
    }
    if (perLiftChanges.length === 0) return null;
    const avgChange = perLiftChanges.reduce((a, b) => a + b, 0) / perLiftChanges.length;
    return { percentChange: (avgChange * 100).toFixed(1), isPositive: avgChange > 0 };
  }, [rangeData]);

  const domain = useMemo((): [number, number] => {
    if (rangeData.length === 0) return [0, 1];
    return [rangeData[0].timestamp, rangeData[rangeData.length - 1].timestamp];
  }, [rangeData]);

  const spansYearBoundary =
    rangeData.length > 0 &&
    new Date(rangeData[0].timestamp).getFullYear() !== new Date(rangeData[rangeData.length - 1].timestamp).getFullYear();

  if (progressData.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>Strength Progress</CardTitle></CardHeader>
        <CardContent>
          <p className="font-mono text-xs text-n-text-disabled uppercase tracking-[0.04em]">[NOT ENOUGH DATA]</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
          <div>
            <CardTitle>Strength Progress (Est. 1RM)</CardTitle>
            <p className="text-xs text-n-text-disabled mt-1">Normalized strength over time</p>
          </div>
          {progressStats && (
            <div className="text-left sm:text-right">
              <p className={`text-2xl sm:text-3xl font-mono tracking-tight ${progressStats.isPositive ? 'text-n-success' : 'text-n-accent'}`}>
                {progressStats.isPositive ? '+' : ''}{progressStats.percentChange}%
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-disabled">overall progress ({CHART_RANGE_LABELS[range]})</p>
            </div>
          )}
        </div>
        <div className="mt-3 flex justify-start sm:justify-end">
          <RangeSelector value={range} onChange={handleRangeChange} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-56 sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rangeData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="timestamp"
                type="number"
                scale="time"
                domain={domain}
                fontSize={10}
                tickLine={false}
                fontFamily="Space Mono"
                tickFormatter={(value) => formatTick(value, range, spansYearBoundary)}
              />
              <YAxis fontSize={10} tickLine={false} fontFamily="Space Mono" />
              <Tooltip
                labelFormatter={(label) => format(new Date(label as number), 'EEE, MMM d, yyyy')}
                formatter={(value, name) => {
                  const labels: Record<string, string> = { chestPress: 'CHEST', squat: 'SQUAT', row: 'ROW', legPress: 'LEG PRESS', avgStrength: 'AVG', trendLine: 'TREND', goalLine: 'GOAL' };
                  return [`${value} lbs`, labels[name as string] || name];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: '10px', fontFamily: 'Space Mono' }}
                formatter={(value) => {
                  const labels: Record<string, string> = { chestPress: 'CHEST', squat: 'SQUAT', row: 'ROW', legPress: 'LEG PRESS', avgStrength: 'AVG', trendLine: 'TREND', goalLine: `GOAL +${BODY_GOAL.targetStrengthGainPctPerMonth}%/mo` };
                  return labels[value] || value;
                }}
              />
              <Area type="monotone" dataKey="avgStrength" fill="rgba(0,0,0,0.05)" stroke={CHART_COLORS.primary} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="trendLine" stroke={CHART_COLORS.trend} strokeWidth={2} strokeDasharray="5 5" dot={false} />
              <Line type="monotone" dataKey="goalLine" stroke="#5B9BF6" strokeWidth={1.5} strokeDasharray="2 4" dot={false} />
              <Line type="monotone" dataKey="chestPress" stroke={CHART_COLORS.chest} strokeWidth={1.5} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="squat" stroke={CHART_COLORS.squat} strokeWidth={1.5} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="row" stroke={CHART_COLORS.row} strokeWidth={1.5} dot={{ r: 3 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
