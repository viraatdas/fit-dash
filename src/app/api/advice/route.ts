import { NextResponse } from 'next/server';
import { getCached } from '@/lib/cache/store';
import { ADVICE_KEY } from '@/lib/cache/advice-key';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cached = await getCached<unknown>(ADVICE_KEY);
    if (cached) {
      const response = NextResponse.json(cached);
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
