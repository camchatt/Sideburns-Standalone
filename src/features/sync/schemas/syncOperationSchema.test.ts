import { describe, expect, it } from "vitest";
import { syncOperationSchema } from "@/features/sync/schemas/syncOperationSchema";

describe("syncOperationSchema", () => {
  it("accepts Postgres timestamptz offsets on remote acknowledgements", () => {
    const parsed = syncOperationSchema.parse({
      id: "sync_1",
      idempotencyKey: "sync_1",
      type: "sidequest.create",
      entityId: "sq_local_1",
      entityTable: "shared_beacons",
      payload: {},
      payloadHash: null,
      status: "synced",
      createdAt: "2026-08-04T02:00:00.000Z",
      updatedAt: "2026-08-04T02:00:01.000Z",
      attemptCount: 1,
      nextAttemptAt: null,
      remoteReceiptId: "receipt_1",
      remoteAppliedAt: "2026-08-04T02:00:01.123456+00:00",
    });

    expect(parsed.remoteAppliedAt).toBe("2026-08-04T02:00:01.123456+00:00");
  });
});
