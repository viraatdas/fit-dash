'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Select } from '@/components/ui';
import { InBodyEntry } from '@/types';

interface InBodyFormProps {
  onSubmit: (entry: Omit<InBodyEntry, 'id'>) => void;
}

const SOURCE_OPTIONS = [
  { value: 'inbody', label: 'InBody' },
  { value: 'dexa', label: 'DEXA' },
];

export function InBodyForm({ onSubmit }: InBodyFormProps) {
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    source: 'inbody' as 'inbody' | 'dexa',
    dateUnknown: false,
    weight: '',
    bodyFatPercentage: '',
    muscleMass: '',
    bodyFatMass: '',
    bmi: '',
    visceralFat: '',
    legLeanMass: '',
  });

  const isDexa = formData.source === 'dexa';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const entry: Omit<InBodyEntry, 'id'> = {
      date: new Date(formData.date),
      bodyFatPercentage: parseFloat(formData.bodyFatPercentage),
      ...(isDexa && { source: 'dexa' as const }),
      ...(isDexa && formData.dateUnknown && { dateUnknown: true }),
      ...(formData.weight && { weight: parseFloat(formData.weight) }),
      ...(formData.muscleMass && { muscleMass: parseFloat(formData.muscleMass) }),
      ...(formData.bodyFatMass && { bodyFatMass: parseFloat(formData.bodyFatMass) }),
      ...(formData.bmi && { bmi: parseFloat(formData.bmi) }),
      ...(formData.visceralFat && { visceralFat: parseFloat(formData.visceralFat) }),
      ...(formData.legLeanMass && { legLeanMass: parseFloat(formData.legLeanMass) }),
    };

    onSubmit(entry);

    setFormData({
      date: format(new Date(), 'yyyy-MM-dd'),
      source: 'inbody',
      dateUnknown: false,
      weight: '',
      bodyFatPercentage: '',
      muscleMass: '',
      bodyFatMass: '',
      bmi: '',
      visceralFat: '',
      legLeanMass: '',
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  const isValid = formData.bodyFatPercentage && (isDexa || (formData.weight && formData.muscleMass));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add Body Composition Entry</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <Select label="Source" name="source" value={formData.source} onChange={handleChange} options={SOURCE_OPTIONS} />
            <Input label="Date" type="date" name="date" value={formData.date} onChange={handleChange} required disabled={isDexa && formData.dateUnknown} />
            <Input label="Body Fat %" type="number" name="bodyFatPercentage" value={formData.bodyFatPercentage} onChange={handleChange} placeholder="18.5" step="0.1" required />
            {isDexa && (
              <label className="flex items-center gap-2 self-end pb-2.5 font-mono text-[11px] uppercase tracking-[0.08em] text-n-text-secondary">
                <input type="checkbox" name="dateUnknown" checked={formData.dateUnknown} onChange={handleChange} />
                Date unknown
              </label>
            )}
            <Input label={`Weight (lbs)${isDexa ? ' — optional' : ''}`} type="number" name="weight" value={formData.weight} onChange={handleChange} placeholder="165" step="0.1" required={!isDexa} />
            <Input label={`Skeletal Muscle (lbs)${isDexa ? ' — optional' : ''}`} type="number" name="muscleMass" value={formData.muscleMass} onChange={handleChange} placeholder="78" step="0.1" required={!isDexa} />
            <Input label="Body Fat Mass (lbs)" type="number" name="bodyFatMass" value={formData.bodyFatMass} onChange={handleChange} placeholder="28" step="0.1" />
            <Input label="BMI" type="number" name="bmi" value={formData.bmi} onChange={handleChange} placeholder="25" step="0.1" />
            <Input label="Visceral Fat Level" type="number" name="visceralFat" value={formData.visceralFat} onChange={handleChange} placeholder="5" step="1" />
            <Input label="Leg Lean Mass (lbs)" type="number" name="legLeanMass" value={formData.legLeanMass} onChange={handleChange} placeholder="40" step="0.1" />
          </div>
          <Button type="submit" disabled={!isValid}>
            Add Entry
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
