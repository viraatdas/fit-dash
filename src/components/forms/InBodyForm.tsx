'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Card, CardHeader, CardTitle, CardContent, Button, Input } from '@/components/ui';
import { InBodyEntry } from '@/types';

interface InBodyFormProps {
  onSubmit: (entry: Omit<InBodyEntry, 'id'>) => void;
}

export function InBodyForm({ onSubmit }: InBodyFormProps) {
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    weight: '',
    bodyFatPercentage: '',
    muscleMass: '',
    bodyFatMass: '',
    bmi: '',
    visceralFat: '',
    legLeanMass: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const entry: Omit<InBodyEntry, 'id'> = {
      date: new Date(formData.date),
      weight: parseFloat(formData.weight),
      bodyFatPercentage: parseFloat(formData.bodyFatPercentage),
      muscleMass: parseFloat(formData.muscleMass),
      ...(formData.bodyFatMass && { bodyFatMass: parseFloat(formData.bodyFatMass) }),
      ...(formData.bmi && { bmi: parseFloat(formData.bmi) }),
      ...(formData.visceralFat && { visceralFat: parseFloat(formData.visceralFat) }),
      ...(formData.legLeanMass && { legLeanMass: parseFloat(formData.legLeanMass) }),
    };

    onSubmit(entry);

    // Reset form
    setFormData({
      date: format(new Date(), 'yyyy-MM-dd'),
      weight: '',
      bodyFatPercentage: '',
      muscleMass: '',
      bodyFatMass: '',
      bmi: '',
      visceralFat: '',
      legLeanMass: '',
    });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const isValid = formData.weight && formData.bodyFatPercentage && formData.muscleMass;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add InBody Entry</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input
              label="Date"
              type="date"
              name="date"
              value={formData.date}
              onChange={handleChange}
              required
            />
            <Input
              label="Weight (lbs)"
              type="number"
              name="weight"
              value={formData.weight}
              onChange={handleChange}
              placeholder="165"
              step="0.1"
              required
            />
            <Input
              label="Body Fat %"
              type="number"
              name="bodyFatPercentage"
              value={formData.bodyFatPercentage}
              onChange={handleChange}
              placeholder="18.5"
              step="0.1"
              required
            />
            <Input
              label="Skeletal Muscle (lbs)"
              type="number"
              name="muscleMass"
              value={formData.muscleMass}
              onChange={handleChange}
              placeholder="78"
              step="0.1"
              required
            />
            <Input
              label="Body Fat Mass (lbs)"
              type="number"
              name="bodyFatMass"
              value={formData.bodyFatMass}
              onChange={handleChange}
              placeholder="28"
              step="0.1"
            />
            <Input
              label="BMI"
              type="number"
              name="bmi"
              value={formData.bmi}
              onChange={handleChange}
              placeholder="25"
              step="0.1"
            />
            <Input
              label="Visceral Fat Level"
              type="number"
              name="visceralFat"
              value={formData.visceralFat}
              onChange={handleChange}
              placeholder="5"
              step="1"
            />
            <Input
              label="Leg Lean Mass (lbs)"
              type="number"
              name="legLeanMass"
              value={formData.legLeanMass}
              onChange={handleChange}
              placeholder="40"
              step="0.1"
            />
          </div>
          <Button type="submit" disabled={!isValid}>
            Add Entry
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
