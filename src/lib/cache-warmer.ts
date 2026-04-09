/**
 * Background cache warmer for always-on servers (Fly.io).
 * Warms the /api/notion endpoint on startup and refreshes every 6 hours.
 * On serverless (Vercel), this is a no-op — the cron job handles warming.
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
      // The cron endpoint handles everything: workouts + advice + protein estimate
      console.log('[cache-warmer] Warming all caches...');
      const res = await fetch(`${baseUrl}/api/cron/warm-cache`, {
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
      });
      if (res.ok) {
        const data = await res.json();
        console.log(`[cache-warmer] Done — ${data.workouts} workouts cached`);
      } else {
        console.error('[cache-warmer] Failed:', res.status);
      }
    } catch (err) {
      console.error('[cache-warmer] Error:', err);
    }
  }

  // Warm after a short delay (let the server finish starting)
  setTimeout(warm, 5000);

  // Refresh every 6 hours
  setInterval(warm, WARM_INTERVAL);
}
