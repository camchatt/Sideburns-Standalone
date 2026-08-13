import { useContext } from "react";
import {
  LocalIdentityContext,
  type LocalIdentityContextValue,
} from "@/features/identity/hooks/localIdentityContext";

export type { LocalIdentityContextValue };

export function useLocalIdentity(): LocalIdentityContextValue {
  const ctx = useContext(LocalIdentityContext);
  if (!ctx) {
    throw new Error("useLocalIdentity must be used within LocalIdentityProvider");
  }
  return ctx;
}
