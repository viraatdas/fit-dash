import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

/**
 * Small durable JSON key/value store, independent of Redis.
 *
 * - In-memory layer: reads are served from a Map after the first disk read,
 *   so a warm process never pays filesystem latency.
 * - Disk layer: one JSON file per key, written atomically (tmp file + rename)
 *   so a crash or concurrent write never leaves a half-written file.
 * - Directory resolution: `CACHE_DIR` env if set, else `/data/fitdash-cache`
 *   when `/data` is writable (Fly volume mount), else `os.tmpdir()` in
 *   production (no volume mounted) or `.cache/` in local dev (gitignored).
 *
 * Any disk failure degrades to memory-only (still correct within the
 * process, just not durable across restarts) — callers never need to handle
 * store errors themselves.
 *
 * Module state lives on `globalThis`, not a plain module-level `let`/`const`:
 * Next.js's standalone output can give a route handler bundle and the page
 * bundle separate webpack module instances of "the same" imported file, so a
 * normal module singleton isn't actually shared across the whole app. One
 * real `globalThis` per Node process is.
 */

interface CacheStoreGlobalState {
  memory: Map<string, unknown>;
  resolvedDirPromise: Promise<string> | null;
}

const globalForCacheStore = globalThis as typeof globalThis & { __fitdashCacheStore?: CacheStoreGlobalState };
globalForCacheStore.__fitdashCacheStore ??= { memory: new Map(), resolvedDirPromise: null };
const state = globalForCacheStore.__fitdashCacheStore;

async function isWritableDir(dir: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) return false;
    await fs.access(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveCacheDir(): Promise<string> {
  const envDir = process.env.CACHE_DIR?.trim();
  let dir: string;

  if (envDir) {
    dir = envDir;
  } else if (await isWritableDir('/data')) {
    dir = path.join('/data', 'fitdash-cache');
  } else if (process.env.NODE_ENV === 'production') {
    dir = path.join(os.tmpdir(), 'fitdash-cache');
  } else {
    dir = path.join(process.cwd(), '.cache');
  }

  try {
    await fs.mkdir(dir, { recursive: true });
    return dir;
  } catch (err) {
    console.error(`[cache/store] cannot create cache dir "${dir}", falling back to tmpdir:`, err instanceof Error ? err.message : err);
    const fallback = path.join(os.tmpdir(), 'fitdash-cache');
    await fs.mkdir(fallback, { recursive: true }).catch(() => {});
    return fallback;
  }
}

function getCacheDir(): Promise<string> {
  if (!state.resolvedDirPromise) {
    state.resolvedDirPromise = resolveCacheDir();
  }
  return state.resolvedDirPromise;
}

function sanitizeKey(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9_.-]/g, '_');
  if (safe.length <= 150) return safe;
  const hash = crypto.createHash('sha1').update(key).digest('hex').slice(0, 12);
  return `${safe.slice(0, 100)}_${hash}`;
}

async function filePathFor(key: string): Promise<string> {
  const dir = await getCacheDir();
  return path.join(dir, `${sanitizeKey(key)}.json`);
}

export async function getCached<T>(key: string): Promise<T | null> {
  if (state.memory.has(key)) return state.memory.get(key) as T;

  try {
    const file = await filePathFor(key);
    const raw = await fs.readFile(file, 'utf8');
    const value = JSON.parse(raw) as T;
    state.memory.set(key, value);
    return value;
  } catch {
    return null;
  }
}

export async function setCached<T>(key: string, value: T): Promise<void> {
  state.memory.set(key, value);

  try {
    const file = await filePathFor(key);
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(value), 'utf8');
    await fs.rename(tmp, file);
  } catch (err) {
    console.error(`[cache/store] failed to persist key "${key}" to disk (kept in memory only):`, err instanceof Error ? err.message : err);
  }
}

export async function deleteCached(key: string): Promise<void> {
  state.memory.delete(key);
  try {
    const file = await filePathFor(key);
    await fs.unlink(file);
  } catch {
    // missing file is fine
  }
}

/**
 * Deletes every cached entry whose key starts with `prefix` (e.g. a whole
 * namespace like "exercise:norm:"). There's no index, so this does a
 * directory scan — fine for the small number of files this store holds.
 */
export async function deleteCachedByPrefix(prefix: string): Promise<number> {
  const sanitizedPrefix = sanitizeKey(prefix);
  let deleted = 0;

  try {
    const dir = await getCacheDir();
    const files = await fs.readdir(dir);
    await Promise.all(
      files
        .filter(f => f.startsWith(sanitizedPrefix) && f.endsWith('.json'))
        .map(async f => {
          await fs.unlink(path.join(dir, f)).catch(() => {});
          deleted++;
        })
    );
  } catch {
    // cache dir may not exist yet — nothing to delete
  }

  for (const key of Array.from(state.memory.keys())) {
    if (key.startsWith(prefix)) state.memory.delete(key);
  }

  return deleted;
}

/** Returns the in-memory value only, without touching disk. Useful for sync-ish fast paths. */
export function peekCached<T>(key: string): T | null {
  return state.memory.has(key) ? (state.memory.get(key) as T) : null;
}

/** Exposed for diagnostics/tests. */
export async function getCacheDirForDebug(): Promise<string> {
  return getCacheDir();
}
