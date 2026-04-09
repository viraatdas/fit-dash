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
      console.log('[cache-warmer] Warming workout cache...');
      const res = await fetch(`${baseUrl}/api/notion?refresh=1`);
      if (res.ok) {
        console.log('[cache-warmer] Workout cache warmed successfully');
      } else {
        console.error('[cache-warmer] Failed to warm cache:', res.status);
      }
    } catch (err) {
      console.error('[cache-warmer] Error warming cache:', err);
    }
  }

  // Warm after a short delay (let the server finish starting)
  setTimeout(warm, 5000);

  // Refresh every 6 hours
  setInterval(warm, WARM_INTERVAL);
}
