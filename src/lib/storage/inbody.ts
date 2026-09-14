import { v4 as uuidv4 } from 'uuid';
import { InBodyEntry, InBodyData } from '@/types';

const STORAGE_KEY = 'fit-dash-inbody';
const SEEDED_KEY = 'fit-dash-inbody-seeded-v3';
// One-time migration flag: appends the DEXA reading below to browsers that were
// already seeded before DEXA support existed. Once set, it stays set forever —
// even if the user deletes the DEXA entry afterward, it must never come back.
const DEXA_MIGRATION_KEY = 'fit-dash-inbody-dexa-v1';

// The most recent, most authoritative body-fat reading (DEXA), added 2026-09-14.
// The actual scan date is unknown, so `date` below is a placeholder used ONLY to
// position this entry last on charts — always display it as "date unknown", never
// as a real date. DEXA doesn't give us weight/muscle mass, so those stay unset
// rather than invented. Stable id so re-running the migration is idempotent.
const DEXA_ENTRY_ID = 'dexa-2026-bf-24-2';
// Exported so UI code (e.g. RecoveryHero's Body Fat card) can seed a deterministic first paint —
// same value on the server and the client's first render, before `getInBodyData()`
// (localStorage) is available — without waiting on a post-mount effect.
export function getDefaultDexaEntry(): InBodyEntry {
  return {
    id: DEXA_ENTRY_ID,
    date: new Date('2026-09-14'),
    bodyFatPercentage: 24.2,
    source: 'dexa',
    dateUnknown: true,
  };
}

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
  // Fresh browsers get the DEXA reading from day one.
  entries.push(getDefaultDexaEntry());
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
    // DEXA is already included in the fresh seed above — mark the migration
    // as done so it's never appended a second time.
    localStorage.setItem(DEXA_MIGRATION_KEY, 'true');
    // Sort by date descending, same as every other return path — callers like
    // getLatestInBodyEntry()/getLatestWeightEntry() depend on entries[0] being latest.
    defaultData.entries.sort((a, b) => b.date.getTime() - a.date.getTime());
    return defaultData;
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  let data: InBodyData;
  if (!stored) {
    data = { entries: [] };
  } else {
    try {
      const parsed = JSON.parse(stored) as InBodyData;
      // Convert date strings back to Date objects
      data = {
        entries: parsed.entries.map(entry => ({
          ...entry,
          date: new Date(entry.date),
        })),
      };
    } catch {
      data = { entries: [] };
    }
  }

  // One-time migration for browsers seeded before DEXA support existed: append
  // the DEXA reading without touching any existing (possibly user-edited) entries.
  // Gated on its own flag, independent of SEEDED_KEY, so it runs exactly once ever —
  // if the user later deletes the DEXA entry, this must not re-add it.
  const hasMigratedDexa = localStorage.getItem(DEXA_MIGRATION_KEY);
  if (!hasMigratedDexa) {
    data.entries.push(getDefaultDexaEntry());
    saveInBodyData(data);
    localStorage.setItem(DEXA_MIGRATION_KEY, 'true');
  }

  // Sort by date descending
  data.entries.sort((a, b) => b.date.getTime() - a.date.getTime());
  return data;
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

// The most recent entry that actually has a weight reading — the overall latest
// entry (e.g. a DEXA reading) may not have one, so this is used wherever a
// current bodyweight number needs to be displayed.
export function getLatestWeightEntry(): InBodyEntry | null {
  const data = getInBodyData(); // already sorted descending by date
  return data.entries.find(entry => entry.weight != null) ?? null;
}
