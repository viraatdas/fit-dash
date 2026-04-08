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
        setUploadMessage('[UPLOADED]');
        onDataUpdate?.();
      } else {
        setUploadMessage(`[ERROR: ${result.error}]`);
      }
    } catch (err) {
      setUploadMessage(`[ERROR: ${err instanceof Error ? err.message : 'Failed to upload'}]`);
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
            <p className="font-mono text-xs text-n-text-disabled uppercase tracking-[0.04em] mb-6">[NO HEALTH DATA]</p>

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
                variant="secondary"
              >
                {uploading ? 'Uploading...' : 'Upload Health JSON'}
              </Button>
              {uploadMessage && (
                <p className={`font-mono text-[11px] mt-2 ${uploadMessage.includes('ERROR') ? 'text-n-accent' : 'text-n-success'}`}>
                  {uploadMessage}
                </p>
              )}
            </div>

            <div className="text-sm text-n-text-secondary space-y-2">
              <p>To export from Health Auto Export app:</p>
              <ol className="list-decimal list-inside text-left max-w-md mx-auto space-y-1 text-n-text-disabled">
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
      <div className="flex justify-end items-center">
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
          variant="secondary"
          size="sm"
        >
          {uploading ? 'Uploading...' : 'Upload JSON'}
        </Button>
        {uploadMessage && (
          <span className={`ml-3 font-mono text-[11px] ${uploadMessage.includes('ERROR') ? 'text-n-accent' : 'text-n-success'}`}>
            {uploadMessage}
          </span>
        )}
      </div>

      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
          <Card>
            <CardContent className="text-center py-3 sm:py-4">
              <p className="text-xl sm:text-2xl font-mono text-n-interactive tracking-tight">{stats.avgSteps.toLocaleString()}</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-secondary mt-1">Avg Steps (7d)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="text-center py-3 sm:py-4">
              <p className="text-xl sm:text-2xl font-mono text-n-warning tracking-tight">{stats.avgCalories}</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-secondary mt-1">Avg Active Cal</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="text-center py-3 sm:py-4">
              <p className="text-xl sm:text-2xl font-mono text-n-text-primary tracking-tight">{stats.avgSleep}h</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-secondary mt-1">Avg Sleep</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="text-center py-3 sm:py-4">
              <p className="text-xl sm:text-2xl font-mono text-n-accent tracking-tight">{stats.avgHR || '–'}</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-secondary mt-1">Resting HR</p>
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
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={10} tickLine={false} fontFamily="Space Mono" />
                <YAxis yAxisId="steps" fontSize={10} tickLine={false} fontFamily="Space Mono" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <YAxis yAxisId="cal" orientation="right" fontSize={10} tickLine={false} fontFamily="Space Mono" />
                <Tooltip
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
                />
                <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'Space Mono' }} />
                <Area yAxisId="steps" type="monotone" dataKey="steps" name="Steps" fill="rgba(0,0,0,0.05)" stroke="#5B9BF6" strokeWidth={2} />
                <Line yAxisId="cal" type="monotone" dataKey="activeCalories" name="Active Cal" stroke="#D4A843" strokeWidth={2} dot={false} />
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
            <p className="text-xs text-n-text-disabled mt-1">Lower is generally better</p>
          </CardHeader>
          <CardContent>
            <div className="h-48 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={10} tickLine={false} fontFamily="Space Mono" />
                  <YAxis fontSize={10} tickLine={false} domain={[50, 80]} fontFamily="Space Mono" />
                  <Tooltip
                    formatter={(value) => [`${value} bpm`, 'RESTING HR']}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
                  />
                  <Area
                    type="monotone"
                    dataKey="restingHeartRate"
                    name="Resting HR"
                    fill="rgba(0,0,0,0.05)"
                    stroke="#D71921"
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#D71921', strokeWidth: 0 }}
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
          <CardHeader><CardTitle>Sleep</CardTitle></CardHeader>
          <CardContent>
            <div className="h-48 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={10} tickLine={false} fontFamily="Space Mono" />
                  <YAxis fontSize={10} tickLine={false} domain={[0, 10]} fontFamily="Space Mono" tickFormatter={(v) => `${v}h`} />
                  <Tooltip
                    formatter={(value) => [`${value}h`, 'SLEEP']}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
                  />
                  <Bar dataKey="sleepHours" name="Sleep" fill="#E8E8E8" radius={[2, 2, 0, 0]} maxBarSize={30} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Heart Rate Trends */}
      {data.some(d => d.hourlyHeartRate && d.hourlyHeartRate.length > 0) && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Heart Rate Trends</CardTitle>
              <p className="text-xs text-n-text-disabled mt-1">Daily average, min, and max</p>
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
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" fontSize={10} tickLine={false} fontFamily="Space Mono" />
                    <YAxis fontSize={10} tickLine={false} domain={[40, 180]} fontFamily="Space Mono" />
                    <Tooltip
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.fullDate || ''}
                      formatter={(value, name) => {
                        const labels: Record<string, string> = { max: 'MAX HR', avg: 'AVG HR', min: 'MIN HR', resting: 'RESTING' };
                        return [`${value} bpm`, labels[name as string] || name];
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '10px', fontFamily: 'Space Mono' }} />
                    <Area type="monotone" dataKey="max" name="Max" fill="rgba(0,0,0,0.05)" stroke="#D71921" strokeWidth={1} strokeDasharray="3 3" />
                    <Line type="monotone" dataKey="avg" name="Average" stroke="#D71921" strokeWidth={2} dot={{ r: 3, fill: '#D71921', strokeWidth: 0 }} />
                    <Line type="monotone" dataKey="min" name="Min" stroke="#666666" strokeWidth={1} dot={false} />
                    {data.some(d => d.restingHeartRate) && (
                      <Line type="monotone" dataKey="resting" name="Resting" stroke="#4A9E5C" strokeWidth={2} dot={{ r: 2, fill: '#4A9E5C', strokeWidth: 0 }} connectNulls />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Hourly Heart Rate */}
          <Card>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                <div>
                  <CardTitle>Hourly Heart Rate</CardTitle>
                  <p className="text-xs text-n-text-disabled mt-1">Heart rate throughout a specific day</p>
                </div>
                <select
                  value={selectedDay || data.find(d => d.hourlyHeartRate?.length)?.date || ''}
                  onChange={(e) => setSelectedDay(e.target.value)}
                  className="px-3 py-1.5 font-mono text-xs bg-n-surface-raised border border-n-border-visible rounded-nothing-sm text-n-text-primary"
                >
                  {data.filter(d => d.hourlyHeartRate?.length).map(d => (
                    <option key={d.date} value={d.date} className="bg-n-surface">
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
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" fontSize={10} tickLine={false} fontFamily="Space Mono" />
                    <YAxis fontSize={10} tickLine={false} domain={[50, 160]} fontFamily="Space Mono" />
                    <Tooltip
                      formatter={(value) => [`${value} bpm`, 'HR']}
                    />
                    <Area
                      type="monotone"
                      dataKey="heartRate"
                      name="Heart Rate"
                      fill="rgba(0,0,0,0.05)"
                      stroke="#D71921"
                      strokeWidth={2}
                      dot={{ r: 3, fill: '#D71921', strokeWidth: 0 }}
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
