/**
 * Background cache warmer for always-on servers (Fly.io).
 * - Warms workouts + advice + food caches on startup and every 6 hours
 * - Sends daily exercise reminder email at random time between 8:00-8:30 PM PST
 */

const WARM_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
let started = false;

export function startCacheWarmer() {
  if (started) return;
  started = true;

  const baseUrl = process.env.HOSTNAME === '0.0.0.0'
    ? `http://localhost:${process.env.PORT || 3000}`
    : null;

  if (!baseUrl) return; // Not on Fly.io / standalone server

  async function warm() {
    try {
      // Warm workouts + advice (cron endpoint handles it all)
      console.log('[cache-warmer] Warming all caches...');
      const res = await fetch(`${baseUrl}/api/cron/warm-cache`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
      if (res.ok) {
        const data = await res.json();
        console.log(`[cache-warmer] Workouts done — ${data.workouts} cached`);
      } else {
        console.error('[cache-warmer] Workouts failed:', res.status);
      }

      // Warm food data
      console.log('[cache-warmer] Warming food cache...');
      const foodRes = await fetch(`${baseUrl}/api/food?refresh=1`);
      if (foodRes.ok) {
        console.log('[cache-warmer] Food cache warmed');
      }
    } catch (err) {
      console.error('[cache-warmer] Error:', err);
    }
  }

  async function sendDailyEmail() {
    try {
      console.log('[email] Sending daily exercise reminder...');
      const res = await fetch(`${baseUrl}/api/cron/exercise-reminder`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
      if (res.ok) {
        const data = await res.json();
        console.log(`[email] Sent to ${data.emailsSent?.join(', ')}`);
      } else {
        console.error('[email] Failed:', res.status);
      }
    } catch (err) {
      console.error('[email] Error:', err);
    }
  }

  function scheduleDailyEmail() {
    const now = new Date();
    // Target: 8:00-8:30 PM PST (UTC-7 = 03:00-03:30 UTC, UTC-8 = 04:00-04:30 UTC)
    // Use America/Los_Angeles to handle DST automatically
    const pstNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const target = new Date(pstNow);
    target.setHours(20, Math.floor(Math.random() * 30), Math.floor(Math.random() * 60), 0);

    // If target time already passed today, schedule for tomorrow
    if (target <= pstNow) {
      target.setDate(target.getDate() + 1);
    }

    // Convert back to UTC ms from now
    const pstOffset = pstNow.getTime() - now.getTime();
    const msUntilTarget = target.getTime() - pstNow.getTime();

    console.log(`[email] Next daily email scheduled in ${Math.round(msUntilTarget / 60000)} minutes`);

    setTimeout(() => {
      sendDailyEmail();
      // Schedule next one for tomorrow (re-randomize the minute)
      scheduleDailyEmail();
    }, msUntilTarget);
  }

  // Warm caches after a short delay
  setTimeout(warm, 5000);

  // Refresh caches every 6 hours
  setInterval(warm, WARM_INTERVAL);

  // Schedule daily email
  scheduleDailyEmail();
}
