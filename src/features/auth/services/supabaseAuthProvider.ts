import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { AuthProvider, AuthSession } from "@/features/auth/types/auth";

function mapUser(user: User | null): AuthSession {
  if (!user) return null;
  return {
    userId: user.id,
    displayName: (user.user_metadata?.display_name as string | undefined) ?? null,
    email: user.email ?? null,
    isAnonymous: Boolean(user.is_anonymous),
  };
}

/**
 * SIDEBURNS auth adapter over the dedicated Supabase project.
 * Does not import into UI modules — routes use AuthProvider via app services.
 */
export function createSupabaseAuthProvider(client: SupabaseClient): AuthProvider {
  return {
    async getSession() {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      return mapUser(data.session?.user ?? null);
    },

    async signInAnonymously() {
      const { data, error } = await client.auth.signInAnonymously();
      if (error) throw error;
      return mapUser(data.user);
    },

    async signInWithPassword(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return mapUser(data.user);
    },

    onAuthStateChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        listener(mapUser(session?.user ?? null));
      });
      return () => {
        data.subscription.unsubscribe();
      };
    },

    async signOut() {
      const { error } = await client.auth.signOut();
      if (error) throw error;
    },
  };
}
