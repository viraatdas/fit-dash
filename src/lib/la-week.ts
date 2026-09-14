/**
 * Shared calendar-day-window helpers for the top-of-page hero + "this week"
 * strip. Everything here windows by LA calendar days rather than raw
 * millisecond math, so "this week" means the same 7 wall-clock days
 * regardless of exactly when a render happens — a `now - N*ms` sliding
 * window flips on ordinary clock drift (seconds, between an SSR pass and
 * client hydration), while a calendar-day key only changes when the actual
 * LA calendar date does.
 */

export const LA_TIME_ZONE = 'America/Los_Angeles';

/**
 * YYYY-MM-DD calendar-day key for `input` in the given IANA timezone.
 *
 * A plain "YYYY-MM-DD" string (no time component — how health-data dates are
 * stored, already representing a specific calendar day) is returned as-is:
 * reinterpreting it as UTC midnight and re-converting to `timeZone` would
 * shift it a day backward in any timezone behind UTC. Anything else (a
 * `Date`, or a full ISO datetime string) is converted from its real instant.
 */
export function laDayKey(input: Date | string, timeZone: string = LA_TIME_ZONE): string {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return input;
  }
  const date = typeof input === 'string' ? new Date(input) : input;
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

/** Today's calendar-day key in the given IANA timezone. */
export function todayKey(timeZone: string = LA_TIME_ZONE): string {
  return laDayKey(new Date(), timeZone);
}

/**
 * Integer number of calendar days between two YYYY-MM-DD keys (positive when
 * `aKey` is later), via UTC epoch math on the plain Y/M/D digits — exact
 * regardless of DST, since no timezone conversion happens once we already
 * have calendar digits.
 */
export function daysBetweenKeys(aKey: string, bKey: string): number {
  const [ay, am, ad] = aKey.split('-').map(Number);
  const [by, bm, bd] = bKey.split('-').map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000);
}

/** "this" for the 7 days ending today (0-6 days ago), "last" for the 7 before that (7-13 days ago), else null. */
export function classifyWeek(daysAgo: number): 'this' | 'last' | null {
  if (daysAgo >= 0 && daysAgo < 7) return 'this';
  if (daysAgo >= 7 && daysAgo < 14) return 'last';
  return null;
}
