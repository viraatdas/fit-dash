import { NextResponse } from 'next/server';
import { getNotionClient } from '@/lib/notion';
import { getRedis } from '@/lib/redis';
import { parseFoodBlocks, estimateNutrients } from '@/lib/food/parser';
import { FoodDay } from '@/types';

export const maxDuration = 120;

const FOOD_PAGE_ID = '34453423f1cf80de9e4dcaf8655f86f8';
const REDIS_KEY = 'fitdash:food';
const REDIS_TTL = 86400; // 24 hours

interface NotionBlock {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
}

// In-memory cache for always-on servers
let memoryCache: { data: FoodDay[]; ts: number } | null = null;
const MEMORY_TTL = 6 * 60 * 60 * 1000;

async function fetchAndParseFoodLog(): Promise<FoodDay[]> {
  const notion = getNotionClient();

  const blocks: NotionBlock[] = [];
  let cursor: string | undefined;
  do {
    const response = await notion.blocks.children.list({ block_id: FOOD_PAGE_ID, start_cursor: cursor, page_size: 100 });
    blocks.push(...(response.results as NotionBlock[]));
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  const rawDays = parseFoodBlocks(blocks);
  console.log(`Parsed ${rawDays.length} food days from Notion`);

  return estimateNutrients(rawDays);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get('refresh') === '1';

  try {
    let foodData: FoodDay[] | null = null;
    const redis = getRedis();

    // Layer 1: In-memory cache
    if (!forceRefresh && memoryCache && Date.now() - memoryCache.ts < MEMORY_TTL) {
      foodData = memoryCache.data;
      console.log('Serving food data from memory cache');
    }

    // Layer 2: Redis cache
    if (!foodData && !forceRefresh && redis) {
      try {
        const cached = await redis.get(REDIS_KEY);
        if (cached) {
          foodData = typeof cached === 'string' ? JSON.parse(cached) : cached;
          memoryCache = { data: foodData!, ts: Date.now() };
          console.log('Serving food data from Redis cache');
        }
      } catch (err) {
        console.error('Redis read failed for food:', err);
      }
    }

    // Layer 3: Fresh fetch + LLM analysis
    if (!foodData) {
      console.log('Fetching food data from Notion + LLM...');
      foodData = await fetchAndParseFoodLog();

      memoryCache = { data: foodData, ts: Date.now() };
      if (redis) {
        try {
          await redis.set(REDIS_KEY, JSON.stringify(foodData), { ex: REDIS_TTL });
        } catch (err) {
          console.error('Failed to write food to Redis:', err);
        }
      }
    }

    return NextResponse.json({ success: true, data: foodData });
  } catch (error) {
    console.error('Food API error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 },
    );
  }
}
