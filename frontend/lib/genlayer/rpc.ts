// Read guard for the GenLayer RPC.
//
// Studionet allows 60 `gen_call` per minute per IP, and a single page load fires
// several reads at once: the stats strip, the pledge list (which pages through
// `get_pledges`), and the account view each ask for their own data. Without a
// guard the site trips the quota, and a throttled read surfaces as a failed
// load, which reads like a broken contract rather than a rate limit.
//
// Three protections, each aimed at that limit:
//   - a serialized queue that spaces calls at least `minGapMs` apart (≈57/min),
//   - a short TTL cache with in-flight de-duplication, so a StrictMode double
//     mount or two components asking the same question cost one call,
//   - backoff on throttling-shaped errors only. A real contract error is never
//     retried and never cached.

export const RPC_LIMITS = {
  /** 1050 ms ≈ 57 calls/min, always under the 60/min quota. */
  minGapMs: 1050,
  backoffMs: 1500,
  maxRetries: 3,
  maxCacheKeys: 128,
} as const;

/** How long a successful read may be reused. */
export const READ_TTL_MS = 5_000;

const RATE_LIMIT = /\b429\b|rate.?limit|too many requests|quota|limit exceeded/i;

export function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return RATE_LIMIT.test(message);
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Slots are reserved on arrival, so concurrent callers keep their order and the
// spacing holds even under a burst.
let nextSlot = 0;

function reserveSlot(): Promise<void> {
  const start = Math.max(Date.now(), nextSlot);
  nextSlot = start + RPC_LIMITS.minGapMs;
  const wait = start - Date.now();
  return wait <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, wait));
}

/** Run one RPC call, spaced from its neighbours and retried only when throttled. */
export async function rpcGate<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    await reserveSlot();
    try {
      return await run();
    } catch (error) {
      if (attempt >= RPC_LIMITS.maxRetries || !isRateLimitError(error)) throw error;
      // Jitter keeps two tabs from coming back in lockstep.
      await sleep(RPC_LIMITS.backoffMs * 2 ** attempt + Math.random() * 400);
    }
  }
}

interface CacheEntry {
  expires: number;
  value: unknown;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();

function pruneCache(now: number): void {
  if (cache.size <= RPC_LIMITS.maxCacheKeys) return;
  for (const [key, entry] of cache) {
    if (entry.expires <= now) cache.delete(key);
  }
  for (const key of cache.keys()) {
    if (cache.size <= RPC_LIMITS.maxCacheKeys) break;
    cache.delete(key);
  }
}

/** Cache key for one view call. Bigint arguments are written as decimal strings. */
export function readKey(functionName: string, args: Array<string | bigint> = []): string {
  return `${functionName}(${args.map((arg) => String(arg)).join(",")})`;
}

/**
 * Read through the guard: served from cache while fresh, otherwise one shared
 * call per key. Failures are never cached, so a retry can succeed.
 */
export function rpcRead<T>(key: string, ttlMs: number, run: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return Promise.resolve(hit.value as T);

  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const call = rpcGate(run)
    .then((value) => {
      if (ttlMs > 0) {
        cache.set(key, { expires: Date.now() + ttlMs, value });
        pruneCache(Date.now());
      }
      return value;
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, call);
  return call;
}

/** Drop cached reads. Call after any write: the state those reads described has changed. */
export function rpcClear(): void {
  cache.clear();
}
