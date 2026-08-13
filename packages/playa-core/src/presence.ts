/**
 * Live friend presence via short device share codes + Supabase.
 *
 * Each device has a stable 6-char code. When sharing is on, this device
 * upserts lat/lng into `sideburns_presence`. Following a friend's code
 * polls their row and draws them on the map — no Supabase Auth required.
 */

import { getBeaconsSupabase } from "./supabase";
import { getSidequesterDeviceId } from "./beacons";

export const SIDEQUESTER_PRESENCE_TABLE = "sideburns_presence";

const SHARE_CODE_KEY = "artelier.sidequester.share-code.v1";
const FOLLOWED_KEY = "artelier.sidequester.followed-codes.v1";
const SHARE_ENABLED_KEY = "artelier.sidequester.share-location.v1";

/** Crockford base32 without I/L/O/U — easy to read aloud. */
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 6;

export type PresenceRow = {
  deviceId: string;
  shareCode: string;
  lat: number;
  lng: number;
  updatedAt: string;
  label: string | null;
};

type PresenceDbRow = {
  device_id: string;
  share_code: string;
  lat: number;
  lng: number;
  updated_at: string;
  label: string | null;
};

function rowToPresence(row: PresenceDbRow): PresenceRow {
  return {
    deviceId: row.device_id,
    shareCode: row.share_code,
    lat: row.lat,
    lng: row.lng,
    updatedAt: row.updated_at,
    label: row.label,
  };
}

function normalizeCode(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0")
    .replace(/U/g, "V");
}

function randomShareCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length]!;
  }
  return out;
}

/** Stable per-device share code (created once, kept in localStorage). */
export function getOrCreateShareCode(): string {
  if (typeof window === "undefined") return randomShareCode();
  try {
    const existing = window.localStorage.getItem(SHARE_CODE_KEY);
    if (existing && normalizeCode(existing).length === CODE_LENGTH) {
      return normalizeCode(existing);
    }
    const next = randomShareCode();
    window.localStorage.setItem(SHARE_CODE_KEY, next);
    return next;
  } catch {
    return randomShareCode();
  }
}

export function formatShareCode(code: string): string {
  const raw = normalizeCode(code);
  if (raw.length <= 3) return raw;
  return `${raw.slice(0, 3)} ${raw.slice(3)}`;
}

export function loadFollowedShareCodes(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FOLLOWED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .filter((v): v is string => typeof v === "string")
          .map(normalizeCode)
          .filter((c) => c.length === CODE_LENGTH),
      ),
    );
  } catch {
    return [];
  }
}

export function saveFollowedShareCodes(codes: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      FOLLOWED_KEY,
      JSON.stringify(
        Array.from(
          new Set(codes.map(normalizeCode).filter((c) => c.length === CODE_LENGTH)),
        ),
      ),
    );
  } catch {
    // ignore quota
  }
}

export function followShareCode(code: string): string[] {
  const next = normalizeCode(code);
  const mine = getOrCreateShareCode();
  if (next.length !== CODE_LENGTH) return loadFollowedShareCodes();
  if (next === mine) return loadFollowedShareCodes();
  const list = loadFollowedShareCodes();
  if (list.includes(next)) return list;
  const updated = [...list, next];
  saveFollowedShareCodes(updated);
  return updated;
}

export function unfollowShareCode(code: string): string[] {
  const next = normalizeCode(code);
  const updated = loadFollowedShareCodes().filter((c) => c !== next);
  saveFollowedShareCodes(updated);
  return updated;
}

export function loadShareLocationEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SHARE_ENABLED_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveShareLocationEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SHARE_ENABLED_KEY, enabled ? "1" : "0");
  } catch {
    // ignore
  }
}

/**
 * Publish this device's GPS under its share code.
 * Creates the row on first share; updates lat/lng afterward.
 */
export async function publishPresence(input: {
  lat: number;
  lng: number;
  label?: string | null;
}): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const supabase = getBeaconsSupabase();
  if (!supabase) {
    return {
      ok: false,
      error: "Beacons Supabase is not configured (VITE_BEACONS_SUPABASE_*)",
    };
  }
  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
    return { ok: false, error: "Invalid coordinates" };
  }
  const deviceId = getSidequesterDeviceId();
  const shareCode = getOrCreateShareCode();
  const { error } = await supabase.from(SIDEQUESTER_PRESENCE_TABLE).upsert(
    {
      device_id: deviceId,
      share_code: shareCode,
      lat: input.lat,
      lng: input.lng,
      label: input.label?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "device_id" },
  );
  if (error) {
    console.warn("[sideburns presence] publish failed:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, code: shareCode };
}

/** Fetch live positions for a list of share codes. */
export async function fetchPresenceByCodes(
  codes: string[],
): Promise<PresenceRow[]> {
  const supabase = getBeaconsSupabase();
  if (!supabase || !codes.length) return [];
  const normalized = Array.from(
    new Set(codes.map(normalizeCode).filter((c) => c.length === CODE_LENGTH)),
  );
  if (!normalized.length) return [];
  const { data, error } = await supabase
    .from(SIDEQUESTER_PRESENCE_TABLE)
    .select("device_id,share_code,lat,lng,updated_at,label")
    .in("share_code", normalized);
  if (error) {
    console.warn("[sideburns presence] fetch failed:", error.message);
    return [];
  }
  return ((data ?? []) as PresenceDbRow[]).map(rowToPresence);
}

/** Stale if older than this — still shown, but UI can mark as old. */
export const PRESENCE_STALE_MS = 5 * 60 * 1000;
