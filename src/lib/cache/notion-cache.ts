import { getNotionClient, getPageId } from '@/lib/notion/client';
import { parseNotionPage, PARSER_VERSION } from '@/lib/notion/parser';
import { Workout } from '@/types';
import { getCached, setCached } from '@/lib/cache/store';

/**
 * Durable, incremental, rate-limit-aware Notion crawl + cache.
 *
 * Design (see fly-dash perf work):
 * - `/api/notion` (the caller) never awaits this module's network calls when
 *   cached data already exists — it reads the cache synchronously-ish and
 *   fires a background refresh.
 * - Refreshing is single-flight (one crawl in flight at a time, module-wide)
 *   and throttled: we only re-check Notion's page `last_edited_time` at most
 *   once every THROTTLE_MS, and only do a real crawl when it changed (or a
 *   caller forces one).
 * - A crawl is *incremental*: we always re-list the page's top-level blocks
 *   (cheap-ish, paginated), but only re-fetch a numbered_list_item block's
 *   children when that block is new, its own `last_edited_time` changed, or
 *   it belongs to one of the most recent few workouts — editing a set
 *   (child block) does not reliably bump its *parent* block's
 *   `last_edited_time` in Notion, only the page's, so we can't trust
 *   per-block staleness alone for older entries; we accept the small risk of
 *   missing a silent edit deep in history in exchange for avoiding a full
 *   crawl on every change.
 * - All Notion calls are paced to stay well under Notion's ~3 req/s limit,
 *   and a 429 opens a global backoff window (honoring `retry-after`) that
 *   every caller — including the cheap last-edited check — respects.
 */

const RAW_KEY = 'notion:raw-blocks';
const WORKOUTS_KEY = `notion:workouts:v${PARSER_VERSION}`;
// Non-versioned "last known good" parsed workouts. Lets a PARSER_VERSION bump
// (a new WORKOUTS_KEY) serve *something* instantly instead of blanking the
// page — see reparseFromRawCache().
const LAST_WORKOUTS_KEY = 'notion:workouts:last';

const THROTTLE_MS = 60 * 1000; // don't re-check Notion more than once/60s
const DEFAULT_BACKOFF_SECONDS = 60;
const RECENT_WORKOUTS_ALWAYS_REFRESH = 3; // re-fetch children for these regardless of block-level timestamp
const CONCURRENCY = 3;
const RATE_LIMIT_PER_SECOND = 3;
const MIN_REQUEST_INTERVAL_MS = 1000 / RATE_LIMIT_PER_SECOND;
const TOP_LEVEL_PAGE_SIZE = 100;
const CHILD_PAGE_SIZE = 100;

export interface StoredBlock {
  id: string;
  type: string;
  has_children: boolean;
  last_edited_time: string;
  children?: StoredBlock[];
  [key: string]: unknown;
}

interface ChildrenEntry {
  parentLastEdited: string;
  fetchedAt: number;
  children: StoredBlock[];
}

type ChildrenMap = Record<string, ChildrenEntry>;

interface RawCache {
  pageLastEdited: string;
  fetchedAt: number;
  topLevel: StoredBlock[];
  children: ChildrenMap;
}

export type SerializedWorkout = Omit<Workout, 'date'> & { date: string };

export interface CachedWorkouts {
  workouts: SerializedWorkout[];
  pageLastEdited: string | null;
  parsedAt: number;
  parserVersion: number;
}

export interface RefreshError {
  message: string;
  at: number;
  rateLimited: boolean;
  retryAfterSeconds?: number;
}

interface RefreshState {
  inFlightPromise: Promise<void> | null;
  lastCheckAt: number;
  backoffUntil: number;
  lastError: RefreshError | null;
  lastSuccessAt: number | null;
  // Rate gate: next allowed request-start time (shared with the backoff/
  // single-flight state below since it needs the exact same singleton
  // treatment — see the comment on globalForNotionCache).
  nextSlotAt: number;
}

// Next.js's standalone output can give a route handler bundle and the page
// bundle separate webpack module instances of "the same" imported file, so a
// plain module-level `const state = {...}` is NOT actually a singleton
// across the whole app — anchoring it on `globalThis` (one real object per
// Node process) is what makes the single-flight crawl and rate gate truly
// shared between every route and page that imports this module.
const globalForNotionCache = globalThis as typeof globalThis & { __fitdashNotionCache?: RefreshState };
globalForNotionCache.__fitdashNotionCache ??= {
  inFlightPromise: null,
  lastCheckAt: 0,
  backoffUntil: 0,
  lastError: null,
  lastSuccessAt: null,
  nextSlotAt: 0,
};
const state = globalForNotionCache.__fitdashNotionCache;

