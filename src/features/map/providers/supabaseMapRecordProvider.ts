import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseMapRecordRowSchema } from "@/features/map/schemas/mapRecordSchema";
import type { MapRecordProvider, PlayaMapRecord } from "@/features/map/types/mapRecord";
import { clockRadiusToLatLng, manCenterForYear } from "@/features/map/utils/playaGeo";

export function mapSupabaseRow(row: unknown): PlayaMapRecord {
  const value = supabaseMapRecordRowSchema.parse(row);
  const approximate = value.latitude == null || value.longitude == null;
  const derived = approximate && value.clock_hour != null && value.distance_feet != null ? clockRadiusToLatLng(value.clock_hour, value.clock_minute ?? 0, value.distance_feet, manCenterForYear(value.event_year)) : null;
  if ((value.latitude == null || value.longitude == null) && !derived) throw new Error(`Map record ${value.id} has no usable coordinates`);
  return {
    id: value.id,
    slug: value.slug,
    title: value.title,
    description: value.description ?? "",
    location: { latitude: value.latitude ?? derived!.lat, longitude: value.longitude ?? derived!.lng },
    placementKind: approximate ? "approximate" : "exact",
    placementLabel: value.location_string ?? null,
    placementConfidence: value.location_confidence ?? null,
    eventYear: value.event_year,
    heroImageUrl: value.hero_image_url ?? null,
    artistName: value.artist_name_raw ?? null,
    radiusMeters: 30,
    detailUrl: null,
    recordKind: "art",
    category: null,
  };
}

export function createSupabaseMapRecordProvider(client: SupabaseClient): MapRecordProvider {
  return { source: "supabase", async list(options = {}) { const { data, error } = await client.from("burning_man_public_projects").select("*").order("event_year", { ascending: false }).order("title", { ascending: true }); if (error) throw error; const records: PlayaMapRecord[] = []; for (const row of data ?? []) { try { records.push(mapSupabaseRow(row)); } catch { /* Invalid or unmapped rows are intentionally excluded. */ } } const q = options.query?.trim().toLowerCase(); return records.filter((record) => (!options.years?.length || options.years.includes(record.eventYear)) && (!q || `${record.title} ${record.artistName ?? ""} ${record.description}`.toLowerCase().includes(q))); } };
}
