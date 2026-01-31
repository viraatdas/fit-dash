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
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-light text-gray-400 uppercase tracking-wider">Date</th>
                <th className="px-4 py-3 text-left text-xs font-light text-gray-400 uppercase tracking-wider">Weight</th>
                <th className="px-4 py-3 text-left text-xs font-light text-gray-400 uppercase tracking-wider">Body Fat</th>
                <th className="px-4 py-3 text-left text-xs font-light text-gray-400 uppercase tracking-wider">Muscle</th>
                <th className="px-4 py-3 text-left text-xs font-light text-gray-400 uppercase tracking-wider">BMI</th>
                <th className="px-4 py-3 text-left text-xs font-light text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-light text-gray-600">
                    {format(entry.date, 'MMM d, yyyy')}
                  </td>
                  <td className="px-4 py-3 text-sm font-light text-gray-600">
                    {entry.weight} lbs
                  </td>
                  <td className="px-4 py-3 text-sm font-light text-gray-600">
                    {entry.bodyFatPercentage}%
                  </td>
                  <td className="px-4 py-3 text-sm font-light text-gray-600">
                    {entry.muscleMass} lbs
                  </td>
                  <td className="px-4 py-3 text-sm font-light text-gray-600">
                    {entry.bmi ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(entry.id)}
                      className="text-red-400 hover:text-red-500 hover:bg-red-50"
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
