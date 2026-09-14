/**
 * Background cache warmer for always-on servers (Fly.io).
 * - Warms workouts + advice + food caches on startup and every 6 hours
 * - After each warm: runs PR check (ntfy on new compound PRs)
 * - Daily 8:00-8:30 AM Pacific: workout reminder (ntfy.sh/fitdash)
 * - Daily 3:00-3:15 PM PST: mid-day protein nudge
 * - Saturday 10 AM PST: weekly grocery list (LLM) based on micro deficiencies
 * - Sunday 7 PM PST: weekly retrospective (LLM)
 */

const WARM_INTERVAL = 6 * 60 * 60 * 1000;
const PACIFIC_TIME_ZONE = 'America/Los_Angeles';
const EXERCISE_REMINDER_WINDOW_SECONDS = 30 * 60;
let started = false;

const pacificDateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: PACIFIC_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getPacificDateTimeParts(date: Date): DateTimeParts {
  const parts = pacificDateTimeFormatter.formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function formatDateKey({ year, month, day }: Pick<DateTimeParts, 'year' | 'month' | 'day'>) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDaysToDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));

  return formatDateKey({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

function getDailyWindowOffsetSeconds(dateKey: string) {
  let hash = 2166136261;
  const seed = `exercise-reminder:${dateKey}`;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) % (EXERCISE_REMINDER_WINDOW_SECONDS + 1);
}

function pacificDateTimeToDate(dateKey: string, hour: number, minute: number, second: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const wallClockTime = Date.UTC(year, month - 1, day, hour, minute, second);
  let utcTime = wallClockTime;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = getPacificDateTimeParts(new Date(utcTime));
    const representedWallClockTime = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    const nextUtcTime = wallClockTime - (representedWallClockTime - utcTime);

    if (nextUtcTime === utcTime) break;
    utcTime = nextUtcTime;
  }

  return new Date(utcTime);
}

function getNextExerciseReminderTime(now: Date) {
  let dateKey = formatDateKey(getPacificDateTimeParts(now));

  function targetForDate(key: string) {
    const offsetSeconds = getDailyWindowOffsetSeconds(key);
    return pacificDateTimeToDate(key, 8, Math.floor(offsetSeconds / 60), offsetSeconds % 60);
  }

  let target = targetForDate(dateKey);
  if (target <= now) {
    dateKey = addDaysToDateKey(dateKey, 1);
    target = targetForDate(dateKey);
  }

  return target;
}

export function startCacheWarmer() {
  if (started) return;
  started = true;

  const baseUrl = process.env.HOSTNAME === '0.0.0.0'
    ? `http://localhost:${process.env.PORT || 3000}`
    : null;

  if (!baseUrl) return;

  const authHeaders = { Authorization: `Bearer ${process.env.CRON_SECRET}` };

  async function callCron(path: string, label: string) {
    try {
      console.log(`[${label}] calling ${path}`);
      const res = await fetch(`${baseUrl}${path}`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        console.log(`[${label}] ok:`, JSON.stringify(data).slice(0, 240));
      } else {
        console.error(`[${label}] failed:`, res.status);
      }
    } catch (err) {
      console.error(`[${label}] error:`, err);
    }
  }

  async function warm() {
    try {
      console.log('[cache-warmer] Warming all caches...');
      const res = await fetch(`${baseUrl}/api/cron/warm-cache`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        console.log(`[cache-warmer] Workouts done — ${data.workouts} cached`);
      } else {
        console.error('[cache-warmer] Workouts failed:', res.status);
      }

      console.log('[cache-warmer] Warming food cache...');
      const foodRes = await fetch(`${baseUrl}/api/food?refresh=1`);
      if (foodRes.ok) console.log('[cache-warmer] Food cache warmed');
    } catch (err) {
      console.error('[cache-warmer] Error:', err);
    }

    // PR check uses the freshly-warmed workouts
    await callCron('/api/cron/pr-check', 'pr-check');
  }

  // Schedule something daily at a given PST hour, with optional jitter (minutes)
  function scheduleDaily(hour: number, baseMinute: number, jitterMinutes: number, fn: () => void, label: string) {
    function next() {
      const now = new Date();
      const pstNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
      const target = new Date(pstNow);
      const jitter = jitterMinutes > 0 ? Math.floor(Math.random() * jitterMinutes) : 0;
      target.setHours(hour, baseMinute + jitter, Math.floor(Math.random() * 60), 0);
      if (target <= pstNow) target.setDate(target.getDate() + 1);
      const msUntilTarget = target.getTime() - pstNow.getTime();
      console.log(`[${label}] next fire in ${Math.round(msUntilTarget / 60000)} min`);
      setTimeout(() => {
        fn();
        next();
      }, msUntilTarget);
    }
    next();
  }

  // Schedule weekly at PST day-of-week + hour
  function scheduleWeekly(dayOfWeek: number, hour: number, minute: number, fn: () => void, label: string) {
    function next() {
      const now = new Date();
      const pstNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
      const target = new Date(pstNow);
      target.setHours(hour, minute, 0, 0);
      const diffDays = (dayOfWeek - pstNow.getDay() + 7) % 7;
      target.setDate(pstNow.getDate() + diffDays);
      if (target <= pstNow) target.setDate(target.getDate() + 7);
      const msUntilTarget = target.getTime() - pstNow.getTime();
      console.log(`[${label}] next fire in ${Math.round(msUntilTarget / 60000)} min`);
      setTimeout(() => {
        fn();
        next();
      }, msUntilTarget);
    }
    next();
  }

  function scheduleExerciseReminder(fn: () => void) {
    function next() {
      const now = new Date();
      const target = getNextExerciseReminderTime(now);
      const msUntilTarget = target.getTime() - now.getTime();
      const pacificTarget = target.toLocaleString('en-US', {
        timeZone: PACIFIC_TIME_ZONE,
        dateStyle: 'short',
        timeStyle: 'medium',
      });
      console.log(`[reminder] next fire at ${pacificTarget} Pacific`);
      setTimeout(() => {
        fn();
        next();
      }, msUntilTarget);
    }
    next();
  }

  // Initial + periodic warm
  setTimeout(warm, 5000);
  setInterval(warm, WARM_INTERVAL);

  // Daily 8:00-8:30 AM Pacific — workout reminder
  scheduleExerciseReminder(() => callCron('/api/cron/exercise-reminder', 'reminder'));

  // Daily 3:00-3:15 PM PST — protein nudge
  scheduleDaily(15, 0, 15, () => callCron('/api/cron/protein-nudge', 'protein-nudge'), 'protein-nudge');

  // Saturday 10 AM PST — grocery list
  scheduleWeekly(6, 10, 0, () => callCron('/api/cron/grocery-list', 'grocery-list'), 'grocery-list');

  // Sunday 7 PM PST — weekly retro
  scheduleWeekly(0, 19, 0, () => callCron('/api/cron/weekly-retro', 'weekly-retro'), 'weekly-retro');
}
