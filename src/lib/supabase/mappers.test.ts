import { describe, expect, it } from "vitest";
import {
  mapRemoteCompletionToDomain,
  mapRemoteEventPackToCatalog,
  mapRemoteProgressToDomain,
  mapRemoteUserSidequestToDomain,
  sidequestToRemoteApplyPayload,
} from "@/lib/supabase/mappers";
import {
  parseRemoteUserSidequestRow,
  remoteSidequestApplyPayloadSchema,
} from "@/lib/supabase/remoteSchemas";

const baseSidequestRow = {
  id: "sq_local_11111111-1111-4111-8111-111111111111",
  owner_id: "22222222-2222-4222-8222-222222222222",
  title: "Dust walk",
  description: "Find the shade",
  latitude: 40.7864,
  longitude: -119.2065,
  accuracy_meters: 12,
  altitude_meters: null,
  radius_meters: 40,
  category: "explore" as const,
  availability: "always" as const,
  difficulty: "easy" as const,
  placement_kind: "exact" as const,
  completion_rule: "proximity" as const,
  pack_id: null,
  created_at: "2026-08-01T12:00:00.000Z",
  updated_at: "2026-08-02T12:00:00.000Z",
  deleted_at: null,
};

describe("Supabase remote DTO boundary", () => {
  it("maps user_sidequests rows into domain Sidequest without leaking snake_case", () => {
    const row = parseRemoteUserSidequestRow(baseSidequestRow);
    const domain = mapRemoteUserSidequestToDomain(row);

    expect(domain).toMatchObject({
      id: baseSidequestRow.id,
      title: "Dust walk",
      radiusMeters: 40,
      completionRule: "proximity",
      syncStatus: "synced",
      origin: "local",
    });
    expect(domain.location).toEqual({
      latitude: 40.7864,
      longitude: -119.2065,
      accuracyMeters: 12,
      altitudeMeters: null,
    });
    expect(domain).not.toHaveProperty("owner_id");
    expect(domain).not.toHaveProperty("latitude");
  });

  it("rejects soft-deleted rows from active domain mapping", () => {
    const row = parseRemoteUserSidequestRow({
      ...baseSidequestRow,
      deleted_at: "2026-08-03T00:00:00.000Z",
    });
    expect(() => mapRemoteUserSidequestToDomain(row)).toThrow(/soft-deleted/);
  });

  it("round-trips domain sidequests into apply_sync_operation payload shape", () => {
    const domain = mapRemoteUserSidequestToDomain(parseRemoteUserSidequestRow(baseSidequestRow));
    const payload = sidequestToRemoteApplyPayload(domain);
    expect(remoteSidequestApplyPayloadSchema.parse(payload)).toMatchObject({
      title: "Dust walk",
      latitude: 40.7864,
      radius_meters: 40,
      completion_rule: "proximity",
    });
  });

  it("maps progress and completion rows into domain types", () => {
    const progress = mapRemoteProgressToDomain({
      id: "qp_local_33333333-3333-4333-8333-333333333333",
      owner_id: baseSidequestRow.owner_id,
      sidequest_id: baseSidequestRow.id,
      phase: "completed",
      saved_at: "2026-08-01T13:00:00.000Z",
      begun_at: "2026-08-01T14:00:00.000Z",
      completed_at: "2026-08-01T15:00:00.000Z",
      notes: "Done",
      created_at: "2026-08-01T13:00:00.000Z",
      updated_at: "2026-08-01T15:00:00.000Z",
      deleted_at: null,
    });
    expect(progress.sidequestId).toBe(baseSidequestRow.id);
    expect(progress.syncStatus).toBe("synced");

    const completion = mapRemoteCompletionToDomain({
      id: "qc_local_44444444-4444-4444-8444-444444444444",
      owner_id: baseSidequestRow.owner_id,
      sidequest_id: baseSidequestRow.id,
      completed_at: "2026-08-01T15:00:00.000Z",
      notes: "Done",
      created_at: "2026-08-01T15:00:00.000Z",
      updated_at: "2026-08-01T15:00:00.000Z",
      deleted_at: null,
    });
    expect(completion.sidequestId).toBe(baseSidequestRow.id);
  });

  it("maps only published alive event_packs into catalog entries", () => {
    const entry = mapRemoteEventPackToCatalog({
      pack_id: "bm-2026-demo",
      name: "BM 2026 demo",
      event_year: 2026,
      format_version: "playa-pack-0.1.0",
      content_version: "2026.1.0",
      catalog_url: "https://example.test/packs/bm-2026-demo/manifest.json",
      total_byte_size: 1024,
      map_package_id: "bm-2026-demo-map",
      is_published: true,
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
      deleted_at: null,
    });
    expect(entry.packId).toBe("bm-2026-demo");
    expect(entry).not.toHaveProperty("is_published");

    expect(() =>
      mapRemoteEventPackToCatalog({
        pack_id: "hidden",
        name: "Hidden",
        event_year: 2026,
        format_version: "playa-pack-0.1.0",
        content_version: "2026.1.0",
        catalog_url: null,
        total_byte_size: null,
        map_package_id: null,
        is_published: false,
        created_at: "2026-08-01T00:00:00.000Z",
        updated_at: "2026-08-01T00:00:00.000Z",
        deleted_at: null,
      }),
    ).toThrow(/unpublished/);
  });
});