// --- Global rate gate: spaces out Notion request *starts* to stay under
// RATE_LIMIT_PER_SECOND regardless of how many are logically concurrent. ---
async function rateLimitGate(): Promise<void> {
  const now = Date.now();
  const waitUntil = Math.max(now, state.nextSlotAt);
  state.nextSlotAt = waitUntil + MIN_REQUEST_INTERVAL_MS;
  const delay = waitUntil - now;
  if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay));
}

class NotionBackoffActiveError extends Error {
  constructor() {
    super('Notion rate-limit backoff is active — skipping call');
    this.name = 'NotionBackoffActiveError';
  }
}

export function isNotionBackoffActive(): boolean {
  return Date.now() < state.backoffUntil;
}

export function isRateLimitError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  if (code === 'rate_limited') return true;
  const status = (err as { status?: unknown }).status;
  return status === 429;
}

function getRetryAfterSeconds(err: unknown): number {
  const headers = (err as { headers?: { get?: (k: string) => string | null } } | null)?.headers;
  const raw = headers?.get?.('retry-after');
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_BACKOFF_SECONDS;
}

/**
 * Shared low-level "make one Notion API call" primitive: paces every caller
 * (workouts crawl AND food crawl) to the same global ~3 req/s budget, skips
 * outright while a 429 backoff window is open, and opens/extends that same
 * window (honoring `retry-after`) the moment ANY caller gets rate-limited —
 * so a food-page 429 backs off the workouts crawl too, and vice versa.
 */
