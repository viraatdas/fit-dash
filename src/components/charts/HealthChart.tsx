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

      {/* Resting Heart Rate Chart */}
      {chartData.some(d => d.restingHeartRate) && (
        <Card>
          <CardHeader>
            <CardTitle>Resting Heart Rate</CardTitle>
            <p className="text-xs text-gray-400 mt-1">Lower is generally better - indicates cardiovascular fitness</p>
          </CardHeader>
          <CardContent>
            <div className="h-48 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <defs>
                    <linearGradient id="hrGradientResting" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" stroke="#9ca3af" fontSize={10} tickLine={false} />
                  <YAxis
                    stroke="#9ca3af"
                    fontSize={10}
                    tickLine={false}
                    domain={[50, 80]}
                    tickFormatter={(v) => `${v}`}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
                    formatter={(value) => [`${value} bpm`, 'Resting HR']}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
                  />
                  <Area
                    type="monotone"
                    dataKey="restingHeartRate"
                    name="Resting HR"
                    fill="url(#hrGradientResting)"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ r: 4, fill: '#ef4444', strokeWidth: 2, stroke: '#fff' }}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sleep Chart */}
      {chartData.some(d => d.sleepHours) && (
        <Card>
          <CardHeader>
            <CardTitle>Sleep</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-48 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" stroke="#9ca3af" fontSize={10} tickLine={false} />
                  <YAxis
                    stroke="#9ca3af"
                    fontSize={10}
                    tickLine={false}
                    domain={[0, 10]}
                    tickFormatter={(v) => `${v}h`}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
                    formatter={(value) => [`${value}h`, 'Sleep']}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
                  />
                  <Bar
                    dataKey="sleepHours"
                    name="Sleep"
                    fill="#8b5cf6"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={30}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Heart Rate Over Time - All Days */}
      {data.some(d => d.hourlyHeartRate && d.hourlyHeartRate.length > 0) && (
        <>
          {/* Daily Heart Rate Summary Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Heart Rate Trends</CardTitle>
              <p className="text-xs text-gray-400 mt-1">Daily average, min, and max heart rate</p>
            </CardHeader>
            <CardContent>
              <div className="h-48 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={data
                      .filter(d => d.hourlyHeartRate && d.hourlyHeartRate.length > 0)
                      .slice(0, 30)
                      .reverse()
                      .map(d => {
                        const hrs = d.hourlyHeartRate!.map(h => h.heartRate);
                        return {
                          date: format(parseISO(d.date), 'MMM d'),
                          fullDate: format(parseISO(d.date), 'MMM d, yyyy'),
                          avg: Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length),
                          min: Math.min(...hrs),
                          max: Math.max(...hrs),
                          resting: d.restingHeartRate,
                        };
                      })}
                  >
                    <defs>
                      <linearGradient id="hrRangeGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" stroke="#9ca3af" fontSize={10} tickLine={false} />
                    <YAxis
                      stroke="#9ca3af"
                      fontSize={10}
                      tickLine={false}
                      domain={[40, 180]}
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
                      formatter={(value, name) => {
                        const labels: Record<string, string> = {
                          max: 'Max HR',
                          avg: 'Avg HR',
                          min: 'Min HR',
                          resting: 'Resting HR',
                        };
                        return [`${value} bpm`, labels[name as string] || name];
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Area
                      type="monotone"
                      dataKey="max"
                      name="Max"
                      fill="url(#hrRangeGradient)"
                      stroke="#ef4444"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                    <Line
                      type="monotone"
                      dataKey="avg"
                      name="Average"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#ef4444' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="min"
                      name="Min"
                      stroke="#fca5a5"
                      strokeWidth={1}
                      dot={false}
                    />
                    {data.some(d => d.restingHeartRate) && (
                      <Line
                        type="monotone"
                        dataKey="resting"
                        name="Resting"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={{ r: 2, fill: '#10b981' }}
                        connectNulls
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Detailed Intraday View for Selected Day */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <div>
                  <CardTitle>Hourly Heart Rate</CardTitle>
                  <p className="text-xs text-gray-400 mt-1">Heart rate throughout a specific day</p>
                </div>
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
        </>
      )}
    </div>
  );
}
