import { Redis } from '@upstash/redis';

// Circuit breaker: after a Redis failure (dead host, timeout, etc.) skip Redis
// entirely for a cooldown window so a dead backend costs ~0ms instead of
// paying connection/DNS/retry latency on every call.
const BREAKER_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes
const REQUEST_TIMEOUT_MS = 1500;

let breakerOpenUntil = 0;
let rawClient: Redis | null = null;
let wrappedClient: Redis | null = null;
let clientIdentity: string | null = null;

function trimEnv(value: string | undefined): string | undefined {
  // Local .env.local (pulled via `vercel env pull`) has been seen with a
  // literal trailing "\n" baked into quoted values — strip stray whitespace
  // so a bad local env doesn't turn into a broken request.
  return value?.trim();
}

function tripBreaker(err: unknown) {
  const wasClosed = Date.now() >= breakerOpenUntil;
  breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS;
  if (wasClosed) {
    console.error(
      `[redis] circuit breaker OPEN for ${BREAKER_COOLDOWN_MS / 1000}s after failure:`,
      err instanceof Error ? err.message : err
    );
  }
}

// Proxy every method call so any failure (dead DNS, timeout, etc.) trips the
// breaker while still surfacing the original error to the caller's own
// try/catch (existing call sites already degrade gracefully on error).
function wrapClient(target: Redis): Redis {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver);
      if (typeof value !== 'function') return value;
      return (...args: unknown[]) => {
        let result: unknown;
        try {
          result = value.apply(obj, args);
        } catch (err) {
          tripBreaker(err);
          throw err;
        }
        if (result instanceof Promise) {
          return result.catch((err: unknown) => {
            tripBreaker(err);
            throw err;
          });
        }
        return result;
      };
    },
  }) as Redis;
}

/**
 * Returns a Redis client, or null when Redis is unconfigured OR the circuit
 * breaker is currently open (recent failure). Callers already treat `null`
 * as "no cache available" and fall back gracefully, so this keeps every
 * Redis consumer fast when the backend is dead.
 */
export function getRedis(): Redis | null {
  const url = trimEnv(process.env.UPSTASH_REDIS_REST_URL);
  const token = trimEnv(process.env.UPSTASH_REDIS_REST_TOKEN);
  if (!url || !token) return null;

  if (Date.now() < breakerOpenUntil) {
    return null;
  }

  const identity = `${url}::${token}`;
  if (!rawClient || clientIdentity !== identity) {
    rawClient = new Redis({
      url,
      token,
      retry: false, // no built-in backoff/retries — fail fast, breaker handles the rest
      signal: () => AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    wrappedClient = wrapClient(rawClient);
    clientIdentity = identity;
  }

  return wrappedClient;
}

/** True when the breaker is currently skipping Redis. Useful for diagnostics. */
export function isRedisBreakerOpen(): boolean {
  return Date.now() < breakerOpenUntil;
}
