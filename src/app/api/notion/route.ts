import { NextResponse } from 'next/server';
import { getNotionClient, getPageId } from '@/lib/notion';
import { parseNotionPage } from '@/lib/notion/parser';
import { getRedis } from '@/lib/redis';

export const maxDuration = 60;

const REDIS_KEY = 'fitdash:workouts';
const REDIS_TTL = 86400; // 24 hours

// In-memory cache — survives across requests on always-on servers (Fly.io)
let memoryCache: { workouts: unknown; ts: number } | null = null;
const MEMORY_TTL = 6 * 60 * 60 * 1000; // 6 hours

interface NotionBlock {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
}

async function fetchFresh() {
  const notion = getNotionClient();
  const pageId = getPageId();

  const blocks: NotionBlock[] = [];
  let cursor: string | undefined;
  do {
    const response = await notion.blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 30 });
    blocks.push(...(response.results as NotionBlock[]));
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  // Parallel child fetching in batches of 10
  const blocksNeedingChildren = blocks.filter(b => b.has_children && b.type === 'numbered_list_item');
  const childrenMap = new Map<string, NotionBlock[]>();

  for (let i = 0; i < blocksNeedingChildren.length; i += 10) {
    const batch = blocksNeedingChildren.slice(i, i + 10);
    const results = await Promise.all(
      batch.map(async (block) => {
        const childResponse = await notion.blocks.children.list({ block_id: block.id, page_size: 50 });
        return { id: block.id, children: childResponse.results as NotionBlock[] };
      })
    );
    results.forEach(r => childrenMap.set(r.id, r.children));
  }

  const blocksWithChildren = blocks.map(block => {
    const children = childrenMap.get(block.id);
    return children ? { ...block, children } : block;
  });

  return parseNotionPage(blocksWithChildren);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get('refresh') === '1';

  try {
    let workouts;
    const redis = getRedis();

    // Layer 1: In-memory cache (sub-ms, survives on always-on servers)
    if (!forceRefresh && memoryCache && Date.now() - memoryCache.ts < MEMORY_TTL) {
      workouts = memoryCache.workouts;
      console.log('Serving workouts from memory cache');
    }

    // Layer 2: Redis cache (~100ms)
    if (!workouts && !forceRefresh && redis) {
      try {
        const cached = await redis.get(REDIS_KEY);
        if (cached) {
          workouts = typeof cached === 'string' ? JSON.parse(cached) : cached;
          memoryCache = { workouts, ts: Date.now() };
          console.log('Serving workouts from Redis cache');
        }
      } catch (err) {
        console.error('Redis read failed, falling back to Notion:', err);
      }
    }

    // Layer 3: Full Notion fetch (slow, only on cache miss or forced refresh)
    if (!workouts) {
      console.log(forceRefresh ? 'Force refresh: fetching from Notion' : 'Cache miss: fetching from Notion');
      workouts = await fetchFresh();

      // Populate both caches
      memoryCache = { workouts, ts: Date.now() };
      if (redis) {
        try {
          await redis.set(REDIS_KEY, JSON.stringify(workouts), { ex: REDIS_TTL });
        } catch (err) {
          console.error('Failed to write workouts to Redis:', err);
        }
      }
    }

    const response = NextResponse.json({ success: true, workouts });
    // CDN caching: fresh for 6 hours, serve stale for up to 7 days while refreshing
    // Cron keeps Redis + CDN warm. Client sessionStorage adds another layer.
    if (!forceRefresh) {
      response.headers.set('Cache-Control', 's-maxage=21600, stale-while-revalidate=604800');
    }
    return response;
  } catch (error) {
    console.error('Notion error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
