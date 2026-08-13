/**
 * Classify and wrap IndexedDB / quota failures so UI can offer recovery messaging
 * without leaking storage engine details.
 */

export class LocalPersistenceError extends Error {
  readonly code = "local_persistence_failed" as const;
  readonly recoveryHint: string;
  readonly cause?: unknown;

  constructor(message: string, options?: { cause?: unknown; recoveryHint?: string }) {
    super(message);
    this.name = "LocalPersistenceError";
    this.cause = options?.cause;
    this.recoveryHint =
      options?.recoveryHint ??
      "Free space on this device, then retry. Your entered details stay in this form until save succeeds.";
  }
}

export function isQuotaExceededError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  if (name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED") return true;
  if ("code" in error && (error.code === 22 || error.code === 1014)) return true;
  return false;
}

export function toLocalPersistenceError(error: unknown, action = "save"): LocalPersistenceError {
  if (error instanceof LocalPersistenceError) return error;
  if (isQuotaExceededError(error)) {
    return new LocalPersistenceError(`Could not ${action}: this device is out of storage space.`, {
      cause: error,
      recoveryHint:
        "Free space or remove an unused playa pack under Offline readiness, then retry. Draft text is kept in this session.",
    });
  }
  const message = error instanceof Error ? error.message : "Unknown storage error";
  return new LocalPersistenceError(`Could not ${action} on this device (${message}).`, {
    cause: error,
    recoveryHint:
      "Retry when storage is available. Your entered details stay in this form until the write succeeds.",
  });
}

export async function withLocalPersistence<T>(action: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error: unknown) {
    throw toLocalPersistenceError(error, action);
  }
}
