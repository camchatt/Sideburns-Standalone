import type { SupabaseClient } from "@supabase/supabase-js";
import type { RemoteSyncAdapter, RemoteSyncApplyResult } from "@/features/sync/types/sync";
import { mapRemoteSyncReceipt } from "@/lib/supabase/mappers";
import {
  parseRemoteSyncOperationReceiptRow,
  remoteSyncOperationTypeSchema,
  remoteEntityTableSchema,
} from "@/lib/supabase/remoteSchemas";
import { isConflictSyncError, isRetryableSyncError } from "@/features/sync/utils/retryClassification";

/**
 * Calls SIDEBURNS `apply_sync_operation` and maps the receipt into domain ack types.
 * UI must never import this — wire through SyncService only.
 */
export function createSupabaseRemoteSyncAdapter(client: SupabaseClient): RemoteSyncAdapter {
  return {
    backend: "supabase",
    async apply(request): Promise<RemoteSyncApplyResult> {
      const operationType = remoteSyncOperationTypeSchema.parse(request.operationType);
      const entityTable = remoteEntityTableSchema.parse(request.entityTable);

      const rpcName = entityTable === "shared_beacons" ? "apply_shared_beacon_operation" : "apply_sync_operation";
      const { data, error } = await client.rpc(rpcName, {
        p_client_operation_id: request.clientOperationId,
        p_operation_type: operationType,
        p_entity_id: request.entityId,
        p_entity_table: entityTable,
        p_payload: request.payload ?? {},
        p_payload_hash: request.payloadHash,
      });

      if (error) {
        const message = error.message || "Remote sync apply failed";
        const code = error.code ?? null;
        if (isConflictSyncError({ message, code })) {
          return { kind: "conflict", message, remotePayload: null };
        }
        return {
          kind: "error",
          message,
          retryable: isRetryableSyncError({
            message,
            code,
            // PostgrestError exposes code/message, not HTTP status.
            status: null,
          }),
          code,
        };
      }

      try {
        const row = parseRemoteSyncOperationReceiptRow(data);
        const receipt = mapRemoteSyncReceipt(row);
        const duplicateDelivery = receipt.clientOperationId === request.clientOperationId;
        return {
          kind: "acknowledged",
          receiptId: row.id,
          appliedAt: receipt.appliedAt,
          // Server returns existing receipt on retry — still an explicit ack.
          duplicateDelivery,
        };
      } catch (parseError) {
        return {
          kind: "error",
          message:
            parseError instanceof Error
              ? `Invalid sync receipt: ${parseError.message}`
              : "Invalid sync receipt",
          retryable: false,
          code: "invalid_receipt",
        };
      }
    },
  };
}
