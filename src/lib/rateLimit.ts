/**
 * In-memory fixed-window rate limiter.
 *
 * Scope, stated plainly: this is per-process. It is real protection for this
 * single-instance demo, and it is NOT sufficient for a multi-instance deployment, where the
 * counters would need to live in Redis or similar. Documented in the README rather than
 * quietly implied to be more than it is.
 *
 * Used on the endpoints where repetition is abuse rather than usage: sign-in attempts,
 * review submission, and image upload.
 */

type Window = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Window>();

/** Drop expired buckets so a long-running process does not accumulate one entry per IP. */
function evictExpired(now: number): void {
  if (buckets.size < 5_000) return;
  for (const [key, window] of buckets) {
    if (window.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  /** Seconds until the window resets — surfaced as Retry-After. */
  retryAfterSeconds: number;
  remaining: number;
};

export function rateLimit({
  key,
  limit,
  windowMs,
}: {
  /** Should combine the action and the caller, e.g. `review:1.2.3.4`. */
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const now = Date.now();
  evictExpired(now);

  const existing = buckets.get(key);

  if (existing === undefined || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0, remaining: limit - 1 };
  }

  existing.count += 1;

  if (existing.count > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
      remaining: 0,
    };
  }

  return { allowed: true, retryAfterSeconds: 0, remaining: limit - existing.count };
}

/**
 * Best-effort caller identity.
 *
 * Behind a proxy the socket address is the proxy's, so we read the forwarded headers. Those
 * are client-controlled and therefore spoofable — which is precisely why this limiter is
 * documented as demo-grade rather than a security control.
 */
export function callerKey(request: Request, action: string): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'local';
  return `${action}:${ip}`;
}

/** Test seam: reset all windows. */
export function resetRateLimits(): void {
  buckets.clear();
}
