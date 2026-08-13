import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteDB } from "idb";
import {
  closePlayaDatabaseForTests,
  PLAYA_DATABASE_NAME,
} from "@/lib/storage/playaDatabase";
import { createIndexedDbSyncRepository } from "@/features/sync/repositories/indexedDbSyncRepository";
import { createMemorySyncRepository } from "@/features/sync/repositories/memorySyncRepository";
import { createSyncService } from "@/features/sync/services/syncService";
import type {
  AuthSession,
  AuthProvider,
} from "@/features/auth/types/auth";
import type {
  RemoteSyncAdapter,
  RemoteSyncApplyResult,
  SyncOperation,
} from "@/features/sync/types/sync";
import { computeBackoffDelayMs, nextAttemptAtIso } from "@/features/sync/utils/backoff";
import { isConflictSyncError, isRetryableSyncError } from "@/features/sync/utils/retryClassification";
import {
  buildSidequestOutboxOp,
  putWithOutbox,
} from "@/features/sync/utils/atomicEnqueue";
import { getPlayaDatabase } from "@/lib/storage/playaDatabase";
import { parseSidequest } from "@/features/sidequests/types/sidequest";
import { createLocalFirstSidequestProvider, createIndexedDbSidequestRepository } from "@/features/sidequests/repositories/indexedDbSidequestRepository";
import { SAMPLE_SIDEQUESTS } from "@/data/sample/sidequests";
import { createDataProviders } from "@/data/adapters/createDataProviders";
import { parseEnv } from "@/lib/validation/env";
import { createNoopRemoteSyncAdapter } from "@/features/sync/providers/noopRemoteSyncAdapter";

