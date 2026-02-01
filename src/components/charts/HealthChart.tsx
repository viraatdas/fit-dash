'use client';

import { useMemo, useRef, useState } from 'react';
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
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/ui';
import { DailyHealth } from '@/types';
import { format, parseISO } from 'date-fns';

interface HealthChartProps {
  data: DailyHealth[];
  onDataUpdate?: () => void;
}

export function HealthChart({ data, onDataUpdate }: HealthChartProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadMessage(null);

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      const response = await fetch('/api/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json),
      });

      const result = await response.json();
      if (result.success) {
        setUploadMessage(`Uploaded successfully!`);
        onDataUpdate?.();
      } else {
        setUploadMessage(`Error: ${result.error}`);
      }
    } catch (err) {
      setUploadMessage(`Error: ${err instanceof Error ? err.message : 'Failed to upload'}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

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

            <div className="mb-6">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                variant="outline"
              >
                {uploading ? 'Uploading...' : '📁 Upload Health Export JSON'}
              </Button>
              {uploadMessage && (
                <p className={`text-sm mt-2 ${uploadMessage.includes('Error') ? 'text-red-500' : 'text-green-500'}`}>
                  {uploadMessage}
                </p>
              )}
            </div>

            <div className="text-sm text-gray-500 font-light space-y-2">
              <p>To export from Health Auto Export app:</p>
              <ol className="list-decimal list-inside text-left max-w-md mx-auto space-y-1">
                <li>Open Health Auto Export on your iPhone</li>
                <li>Go to Export → Export as JSON</li>
                <li>Upload the JSON file here</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Upload Button */}
      <div className="flex justify-end">
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileUpload}
          className="hidden"
        />
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          variant="outline"
          size="sm"
        >
          {uploading ? 'Uploading...' : '📁 Upload JSON'}
        </Button>
        {uploadMessage && (
          <span className={`ml-3 text-sm ${uploadMessage.includes('Error') ? 'text-red-500' : 'text-green-500'}`}>
            {uploadMessage}
          </span>
        )}
      </div>

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

      {/* Intraday Heart Rate Chart */}
      {data.some(d => d.hourlyHeartRate && d.hourlyHeartRate.length > 0) && (
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
              <CardTitle>Heart Rate Throughout Day</CardTitle>
              <select
                value={selectedDay || data.find(d => d.hourlyHeartRate?.length)?.date || ''}
                onChange={(e) => setSelectedDay(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white"
              >
                {data.filter(d => d.hourlyHeartRate?.length).map(d => (
                  <option key={d.date} value={d.date}>
                    {format(parseISO(d.date), 'MMM d, yyyy')}
                  </option>
                ))}
              </select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-48 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={(() => {
                    const dayData = data.find(d => d.date === (selectedDay || data.find(d => d.hourlyHeartRate?.length)?.date));
                    return (dayData?.hourlyHeartRate || []).map(hr => ({
                      ...hr,
                      time: `${hr.hour.toString().padStart(2, '0')}:00`,
                    }));
                  })()}
                >
                  <defs>
                    <linearGradient id="hrGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="time" stroke="#9ca3af" fontSize={10} tickLine={false} />
                  <YAxis
                    stroke="#9ca3af"
                    fontSize={10}
                    tickLine={false}
                    domain={[50, 160]}
                    tickFormatter={(v) => `${v}`}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
                    formatter={(value) => [`${value} bpm`, 'Heart Rate']}
                  />
                  <Area
                    type="monotone"
                    dataKey="heartRate"
                    name="Heart Rate"
                    fill="url(#hrGradient)"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#ef4444' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
