export type AuthSession = {
  userId: string;
  displayName: string | null;
  email: string | null;
  isAnonymous?: boolean;
} | null;

export interface AuthProvider {
  getSession(): Promise<AuthSession>;
  signInWithPassword?(email: string, password: string): Promise<AuthSession>;
  /** Optional anonymous session for deferred sync (Supabase). */
  signInAnonymously?(): Promise<AuthSession>;
  /** Subscribe to auth changes; returns unsubscribe. */
  onAuthStateChange?(listener: (session: AuthSession) => void): () => void;
  signOut(): Promise<void>;
}
