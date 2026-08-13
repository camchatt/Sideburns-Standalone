import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { normalizeBeaconKind } from "@/features/map/utils/beaconKinds";
import type { MapRecordListOptions, MapRecordProvider, PlayaMapRecord } from "@/features/map/types/mapRecord";

const sharedBeaconRowSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radius_meters: z.number().positive(),
  category: z.enum(["art", "camp", "performance", "service", "explore", "other"]),
  placement_kind: z.enum(["exact", "approximate"]),
  beacon_kind: z.enum(["food", "get_weird", "do_good", "medical", "bike", "restroom", "massage"]).nullable(),
  presenter: z.string().nullable(),
  reward: z.string().nullable(),
  live_pin: z.boolean(),
  test_area_id: z.enum(["black-rock-city", "winthrop"]).nullable(),
  created_at: z.string().datetime({ offset: true }),
});

export function mapSharedBeaconRow(raw: unknown): PlayaMapRecord {
  const row = sharedBeaconRowSchema.parse(raw);
  return {
    id: row.id,
    slug: row.id,
    title: row.title,
    description: row.description,
    location: { latitude: row.latitude, longitude: row.longitude },
    placementKind: row.placement_kind,
    placementLabel: "Shared community beacon",
    placementConfidence: row.placement_kind === "exact" ? 1 : 0.4,
    eventYear: new Date(row.created_at).getUTCFullYear(),
    heroImageUrl: null,
    artistName: null,
    radiusMeters: row.radius_meters,
    detailUrl: null,
    recordKind: row.beacon_kind ? "beacon" : "sidequest",
    markerKind: normalizeBeaconKind(row.beacon_kind),
    category: row.category,
    origin: "shared",
    presenter: row.presenter,
    reward: row.reward,
    livePin: row.live_pin,
    testAreaId: row.test_area_id,
  };
}

function matches(record: PlayaMapRecord, options: MapRecordListOptions): boolean {
  const q = options.query?.trim().toLowerCase();
  return (
    (!options.years?.length || options.years.includes(record.eventYear)) &&
    (!q || `${record.title} ${record.description} ${record.presenter ?? ""}`.toLowerCase().includes(q))
  );
}

export function createSupabaseSharedBeaconProvider(client: SupabaseClient): MapRecordProvider {
  return {
    source: "supabase",
    async list(options = {}) {
      const { data, error } = await client
        .from("shared_beacons")
        .select("id,title,description,latitude,longitude,radius_meters,category,placement_kind,beacon_kind,presenter,reward,live_pin,test_area_id,created_at")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapSharedBeaconRow).filter((record) => matches(record, options));
    },
  };
}

export function createCombinedMapRecordProvider(
  local: MapRecordProvider,
  shared: MapRecordProvider,
): MapRecordProvider {
  return {
    source: "supabase",
    async list(options = {}) {
      // Local/sample catalog (including 2025 art) must still load when shared
      // beacons are unavailable — otherwise loadMapRecords falls back to a stale
      // IndexedDB cache that may predate the Projects inventory.
      const localRows = await local.list(options);
      let sharedRows: PlayaMapRecord[] = [];
      try {
        sharedRows = await shared.list(options);
      } catch {
        sharedRows = [];
      }
      const merged = new Map(localRows.map((record) => [record.id, record]));
      for (const record of sharedRows) merged.set(record.id, record);
      return [...merged.values()];
    },
  };
}
