import { createContext, type ReactNode } from "react";
import type { LocalUserIdentity } from "@/features/identity/types/identity";

export type LocalIdentityContextValue = {
  identity: LocalUserIdentity | null;
  ready: boolean;
  /** True when a display name has been chosen. */
  hasDisplayName: boolean;
  refresh: () => Promise<void>;
  /**
   * Ensures a persisted identity with a display name.
   * Prompts via `window.prompt` when missing (lightweight gate for create/complete).
   * Returns null if the user cancels or enters a blank name.
   */
  requireDisplayName: (reason?: string) => Promise<LocalUserIdentity | null>;
  updateDisplayName: (displayName: string) => Promise<LocalUserIdentity>;
};

export const LocalIdentityContext = createContext<LocalIdentityContextValue | null>(null);

export type LocalIdentityProviderChildren = ReactNode;
