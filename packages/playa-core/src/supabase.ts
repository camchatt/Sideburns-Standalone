import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let artClient: SupabaseClient | null = null;
let beaconsClient: SupabaseClient | null = null;

/**
 * Shared anon Supabase client for public Burning Man placement reads.
 * Apps must set VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY.
 */
export function getPlayaSupabase(): SupabaseClient {
  if (artClient) return artClient;
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!url || !key) {
    throw new Error(
      "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY for playa-core",
    );
  }
  artClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return artClient;
}

/**
 * Anon client for Sideburns UGC pins (`sideburns_beacons`).
 * Prefers VITE_BEACONS_SUPABASE_* so pin sync can live on a different project
 * than Burning Man art placements.
 *
 * No Supabase Auth — walkers never sign in. The publishable (anon) key is
 * enough; the table must allow public SELECT/INSERT/UPDATE/DELETE for `anon`
 * (see sidequester/supabase/public_sideburns_beacons.sql).
 */
export function getBeaconsSupabase(): SupabaseClient | null {
  if (beaconsClient) return beaconsClient;
  const url =
    (import.meta.env.VITE_BEACONS_SUPABASE_URL as string | undefined) ||
    (import.meta.env.VITE_SUPABASE_URL as string | undefined);
  const key =
    (import.meta.env.VITE_BEACONS_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined);
  if (!url || !key) return null;
  beaconsClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return beaconsClient;
}
