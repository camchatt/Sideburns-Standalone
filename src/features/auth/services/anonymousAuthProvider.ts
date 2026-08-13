import type { AuthProvider } from "@/features/auth/types/auth";

/** Anonymous / signed-out auth stub. Core field UX must work with this. */
export function createAnonymousAuthProvider(): AuthProvider {
  return {
    async getSession() {
      return null;
    },
    async signOut() {
      return;
    },
  };
}
