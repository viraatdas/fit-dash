import { NextResponse } from 'next/server';
import { clearNormalizationCache } from '@/lib/exercise/llm-normalizer';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const deleted = await clearNormalizationCache();
  return NextResponse.json({ success: true, deleted });
}
