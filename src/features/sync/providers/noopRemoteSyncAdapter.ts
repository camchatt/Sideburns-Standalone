import type { RemoteSyncAdapter, RemoteSyncApplyResult } from "@/features/sync/types/sync";

/** Sample / local-only mode — never contacts a remote backend. */
export function createNoopRemoteSyncAdapter(): RemoteSyncAdapter {
  return {
    backend: "none",
    async apply(): Promise<RemoteSyncApplyResult> {
      return {
        kind: "error",
        message: "Remote sync is disabled in sample / local-only mode",
        retryable: false,
        code: "sync_disabled",
      };
    },
  };
}
