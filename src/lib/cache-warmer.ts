/**
 * Background cache warmer for always-on servers (Fly.io).
 * - Warms workouts + advice + food caches on startup and every 6 hours
 * - After each warm: runs PR check (ntfy on new compound PRs)
 * - Daily 8:00-8:30 PM PST: workout reminder (ntfy.sh/fitdash)
 * - Daily 3:00-3:15 PM PST: mid-day protein nudge
 * - Saturday 10 AM PST: weekly grocery list (LLM) based on micro deficiencies
 * - Sunday 7 PM PST: weekly retrospective (LLM)
 */

const WARM_INTERVAL = 6 * 60 * 60 * 1000;
let started = false;

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

  // Initial + periodic warm
  setTimeout(warm, 5000);
  setInterval(warm, WARM_INTERVAL);

  // Daily 8:00-8:30 PM PST — workout reminder
  scheduleDaily(20, 0, 30, () => callCron('/api/cron/exercise-reminder', 'reminder'), 'reminder');

  // Daily 3:00-3:15 PM PST — protein nudge
  scheduleDaily(15, 0, 15, () => callCron('/api/cron/protein-nudge', 'protein-nudge'), 'protein-nudge');

  // Saturday 10 AM PST — grocery list
  scheduleWeekly(6, 10, 0, () => callCron('/api/cron/grocery-list', 'grocery-list'), 'grocery-list');

  // Sunday 7 PM PST — weekly retro
  scheduleWeekly(0, 19, 0, () => callCron('/api/cron/weekly-retro', 'weekly-retro'), 'weekly-retro');
}
