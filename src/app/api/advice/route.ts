import { NextResponse } from 'next/server';
import { getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET() {
  const redis = getRedis();
  if (!redis) {
    return NextResponse.json({ error: 'Redis not configured' }, { status: 500 });
  }

  try {
    const cached = await redis.get('fitdash:advice');
    if (cached) {
      const data = typeof cached === 'string' ? JSON.parse(cached) : cached;
      const response = NextResponse.json(data);
      response.headers.set('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
      return response;
    }

    return NextResponse.json({ error: 'No advice cached yet' }, { status: 404 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
