/**
 * Classify remote sync failures. Only network / 5xx / rate-limit style errors retry.
 * Auth, validation, and ownership errors are non-retryable until the user fixes state.
 */
export function isRetryableSyncError(input: {
  message: string;
  code?: string | null;
  status?: number | null;
}): boolean {
  const code = (input.code ?? "").toLowerCase();
  const message = input.message.toLowerCase();
  const status = input.status ?? null;

  if (status != null) {
    if (status === 401 || status === 403 || status === 404 || status === 409 || status === 422) {
      return false;
    }
    if (status === 408 || status === 429 || status >= 500) return true;
    if (status >= 400 && status < 500) return false;
  }

  if (
    code.includes("not authenticated") ||
    message.includes("not authenticated") ||
    message.includes("jwt") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("permission") ||
    message.includes("validation") ||
    message.includes("invalid") ||
    message.includes("unsupported operation") ||
    message.includes("client_operation_id required")
  ) {
    return false;
  }

  if (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("temporar") ||
    message.includes("unavailable") ||
    message.includes("econn") ||
    message.includes("fetch") ||
    code.includes("timeout") ||
    code === "503" ||
    code === "502" ||
    code === "504" ||
    code === "429"
  ) {
    return true;
  }

  // Default: treat unknown transport failures as retryable; explicit conflicts handled separately.
  if (message.includes("unique") || message.includes("conflict") || code === "23505") {
    return false;
  }

  return true;
}

export function isConflictSyncError(input: { message: string; code?: string | null }): boolean {
  const code = (input.code ?? "").toLowerCase();
  const message = input.message.toLowerCase();
  return (
    code === "23505" ||
    message.includes("unique_violation") ||
    message.includes("duplicate key") ||
    (message.includes("conflict") && !message.includes("not authenticated"))
  );
}
