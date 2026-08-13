/**
 * Sync Sideburns UGC pins with Supabase `public.sideburns_beacons`.
 * Local storage remains the offline cache; remote is the shared source of truth.
 */

import type { SidequesterBeacon } from "./beacons";
import { isBeaconExpired, pruneExpiredBeacons } from "./beacons";
import { getBeaconsSupabase } from "./supabase";

export const SIDEQUESTER_BEACONS_TABLE = "sideburns_beacons";

type BeaconRow = {
  id: string;
  kind: string;
  details: string;
  lat: number;
  lng: number;
  created_at: string;
  starts_at: string | null;
  expires_at: string | null;
  live: boolean;
  sponsor: string | null;
  reward: string | null;
  quest_thread_id: string | null;
  completed_at: string | null;
  completions: number;
  updates: unknown;
  image_url: string | null;
  place: string | null;
  created_by: string | null;
  location_confirmations: unknown;
  principle: string | null;
  updated_at?: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined): value is string {
  return Boolean(value && UUID_RE.test(value));
}

/** Demo / stock pins stay on-device only. */
export function isSyncableBeacon(beacon: SidequesterBeacon): boolean {
  return isUuid(beacon.id) && !beacon.id.startsWith("demo-");
}

export function beaconToRow(beacon: SidequesterBeacon): BeaconRow {
  return {
    id: beacon.id,
    kind: beacon.kind,
    details: beacon.details,
    lat: beacon.lat,
    lng: beacon.lng,
    created_at: beacon.createdAt,
    starts_at: beacon.startsAt ?? null,
    expires_at: beacon.expiresAt ?? null,
    live: Boolean(beacon.live),
    sponsor: beacon.sponsor ?? null,
    reward: beacon.reward ?? null,
    // Column is uuid; local quest thread ids are prefixed (`quest-…`).
    quest_thread_id: isUuid(beacon.questThreadId) ? beacon.questThreadId : null,
    completed_at: null, // never broadcast personal completion onto the shared pin
    completions: beacon.completions ?? 0,
    updates: beacon.updates ?? [],
    image_url: beacon.imageUrl ?? null,
    place: beacon.place ?? null,
    created_by: beacon.createdBy ?? null,
    location_confirmations: beacon.locationConfirmations ?? [],
    principle: beacon.principle ?? null,
    updated_at: new Date().toISOString(),
  };
}

export function rowToBeacon(row: BeaconRow): SidequesterBeacon {
  return {
    id: row.id,
    kind: row.kind as SidequesterBeacon["kind"],
    details: row.details,
    lat: row.lat,
    lng: row.lng,
    createdAt: row.created_at,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    live: row.live,
    sponsor: row.sponsor,
    reward: row.reward,
    questThreadId: row.quest_thread_id,
    completedAt: null, // personal "done" lives in local completions
    completions: row.completions,
    updates: Array.isArray(row.updates)
      ? (row.updates as SidequesterBeacon["updates"])
      : [],
    imageUrl: row.image_url,
    place: row.place,
    createdBy: row.created_by,
    locationConfirmations: Array.isArray(row.location_confirmations)
      ? (row.location_confirmations as SidequesterBeacon["locationConfirmations"])
      : [],
    principle: row.principle as SidequesterBeacon["principle"],
  };
}

export async function fetchRemoteBeacons(): Promise<SidequesterBeacon[]> {
  const supabase = getBeaconsSupabase();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from(SIDEQUESTER_BEACONS_TABLE)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as BeaconRow[];
  return pruneExpiredBeacons(rows.map(rowToBeacon));
}

export async function upsertRemoteBeacon(
  beacon: SidequesterBeacon,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isSyncableBeacon(beacon)) return { ok: true };
  if (isBeaconExpired(beacon)) return { ok: true };
  const supabase = getBeaconsSupabase();
  if (!supabase) {
    const error = "Beacons Supabase is not configured (VITE_BEACONS_SUPABASE_*)";
    console.warn("[sideburns sync]", error);
    return { ok: false, error };
  }
  const { error } = await supabase
    .from(SIDEQUESTER_BEACONS_TABLE)
    .upsert(beaconToRow(beacon), { onConflict: "id" });
  if (error) {
    console.warn("[sideburns sync] upsert failed:", error.message, beacon.id);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function upsertRemoteBeacons(
  beacons: SidequesterBeacon[],
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const rows = beacons
    .filter(isSyncableBeacon)
    .filter((b) => !isBeaconExpired(b))
    .map(beaconToRow);
  if (!rows.length) return { ok: true, count: 0 };
  const supabase = getBeaconsSupabase();
  if (!supabase) {
    const error = "Beacons Supabase is not configured (VITE_BEACONS_SUPABASE_*)";
    console.warn("[sideburns sync]", error);
    return { ok: false, error };
  }
  const { error } = await supabase
    .from(SIDEQUESTER_BEACONS_TABLE)
    .upsert(rows, { onConflict: "id" });
  if (error) {
    console.warn("[sideburns sync] batch upsert failed:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, count: rows.length };
}

export async function deleteRemoteBeacon(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isUuid(id) || id.startsWith("demo-")) return { ok: true };
  const supabase = getBeaconsSupabase();
  if (!supabase) return { ok: false, error: "Beacons Supabase is not configured" };
  const { error } = await supabase
    .from(SIDEQUESTER_BEACONS_TABLE)
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Merge local cache with remote. Remote wins on id collision.
 * Keeps unsynced local-only rows (e.g. offline creates) until they upsert.
 */
export function mergeLocalAndRemoteBeacons(
  local: SidequesterBeacon[],
  remote: SidequesterBeacon[],
): SidequesterBeacon[] {
  const byId = new Map<string, SidequesterBeacon>();
  for (const beacon of local) {
    byId.set(beacon.id, beacon);
  }
  for (const beacon of remote) {
    byId.set(beacon.id, beacon);
  }
  return pruneExpiredBeacons(
    Array.from(byId.values()).sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    ),
  );
}
