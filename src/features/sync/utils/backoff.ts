/** Bounded exponential backoff with full jitter (AWS-style). */
export const SYNC_BACKOFF_BASE_MS = 1_000;
export const SYNC_BACKOFF_MAX_MS = 5 * 60 * 1_000;
export const SYNC_BACKOFF_MAX_ATTEMPTS_SOFT = 12;

export function computeBackoffDelayMs(
  attemptCount: number,
  options?: {
    baseMs?: number;
    maxMs?: number;
    random?: () => number;
  },
): number {
  const baseMs = options?.baseMs ?? SYNC_BACKOFF_BASE_MS;
  const maxMs = options?.maxMs ?? SYNC_BACKOFF_MAX_MS;
  const random = options?.random ?? Math.random;
  const exp = Math.max(0, attemptCount);
  const capped = Math.min(maxMs, baseMs * 2 ** exp);
  return Math.floor(random() * (capped + 1));
}

export function nextAttemptAtIso(
  attemptCount: number,
  now: Date = new Date(),
  options?: Parameters<typeof computeBackoffDelayMs>[1],
): string {
  const delay = computeBackoffDelayMs(attemptCount, options);
  return new Date(now.getTime() + delay).toISOString();
}
