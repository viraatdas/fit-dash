export async function register() {
  // Only run on the server, and only when running standalone (Fly.io)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startCacheWarmer } = await import('@/lib/cache-warmer');
    startCacheWarmer();
  }
}
