/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_INCLUDE_DEMO_BEACONS?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Optional separate project for UGC `sideburns_beacons` sync. */
  readonly VITE_BEACONS_SUPABASE_URL?: string;
  readonly VITE_BEACONS_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
