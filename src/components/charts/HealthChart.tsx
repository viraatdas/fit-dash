'use client';

import { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
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
import { DailyHealth } from '@/types';
import { format, parseISO } from 'date-fns';

interface HealthChartProps {
  data: DailyHealth[];
}

export function HealthChart({ data }: HealthChartProps) {
  const chartData = useMemo(() => {
    return data.slice(0, 30).reverse().map(d => ({
      ...d,
      date: format(parseISO(d.date), 'MMM d'),
      fullDate: format(parseISO(d.date), 'MMM d, yyyy'),
    }));
  }, [data]);

  const stats = useMemo(() => {
    if (data.length === 0) return null;

    const recent = data.slice(0, 7);
    const avgSteps = recent.reduce((sum, d) => sum + (d.steps || 0), 0) / recent.length;
    const avgCalories = recent.reduce((sum, d) => sum + (d.activeCalories || 0), 0) / recent.length;
    const avgSleep = recent.reduce((sum, d) => sum + (d.sleepHours || 0), 0) / recent.length;
    const avgHR = recent.filter(d => d.restingHeartRate).reduce((sum, d) => sum + (d.restingHeartRate || 0), 0) /
                  recent.filter(d => d.restingHeartRate).length || 0;

    return {
      avgSteps: Math.round(avgSteps),
      avgCalories: Math.round(avgCalories),
      avgSleep: avgSleep.toFixed(1),
      avgHR: Math.round(avgHR),
    };
  }, [data]);

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Apple Health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-gray-400 font-light mb-4">No health data yet</p>
            <div className="text-sm text-gray-500 font-light space-y-2">
              <p>To sync your Apple Health data:</p>
              <ol className="list-decimal list-inside text-left max-w-md mx-auto space-y-1">
                <li>Install "Health Auto Export" from the App Store</li>
                <li>Configure it to export to REST API</li>
                <li>Set the URL to: <code className="bg-gray-100 px-1 rounded">https://fit-dash-psi.vercel.app/api/health</code></li>
                <li>Enable daily automatic export</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
          <Card>
            <CardContent className="text-center py-3 sm:py-4">
              <p className="text-lg sm:text-2xl font-light text-blue-500">{stats.avgSteps.toLocaleString()}</p>
              <p className="text-xs sm:text-sm font-light text-gray-400">Avg Steps (7d)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="text-center py-3 sm:py-4">
              <p className="text-lg sm:text-2xl font-light text-orange-500">{stats.avgCalories}</p>
              <p className="text-xs sm:text-sm font-light text-gray-400">Avg Active Cal</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="text-center py-3 sm:py-4">
              <p className="text-lg sm:text-2xl font-light text-purple-500">{stats.avgSleep}h</p>
              <p className="text-xs sm:text-sm font-light text-gray-400">Avg Sleep</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="text-center py-3 sm:py-4">
              <p className="text-lg sm:text-2xl font-light text-red-400">{stats.avgHR || '–'}</p>
              <p className="text-xs sm:text-sm font-light text-gray-400">Resting HR</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Steps & Calories Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Activity (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <defs>
                  <linearGradient id="stepsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" stroke="#9ca3af" fontSize={10} tickLine={false} />
                <YAxis
                  yAxisId="steps"
                  stroke="#9ca3af"
                  fontSize={10}
                  tickLine={false}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                />
                <YAxis
                  yAxisId="cal"
                  orientation="right"
                  stroke="#9ca3af"
                  fontSize={10}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Area
                  yAxisId="steps"
                  type="monotone"
                  dataKey="steps"
                  name="Steps"
                  fill="url(#stepsGradient)"
                  stroke="#3b82f6"
                  strokeWidth={2}
                />
                <Line
                  yAxisId="cal"
                  type="monotone"
                  dataKey="activeCalories"
                  name="Active Cal"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Heart Rate & Sleep Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Recovery Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" stroke="#9ca3af" fontSize={10} tickLine={false} />
                <YAxis
                  yAxisId="hr"
                  stroke="#9ca3af"
                  fontSize={10}
                  tickLine={false}
                  domain={[40, 80]}
                />
                <YAxis
                  yAxisId="sleep"
                  orientation="right"
                  stroke="#9ca3af"
                  fontSize={10}
                  tickLine={false}
                  domain={[0, 10]}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(value, name) => {
                    if (name === 'sleepHours') return [`${value}h`, 'Sleep'];
                    if (name === 'restingHeartRate') return [`${value} bpm`, 'Resting HR'];
                    return [value, name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar
                  yAxisId="sleep"
                  dataKey="sleepHours"
                  name="Sleep"
                  fill="#8b5cf6"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={20}
                />
                <Line
                  yAxisId="hr"
                  type="monotone"
                  dataKey="restingHeartRate"
                  name="Resting HR"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
