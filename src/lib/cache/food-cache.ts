import { getNotionClient } from '@/lib/notion/client';
import { parseFoodBlocks, estimateNutrients } from '@/lib/food/parser';
import { FoodDay } from '@/types';
import { getCached, setCached } from '@/lib/cache/store';
import { notionCall, isNotionBackoffActive } from '@/lib/cache/notion-cache';

/**
 * Durable, single-flight, throttled food-log cache — mirrors notion-cache.ts
 * but without the incremental block-diffing (the food page is small enough
 * to fully re-crawl each refresh). Food's Notion calls go through the same
 * `notionCall` rate gate/backoff as the workouts crawl, so both share one
 * ~3 req/s budget and one global 429 backoff window.
 */

const FOOD_PAGE_ID = '34453423f1cf80de9e4dcaf8655f86f8';
const FOOD_KEY = 'food:days';
const THROTTLE_MS = 60 * 1000;
const PAGE_SIZE = 100;

export interface CachedFood {
  data: FoodDay[];
  fetchedAt: number;
}

interface FoodRefreshError {
  message: string;
  at: number;
}

interface FoodRefreshState {
  inFlightPromise: Promise<void> | null;
  lastCheckAt: number;
  lastError: FoodRefreshError | null;
}

// Anchored on globalThis, not a plain module const — see the matching
// comment in notion-cache.ts: Next's standalone output can give a route
// handler bundle and the page bundle separate module instances of "the
// same" imported file, so this needs one real globalThis object per Node
// process to actually be shared (and single-flight) across the whole app.
const globalForFoodCache = globalThis as typeof globalThis & { __fitdashFoodCache?: FoodRefreshState };
globalForFoodCache.__fitdashFoodCache ??= { inFlightPromise: null, lastCheckAt: 0, lastError: null };
const state = globalForFoodCache.__fitdashFoodCache;

interface NotionBlock {
  id: string;
  type: string;
  has_children: boolean;
  [key: string]: unknown;
}

async function fetchAndParseFoodLog(): Promise<FoodDay[]> {
  const notion = getNotionClient();
  const blocks: NotionBlock[] = [];
  let cursor: string | undefined;
  do {
    const response = await notionCall(() =>
      notion.blocks.children.list({ block_id: FOOD_PAGE_ID, start_cursor: cursor, page_size: PAGE_SIZE })
    );
    blocks.push(...(response.results as NotionBlock[]));
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  const rawDays = parseFoodBlocks(blocks);
  console.log(`Parsed ${rawDays.length} food days from Notion`);
  return estimateNutrients(rawDays);
}

async function doRefresh(): Promise<void> {
  if (isNotionBackoffActive()) return; // let the shared backoff window clear first
  const data = await fetchAndParseFoodLog();
  await setCached<CachedFood>(FOOD_KEY, { data, fetchedAt: Date.now() });
}

function triggerRefresh(force: boolean): Promise<void> {
  if (state.inFlightPromise) return state.inFlightPromise;

  const now = Date.now();
  if (!force && now - state.lastCheckAt < THROTTLE_MS) return Promise.resolve();

  state.lastCheckAt = now;

  const promise = doRefresh()
    .then(() => {
      state.lastError = null;
    })
    .catch(err => {
      state.lastError = { message: err instanceof Error ? err.message : String(err), at: Date.now() };
      console.error('[food-cache] refresh failed:', err);
    })
    .finally(() => {
      state.inFlightPromise = null;
    });

  state.inFlightPromise = promise;
  return promise;
}

/** Reads the durable food cache (memory → disk), never touches the network. */
export async function getCachedFood(): Promise<CachedFood | null> {
  return getCached<CachedFood>(FOOD_KEY);
}

/** Fire-and-forget: kicks a single-flight, throttled background refresh. */
export function requestFoodRefresh(opts?: { force?: boolean }): void {
  void triggerRefresh(opts?.force ?? false);
}

export function isFoodRefreshing(): boolean {
  return state.inFlightPromise !== null;
}

export function getLastFoodError(): FoodRefreshError | null {
  return state.lastError;
}

/** Cold-start helper, same pattern as notion-cache.ts's ensureFreshEnough. */
export async function ensureFoodFreshEnough(maxWaitMs: number): Promise<void> {
  const promise = state.inFlightPromise ?? triggerRefresh(true);
  if (!promise) return;
  await Promise.race([promise, new Promise<void>(resolve => setTimeout(resolve, maxWaitMs))]);
}
