import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getPublishableSupabaseKey,
  looksLikeServiceRoleKey,
  type AppEnvConfig,
} from "@/lib/validation/env";

/**
 * Optional SIDEBURNS Supabase browser client (publishable/anon key only).
 * UI features must not import this for reads/writes; remote access goes through
 * providers / sync adapters that map remote DTOs → domain types.
 *
 * Never point this at Artelier’s project. See `docs/supabase-backend.md`.
 */
export function createSupabaseBrowserClient(env: AppEnvConfig): SupabaseClient | null {
  const key = getPublishableSupabaseKey(env);
  if (!env.VITE_SUPABASE_URL || !key) return null;
  if (looksLikeServiceRoleKey(key)) {
    throw new Error(
      "Refusing to create a browser Supabase client with a service-role key. Use the publishable/anon key.",
    );
  }
  return createClient(env.VITE_SUPABASE_URL, key, {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}
