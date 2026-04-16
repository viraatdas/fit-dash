import { v4 as uuidv4 } from 'uuid';
import { InBodyEntry, InBodyData } from '@/types';

const STORAGE_KEY = 'fit-dash-inbody';
const SEEDED_KEY = 'fit-dash-inbody-seeded-v3';

// Your actual InBody data
const DEFAULT_ENTRIES: Omit<InBodyEntry, 'id'>[] = [
  {
    date: new Date('2025-04-01'),
    weight: 168.6,
    bodyFatPercentage: 19.6,
    muscleMass: 78.0,
    bodyFatMass: 33.0,
    bmi: 26.4,
    visceralFat: 5,
    legLeanMass: 39.4,
    ecwRatio: 0.361,
  },
  {
    date: new Date('2026-01-14'),
    weight: 162.3,
    bodyFatPercentage: 16.2,
    muscleMass: 78.5,
    bodyFatMass: 26.3,
    bmi: 25.4,
    visceralFat: 4,
    visceralFatArea: 45.0,
    trunkFatMass: 13.9,
    legLeanMass: 40.0,
    ecwRatio: 0.363,
  },
  {
    date: new Date('2026-04-15'),
    weight: 167.2,
    bodyFatPercentage: 15.4,
    muscleMass: 82.5,
    bodyFatMass: 25.7,
    bmi: 26.2,
    visceralFat: 4,
    visceralFatArea: 40.8,
    trunkFatMass: 13.9,
    legLeanMass: 40.5,
    ecwRatio: 0.357,
    basalMetabolicRate: 1756,
  },
];

function seedDefaultData(): InBodyData {
  const entries = DEFAULT_ENTRIES.map(entry => ({
    ...entry,
    id: uuidv4(),
  }));
  return { entries };
}

export function getInBodyData(): InBodyData {
  if (typeof window === 'undefined') {
    return { entries: [] };
  }

  // Check if we need to seed default data
  const hasSeeded = localStorage.getItem(SEEDED_KEY);
  if (!hasSeeded) {
    const defaultData = seedDefaultData();
    saveInBodyData(defaultData);
    localStorage.setItem(SEEDED_KEY, 'true');
    return defaultData;
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    return { entries: [] };
  }

  try {
    const data = JSON.parse(stored) as InBodyData;
    // Convert date strings back to Date objects
    data.entries = data.entries.map(entry => ({
      ...entry,
      date: new Date(entry.date),
    }));
    // Sort by date descending
    data.entries.sort((a, b) => b.date.getTime() - a.date.getTime());
    return data;
  } catch {
    return { entries: [] };
  }
}

export function saveInBodyData(data: InBodyData): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function addInBodyEntry(entry: Omit<InBodyEntry, 'id'>): InBodyEntry {
  const data = getInBodyData();
  const newEntry: InBodyEntry = {
    ...entry,
    id: uuidv4(),
  };
  data.entries.push(newEntry);
  saveInBodyData(data);
  return newEntry;
}

export function updateInBodyEntry(id: string, updates: Partial<Omit<InBodyEntry, 'id'>>): InBodyEntry | null {
  const data = getInBodyData();
  const index = data.entries.findIndex(e => e.id === id);
  if (index === -1) return null;

  data.entries[index] = { ...data.entries[index], ...updates };
  saveInBodyData(data);
  return data.entries[index];
}

export function deleteInBodyEntry(id: string): boolean {
  const data = getInBodyData();
  const index = data.entries.findIndex(e => e.id === id);
  if (index === -1) return false;

  data.entries.splice(index, 1);
  saveInBodyData(data);
  return true;
}

export function getLatestInBodyEntry(): InBodyEntry | null {
  const data = getInBodyData();
  return data.entries.length > 0 ? data.entries[0] : null;
}
