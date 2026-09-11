type RateLimitBucket = {
  windowStartMs: number;
  count: number;
  lastSeenMs: number;
};

type CheckRateLimitParams = {
  key: string;
  limit: number;
  windowMs: number;
  nowMs?: number;
};

type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

const buckets = new Map<string, RateLimitBucket>();
const MAX_BUCKETS_BEFORE_CLEANUP = 20_000;

const cleanupOldBuckets = (nowMs: number, windowMs: number) => {
  if (buckets.size <= MAX_BUCKETS_BEFORE_CLEANUP) return;

  const maxAgeMs = windowMs * 10;
  buckets.forEach((bucket, key) => {
    if (nowMs - bucket.lastSeenMs > maxAgeMs) {
      buckets.delete(key);
    }
  });
};

export const checkRateLimit = ({
  key,
  limit,
  windowMs,
  nowMs = Date.now(),
}: CheckRateLimitParams): RateLimitResult => {
  cleanupOldBuckets(nowMs, windowMs);

  const current = buckets.get(key);

  if (!current || nowMs - current.windowStartMs >= windowMs) {
    buckets.set(key, {
      windowStartMs: nowMs,
      count: 1,
      lastSeenMs: nowMs,
    });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (current.count >= limit) {
    current.lastSeenMs = nowMs;
    const retryAfterMs = Math.max(
      0,
      current.windowStartMs + windowMs - nowMs
    );
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  current.count += 1;
  current.lastSeenMs = nowMs;

  return { allowed: true, retryAfterSeconds: 0 };
};

export const getRequestIp = (
  req: Request,
  server?: { requestIP: (req: Request) => { address: string } | null }
): string => {
  // The real socket address, when available, can't be spoofed by the
  // client — prefer it over headers. Without it (e.g. no `server` passed),
  // every client falls into the same "unknown" bucket, which turns a
  // per-client rate limit into a room-wide one.
  const socketAddress = server?.requestIP?.(req)?.address;
  if (socketAddress) return socketAddress;

  // Fall back to proxy headers for deployments that terminate TLS in front
  // of the Bun process (these are client-supplied and spoofable).
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || "unknown";
  }

  return req.headers.get("x-real-ip") || "unknown";
};

export const resetRateLimiterForTests = () => {
  buckets.clear();
};