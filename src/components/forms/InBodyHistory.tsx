'use client';

import { format } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/ui';
import { InBodyEntry } from '@/types';

interface InBodyHistoryProps {
  entries: InBodyEntry[];
  onDelete: (id: string) => void;
}

export function InBodyHistory({ entries, onDelete }: InBodyHistoryProps) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>InBody History</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-n-border-visible">
              <tr>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-secondary">Date</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-secondary">Weight</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-secondary">Body Fat</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-secondary">Muscle</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-secondary">BMI</th>
                <th className="px-4 py-3 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-n-text-secondary">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-n-border">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-n-surface-raised transition-colors duration-150">
                  <td className="px-4 py-3 font-mono text-sm text-n-text-primary">
                    {format(entry.date, 'MMM d, yyyy')}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-n-text-primary">
                    {entry.weight}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-n-text-primary">
                    {entry.bodyFatPercentage}%
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-n-text-primary">
                    {entry.muscleMass}
                  </td>
                  <td className="px-4 py-3 font-mono text-sm text-n-text-disabled">
                    {entry.bmi ?? '–'}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => onDelete(entry.id)}
                    >
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