export async function notionCall<T>(fn: () => Promise<T>): Promise<T> {
  if (isNotionBackoffActive()) throw new NotionBackoffActiveError();
  await rateLimitGate();
  try {
    return await fn();
  } catch (err) {
    if (isRateLimitError(err)) {
      const retryAfterSeconds = getRetryAfterSeconds(err);
      state.backoffUntil = Date.now() + retryAfterSeconds * 1000;
      console.error(`[notion-cache] 429 from Notion — backing off ${retryAfterSeconds}s (shared across all Notion callers)`);
    }
    throw err;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<Array<R | null>> {
  const results: Array<R | null> = new Array(items.length).fill(null);
  let cursor = 0;

  // A block that itself got the 429 gets one retry once the shared backoff
  // clears, instead of being silently dropped for the whole crawl — the
  // doRefresh missing-children check below is the wider safety net for
  // anything that never even got a chance to start this cycle.
  async function attempt(index: number, alreadyRetried: boolean): Promise<void> {
    try {
      results[index] = await fn(items[index]);
    } catch (err) {
      if (isRateLimitError(err) && !alreadyRetried) {
        const waitMs = Math.max(0, state.backoffUntil - Date.now());
        if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
        await attempt(index, true);
        return;
      }
      // notionCall() already opened/extended the shared backoff window on a
      // 429; just keep whatever was cached for this block and move on.
      if (!(err instanceof NotionBackoffActiveError)) {
        console.error('[notion-cache] child fetch failed, keeping prior cache for this block:', err instanceof Error ? err.message : err);
      }
      results[index] = null;
    }
  }

  async function worker() {
    while (cursor < items.length) {
      if (Date.now() < state.backoffUntil) return; // stop starting new work while cooling down
      const index = cursor++;
      await attempt(index, false);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function getPageLastEditedRemote(): Promise<string | null> {
  const notion = getNotionClient();
  const pageId = getPageId();
  const page = await notionCall(() => notion.pages.retrieve({ page_id: pageId }));
  return 'last_edited_time' in page ? (page as { last_edited_time: string }).last_edited_time : null;
}

async function fetchAllChildren(blockId: string): Promise<StoredBlock[]> {
  const notion = getNotionClient();
  const children: StoredBlock[] = [];
  let cursor: string | undefined;
  do {
    const response = await notionCall(() =>
      notion.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: CHILD_PAGE_SIZE })
    );
    children.push(...(response.results as StoredBlock[]));
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);
  return children;
}

function looksLikeWorkoutBoundary(block: StoredBlock): boolean {
  if (block.type !== 'paragraph' && !block.type.startsWith('heading')) return false;
  const content = block[block.type] as { rich_text?: Array<{ plain_text: string; type?: string; mention?: { type: string } }> } | undefined;
  const richText = content?.rich_text;
  if (!richText || richText.length === 0) return false;

  if (richText.some(rt => rt.type === 'mention' && rt.mention?.type === 'date')) return true;

  const text = richText.map(rt => rt.plain_text).join('').trim();
  if (!text) return false;
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return true;
  if (/^[A-Za-z]+\s+\d{1,2},?\s+\d{4}/.test(text)) return true;
  return false;
}

/** Top-level block ids belonging to the most recent `count` workouts (blocks are newest-first in Notion's list order). */
function collectRecentWorkoutBlockIds(topLevel: StoredBlock[], count: number): Set<string> {
  const ids = new Set<string>();
  let boundariesSeen = 0;
  for (const block of topLevel) {
    if (looksLikeWorkoutBoundary(block)) {
      boundariesSeen++;
      if (boundariesSeen > count) break;
      continue;
    }
    if (block.type === 'numbered_list_item') {
      ids.add(block.id);
    }
  }
  return ids;
}

function attachChildren(topLevel: StoredBlock[], childrenMap: ChildrenMap): StoredBlock[] {
  return topLevel.map(block => {
    const entry = block.type === 'numbered_list_item' ? childrenMap[block.id] : undefined;
    return entry ? { ...block, children: entry.children } : block;
  });
}

async function incrementalCrawl(pageLastEdited: string, prevRaw: RawCache | null): Promise<void> {
  const pageId = getPageId();
  const notion = getNotionClient();

  const topLevel: StoredBlock[] = [];
  let cursor: string | undefined;
  do {
    const response = await notionCall(() =>
      notion.blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: TOP_LEVEL_PAGE_SIZE })
    );
    topLevel.push(...(response.results as StoredBlock[]));
    cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
  } while (cursor);

  const recentIds = collectRecentWorkoutBlockIds(topLevel, RECENT_WORKOUTS_ALWAYS_REFRESH);
  const prevChildren = prevRaw?.children ?? {};
  const prevBlocksById = new Map((prevRaw?.topLevel ?? []).map(b => [b.id, b]));

  const needsChildren = topLevel.filter(block => {
    if (block.type !== 'numbered_list_item' || !block.has_children) return false;
    const prevBlock = prevBlocksById.get(block.id);
    const changed = !prevBlock || prevBlock.last_edited_time !== block.last_edited_time;
    const isRecent = recentIds.has(block.id);
    const hasCachedChildren = Boolean(prevChildren[block.id]);
    return changed || isRecent || !hasCachedChildren;
  });

  const fetched = await mapWithConcurrency(needsChildren, CONCURRENCY, async block => {
    const children = await fetchAllChildren(block.id);
    return { id: block.id, entry: { parentLastEdited: block.last_edited_time, fetchedAt: Date.now(), children } as ChildrenEntry };
  });

  const childrenMap: ChildrenMap = {};
  // Seed with reusable previous entries for every block still present.
  for (const block of topLevel) {
    if (block.type === 'numbered_list_item' && prevChildren[block.id]) {
      childrenMap[block.id] = prevChildren[block.id];
    }
  }
  for (const result of fetched) {
    if (result) childrenMap[result.id] = result.entry;
  }

  const newRaw: RawCache = { pageLastEdited, fetchedAt: Date.now(), topLevel, children: childrenMap };
  await setCached(RAW_KEY, newRaw);

  await parseAndCacheWorkouts(topLevel, childrenMap, pageLastEdited);
}

/** Writes parsed workouts under both the version-pinned key and the non-versioned "last known good" key. */
async function writeWorkoutsCache(entry: CachedWorkouts): Promise<void> {
  await Promise.all([setCached(WORKOUTS_KEY, entry), setCached(LAST_WORKOUTS_KEY, entry)]);
}

async function parseAndCacheWorkouts(
  topLevel: StoredBlock[],
  childrenMap: ChildrenMap,
  pageLastEdited: string | null
): Promise<void> {
  const blocksForParser = attachChildren(topLevel, childrenMap);
  const workouts = await parseNotionPage(blocksForParser as never);
  const serialized: SerializedWorkout[] = workouts.map(w => ({ ...w, date: w.date.toISOString() }));

  await writeWorkoutsCache({ workouts: serialized, pageLastEdited, parsedAt: Date.now(), parserVersion: PARSER_VERSION });
}

/**
 * Re-parses the already-cached raw blocks through the *current* parser
 * (current PARSER_VERSION) with ZERO Notion calls. Used when the versioned
 * workouts key is missing (e.g. right after a PARSER_VERSION bump) but we
 * still have a raw block cache — lets us backfill the new versioned key
 * without waiting on Notion at all.
 */
async function reparseFromRawCache(): Promise<boolean> {
  const raw = await getCached<RawCache>(RAW_KEY);
  if (!raw) return false;

  await parseAndCacheWorkouts(raw.topLevel, raw.children, raw.pageLastEdited);
  return true;
}

/**
 * True when the raw cache has a numbered_list_item that has children in
 * Notion but no cached children entry — e.g. a child fetch that got dropped
 * after a 429 (and its one retry, see mapWithConcurrency) on a fresh volume
 * with no prior cache to fall back on. Without this check, `doRefresh` would
 * keep returning early forever once `pageLastEdited` stops changing, and
 * that block would silently stay empty until the page is next edited.
 */
function hasMissingChildren(raw: RawCache): boolean {
  return raw.topLevel.some(b => b.type === 'numbered_list_item' && b.has_children && !raw.children[b.id]);
}

async function doRefresh(force: boolean): Promise<void> {
  if (isNotionBackoffActive()) return; // still cooling down from a recent 429

  const pageLastEdited = await getPageLastEditedRemote();
  if (!pageLastEdited) return;

  const prevRaw = await getCached<RawCache>(RAW_KEY);
  if (!force && prevRaw && prevRaw.pageLastEdited === pageLastEdited && !hasMissingChildren(prevRaw)) {
    return; // nothing changed on the page, and nothing is missing from our cache
  }

  await incrementalCrawl(pageLastEdited, prevRaw);
}

function triggerRefresh(force: boolean): Promise<void> {
  if (state.inFlightPromise) return state.inFlightPromise;

  const now = Date.now();
  if (now < state.backoffUntil) return Promise.resolve();
  if (!force && now - state.lastCheckAt < THROTTLE_MS) return Promise.resolve();

  state.lastCheckAt = now;

  const promise = doRefresh(force)
    .then(() => {
      state.lastError = null;
      state.lastSuccessAt = Date.now();
    })
    .catch(err => {
      const rateLimited = isRateLimitError(err);
      if (rateLimited) {
        const retryAfterSeconds = getRetryAfterSeconds(err);
        state.backoffUntil = Date.now() + retryAfterSeconds * 1000;
        state.lastError = { message: 'Notion rate limit hit', at: Date.now(), rateLimited: true, retryAfterSeconds };
        console.error(`[notion-cache] 429 from Notion — backing off ${retryAfterSeconds}s`);
      } else {
        state.lastError = { message: err instanceof Error ? err.message : String(err), at: Date.now(), rateLimited: false };
        console.error('[notion-cache] refresh failed:', err);
      }
    })
    .finally(() => {
      state.inFlightPromise = null;
    });

  state.inFlightPromise = promise;
  return promise;
}

/** Single-flight wrapper around reparseFromRawCache — shares the same in-flight slot as a real crawl so the two never race each other. */
function triggerReparse(): Promise<void> {
  if (state.inFlightPromise) return state.inFlightPromise;

  const promise = reparseFromRawCache()
    .then(ok => {
      if (ok) {
        state.lastError = null;
        state.lastSuccessAt = Date.now();
      }
    })
    .catch(err => {
      state.lastError = { message: err instanceof Error ? err.message : String(err), at: Date.now(), rateLimited: false };
      console.error('[notion-cache] reparse from raw cache failed:', err);
    })
    .finally(() => {
      state.inFlightPromise = null;
    });

  state.inFlightPromise = promise;
  return promise;
}

/**
 * Reads cached parsed workouts (memory → disk), never touches the network.
 *
 * Fallback chain so a PARSER_VERSION bump never blanks the page:
 * 1. version-pinned key (`notion:workouts:v${PARSER_VERSION}`) — exact match, return as-is.
 * 2. non-versioned `last` key — return it immediately (caller should treat as
 *    stale via isRefreshing()) and kick a single-flight, zero-Notion-calls
 *    reparse of the raw block cache to backfill the versioned key.
 * 3. neither exists — return null; caller must fall back to a real crawl.
 */
export async function getCachedWorkouts(): Promise<CachedWorkouts | null> {
  const versioned = await getCached<CachedWorkouts>(WORKOUTS_KEY);
  if (versioned) return versioned;

  const last = await getCached<CachedWorkouts>(LAST_WORKOUTS_KEY);
  if (last) {
    void triggerReparse();
    return last;
  }

  return null;
}

/** Fire-and-forget: kicks a single-flight, throttled, 429-aware background refresh. */
export function requestBackgroundRefresh(opts?: { force?: boolean }): void {
  void triggerRefresh(opts?.force ?? false);
}

export function isRefreshing(): boolean {
  return state.inFlightPromise !== null;
}

export function getLastRefreshError(): RefreshError | null {
  return state.lastError;
}

/**
 * Cold-start helper: starts (or joins) a refresh and waits up to `maxWaitMs`
 * for it to finish. Used only when there is no cached data at all — every
 * other path returns cached data immediately and refreshes in the
 * background. The crawl keeps running after this resolves/times out (Fly.io
 * is an always-on process, not a serverless function, so the promise isn't
 * killed when the request returns).
 */
export async function ensureFreshEnough(maxWaitMs: number): Promise<void> {
  const promise = state.inFlightPromise ?? triggerRefresh(true);
  if (!promise) return;
  await Promise.race([promise, new Promise<void>(resolve => setTimeout(resolve, maxWaitMs))]);
}