function authWith(session: AuthSession): AuthProvider {
  let current = session;
  const listeners = new Set<(s: AuthSession) => void>();
  return {
    async getSession() {
      return current;
    },
    async signOut() {
      current = null;
      listeners.forEach((l) => l(null));
    },
    async signInAnonymously() {
      current = {
        userId: "11111111-1111-4111-8111-111111111111",
        displayName: null,
        email: null,
        isAnonymous: true,
      };
      listeners.forEach((l) => l(current));
      return current;
    },
    onAuthStateChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function remoteMock(
  impl: (req: { clientOperationId: string }) => Promise<RemoteSyncApplyResult> | RemoteSyncApplyResult,
): RemoteSyncAdapter {
  return {
    backend: "supabase",
    apply: async (req) => impl(req),
  };
}

describe("sync backoff + retry classification", () => {
  it("bounds exponential backoff with jitter", () => {
    const delay = computeBackoffDelayMs(3, { random: () => 1, baseMs: 1000, maxMs: 60_000 });
    expect(delay).toBe(8001);
    const capped = computeBackoffDelayMs(20, { random: () => 1, baseMs: 1000, maxMs: 60_000 });
    expect(capped).toBe(60_001);
    expect(Date.parse(nextAttemptAtIso(0, new Date("2026-08-03T00:00:00.000Z"), { random: () => 0 }))).toBe(
      Date.parse("2026-08-03T00:00:00.000Z"),
    );
  });

  it("classifies retryable vs non-retryable and conflicts", () => {
    expect(isRetryableSyncError({ message: "Failed to fetch", status: null })).toBe(true);
    expect(isRetryableSyncError({ message: "not authenticated", status: 401 })).toBe(false);
    expect(isRetryableSyncError({ message: "server boom", status: 503 })).toBe(true);
    expect(isConflictSyncError({ message: "duplicate key value", code: "23505" })).toBe(true);
  });
});

describe("memory sync repository", () => {
  it("preserves failed and conflict rows and requires manual retry for non-backoff failures", async () => {
    const repo = createMemorySyncRepository();
    const op = await repo.enqueue({
      type: "sidequest.create",
      entityId: "sq_1",
      payload: { title: "A" },
    });
    expect(op.idempotencyKey).toBe(op.id);

    await repo.markFailed(op.id, "validation", { nextAttemptAt: null });
    expect((await repo.listDue()).map((row) => row.id)).not.toContain(op.id);

    await repo.markConflict(op.id, {
      localPayload: { title: "A" },
      remotePayload: { title: "B" },
      message: "conflict",
    });
    const all = await repo.listAll();
    expect(all[0]?.status).toBe("conflict");
    expect(all[0]?.conflict?.localPayload).toEqual({ title: "A" });
  });
});

describe("IndexedDB sync outbox", () => {
  beforeEach(async () => {
    await closePlayaDatabaseForTests();
    await deleteDB(PLAYA_DATABASE_NAME);
  });

  it("persists outbox rows across database reopen (reload)", async () => {
    const repo = createIndexedDbSyncRepository();
    const created = await repo.enqueue({
      type: "progress.upsert",
      entityId: "qp_1",
      payload: { phase: "saved" },
    });

    await closePlayaDatabaseForTests();
    const again = createIndexedDbSyncRepository();
    const listed = await again.listAll();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(created.id);
    expect(listed[0]?.idempotencyKey).toBe(created.idempotencyKey);
  });

  it("writes entity + outbox atomically", async () => {
    const sidequest = parseSidequest({
      id: "sq_local_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      title: "Atomic",
      description: "",
      location: { latitude: 40.78, longitude: -119.2 },
      radiusMeters: 30,
      category: "explore",
      availability: "always",
      difficulty: "easy",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
      syncStatus: "pending",
      origin: "local",
      completionRule: "open",
    });
    const op = await buildSidequestOutboxOp("sidequest.create", sidequest);
    await putWithOutbox({ store: "sidequests", entity: sidequest, operation: op });

    const db = await getPlayaDatabase();
    expect(await db.get("sidequests", sidequest.id)).toBeTruthy();
    expect(await db.get("syncOutbox", op.id)).toBeTruthy();
  });

  it("enqueues on local sidequest create", async () => {
    const provider = createLocalFirstSidequestProvider({
      seed: SAMPLE_SIDEQUESTS,
      repository: createIndexedDbSidequestRepository(),
    });
    const created = await provider.create({
      title: "Outbox create",
      description: "local",
      location: { latitude: 40.78, longitude: -119.2 },
      radiusMeters: 25,
      category: "art",
      availability: "always",
      difficulty: "easy",
    });
    const repo = createIndexedDbSyncRepository();
    const ops = await repo.listAll();
    expect(ops.some((op) => op.entityId === created.id && op.type === "sidequest.create")).toBe(true);
  });
});

describe("sync service", () => {
  beforeEach(async () => {
    await closePlayaDatabaseForTests();
    await deleteDB(PLAYA_DATABASE_NAME);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  });

  it("requires explicit remote acknowledgement before marking synced", async () => {
    const repo = createMemorySyncRepository();
    const calls: string[] = [];
    const remote = remoteMock(async (req) => {
      calls.push(req.clientOperationId);
      return {
        kind: "acknowledged",
        receiptId: "receipt-1",
        appliedAt: "2026-08-03T12:00:00.000Z",
        duplicateDelivery: false,
      };
    });
    const service = createSyncService({
      repository: repo,
      remote,
      auth: authWith({
        userId: "11111111-1111-4111-8111-111111111111",
        displayName: null,
        email: null,
        isAnonymous: true,
      }),
    });

    const op = await repo.enqueue({
      type: "sidequest.create",
      entityId: "sq_1",
      payload: { title: "Dust" },
      payloadHash: "abc",
    });

    const result = await service.drain();
    expect(result.synced).toBe(1);
    expect(calls).toEqual([op.idempotencyKey]);
    const synced = await repo.get(op.id);
    expect(synced?.status).toBe("synced");
    expect(synced?.remoteReceiptId).toBe("receipt-1");
  });

  it("treats duplicate delivery receipts as successful ack", async () => {
    const repo = createMemorySyncRepository();
    let deliveries = 0;
    const remote = remoteMock(async () => {
      deliveries += 1;
      return {
        kind: "acknowledged",
        receiptId: "receipt-dup",
        appliedAt: "2026-08-03T12:00:00.000Z",
        duplicateDelivery: deliveries > 1,
      };
    });
    const service = createSyncService({
      repository: repo,
      remote,
      auth: authWith({
        userId: "11111111-1111-4111-8111-111111111111",
        displayName: null,
        email: null,
      }),
    });
    const op = await repo.enqueue({
      type: "completion.create",
      entityId: "qc_1",
      payload: { sidequest_id: "sq_1" },
    });
    await service.drain();
    await repo.retry(op.id);
    const second = await service.drain();
    expect(second.synced).toBe(1);
    expect((await repo.get(op.id))?.status).toBe("synced");
  });

  it("automatically establishes anonymous auth when public work is pending", async () => {
    const repo = createMemorySyncRepository();
    const auth = authWith({
      userId: "11111111-1111-4111-8111-111111111111",
      displayName: null,
      email: null,
    });
    const remote = remoteMock(async () => ({
      kind: "acknowledged",
      receiptId: "r1",
      appliedAt: "2026-08-03T12:00:00.000Z",
      duplicateDelivery: false,
    }));
    const service = createSyncService({ repository: repo, remote, auth });
    await repo.enqueue({
      type: "sidequest.update",
      entityId: "sq_1",
      payload: { title: "X" },
    });
    await auth.signOut();
    const result = await service.drain();
    expect(result.paused).toBe(false);
    expect(result.synced).toBe(1);
    expect((await repo.listAll())[0]?.status).toBe("synced");
    expect((await auth.getSession())?.isAnonymous).toBe(true);
  });

  it("does not create an anonymous account when the outbox is empty", async () => {
    const repo = createMemorySyncRepository();
    const auth = authWith(null);
    const signIn = vi.spyOn(auth, "signInAnonymously");
    const service = createSyncService({
      repository: repo,
      remote: remoteMock(async () => ({
        kind: "acknowledged",
        receiptId: "unused",
        appliedAt: "2026-08-03T12:00:00.000Z",
        duplicateDelivery: false,
      })),
      auth,
    });

    const result = await service.drain();
    expect(result.paused).toBe(true);
    expect(signIn).not.toHaveBeenCalled();
  });

  it("applies backoff on retryable errors and keeps the operation", async () => {
    const repo = createMemorySyncRepository();
    const now = new Date("2026-08-03T00:00:00.000Z");
    const remote = remoteMock(async () => ({
      kind: "error",
      message: "Failed to fetch",
      retryable: true,
    }));
    const service = createSyncService({
      repository: repo,
      remote,
      auth: authWith({
        userId: "11111111-1111-4111-8111-111111111111",
        displayName: null,
        email: null,
      }),
      now: () => now,
    });
    const op = await repo.enqueue({
      type: "progress.upsert",
      entityId: "qp_1",
      payload: { phase: "saved" },
    });
    const result = await service.drain();
    expect(result.failed).toBe(1);
    const failed = await repo.get(op.id);
    expect(failed?.status).toBe("failed");
    expect(failed?.nextAttemptAt).toBeTruthy();
    expect(failed?.attemptCount).toBe(1);
    // Not due yet if nextAttemptAt is in the future
    expect((await repo.listDue(now)).map((row) => row.id)).not.toContain(op.id);
  });

  it("does not auto-retry non-retryable errors", async () => {
    const repo = createMemorySyncRepository();
    const remote = remoteMock(async () => ({
      kind: "error",
      message: "not authenticated",
      retryable: false,
    }));
    const service = createSyncService({
      repository: repo,
      remote,
      auth: authWith({
        userId: "11111111-1111-4111-8111-111111111111",
        displayName: null,
        email: null,
      }),
    });
    const op = await repo.enqueue({
      type: "sidequest.create",
      entityId: "sq_1",
      payload: { title: "X" },
    });
    await service.drain();
    expect((await repo.get(op.id))?.nextAttemptAt).toBeNull();
    expect(await repo.listDue()).toHaveLength(0);
  });

  it("preserves conflict payloads and never silently discards them", async () => {
    const repo = createMemorySyncRepository();
    const remote = remoteMock(async () => ({
      kind: "conflict",
      message: "unique_violation",
      remotePayload: { id: "other" },
    }));
    const service = createSyncService({
      repository: repo,
      remote,
      auth: authWith({
        userId: "11111111-1111-4111-8111-111111111111",
        displayName: null,
        email: null,
      }),
    });
    const op = await repo.enqueue({
      type: "progress.upsert",
      entityId: "qp_1",
      payload: { sidequest_id: "sq_1", phase: "saved" },
    });
    await service.drain();
    const conflicted = await repo.get(op.id);
    expect(conflicted?.status).toBe("conflict");
    expect(conflicted?.conflict?.localPayload).toEqual({
      sidequest_id: "sq_1",
      phase: "saved",
    });
    expect(conflicted?.conflict?.remotePayload).toEqual({ id: "other" });
    expect(await repo.listDue()).toHaveLength(0);
  });

  it("sample / noop adapter keeps local mode operational without credentials", async () => {
    const repo = createMemorySyncRepository();
    const service = createSyncService({
      repository: repo,
      remote: createNoopRemoteSyncAdapter(),
      auth: authWith(null),
    });
    await repo.enqueue({
      type: "sidequest.create",
      entityId: "sq_1",
      payload: { title: "Local" },
    });
    const result = await service.drain();
    expect(result.paused).toBe(true);
    expect(result.pauseReason).toMatch(/local-only|disabled/i);
    expect((await repo.listAll())[0]?.status).toBe("pending");
  });

  it("drains when auth becomes available via onAuthStateChange", async () => {
    const repo = createMemorySyncRepository();
    const auth = authWith(null);
    const remote = remoteMock(async () => ({
      kind: "acknowledged",
      receiptId: "r-auth",
      appliedAt: "2026-08-03T12:00:00.000Z",
      duplicateDelivery: false,
    }));
    const service = createSyncService({ repository: repo, remote, auth });
    await repo.enqueue({
      type: "sidequest.create",
      entityId: "sq_1",
      payload: { title: "Wait" },
    });
    const stop = service.start();
    await auth.signInAnonymously!();
    // allow async drain from auth listener
    await vi.waitFor(async () => {
      expect((await repo.listAll())[0]?.status).toBe("synced");
    });
    stop();
  });
});

describe("provider selection honesty", () => {
  it("never reports supabase catalog while serving sample event data", () => {
    const sample = createDataProviders(parseEnv({}));
    expect(sample.catalogSource).toBe("sample");
    expect(sample.syncBackend).toBe("none");

    const supabase = createDataProviders(
      parseEnv({
        VITE_DATA_PROVIDER: "supabase",
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
      }),
    );
    expect(supabase.dataProviderId).toBe("supabase");
    expect(supabase.catalogSource).toBe("sample");
    expect(supabase.eventData.source).toBe("sample");
    expect(supabase.remoteSyncEnabled).toBe(true);
    expect(supabase.syncBackend).toBe("supabase");
  });
});

describe("sync operation shape", () => {
  it("keeps stable id and idempotency key aligned", async () => {
    const repo = createMemorySyncRepository();
    const op: SyncOperation = await repo.enqueue({
      type: "completion.delete",
      entityId: "qc_1",
      payload: { deleted: true },
      id: "sync_fixed",
      idempotencyKey: "sync_fixed",
    });
    expect(op.id).toBe("sync_fixed");
    expect(op.idempotencyKey).toBe("sync_fixed");
    expect(op.entityTable).toBe("user_quest_completions");
  });
});
