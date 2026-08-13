import { createElement, useCallback, useEffect, useState, type ReactNode } from "react";
import {
  LocalIdentityContext,
  type LocalIdentityContextValue,
} from "@/features/identity/hooks/localIdentityContext";
import type { LocalUserIdentityRepository } from "@/features/identity/repositories/indexedDbLocalUserIdentityRepository";
import type { LocalUserIdentity } from "@/features/identity/types/identity";

export function LocalIdentityProvider({
  repository,
  children,
}: {
  repository: LocalUserIdentityRepository;
  children: ReactNode;
}) {
  const [identity, setIdentity] = useState<LocalUserIdentity | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const next = await repository.get();
    setIdentity(next);
    setReady(true);
  }, [repository]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const next = await repository.get();
      if (!active) return;
      setIdentity(next);
      setReady(true);
    })();
    return () => {
      active = false;
    };
  }, [repository]);

  const updateDisplayName = useCallback(
    async (displayName: string) => {
      const next = await repository.updateDisplayName(displayName);
      setIdentity(next);
      return next;
    },
    [repository],
  );

  const requireDisplayName = useCallback(
    async (reason?: string) => {
      const current = identity ?? (await repository.get());
      if (current?.displayName.trim()) {
        setIdentity(current);
        return current;
      }
      const message =
        reason ??
        "Choose a burner name or pseudonym. No email or password — just a name so others know who posted.";
      const entered = window.prompt(message, "");
      if (entered == null) return null;
      const trimmed = entered.trim();
      if (!trimmed) return null;
      const next = current
        ? await repository.updateDisplayName(trimmed)
        : await repository.create(trimmed);
      setIdentity(next);
      return next;
    },
    [identity, repository],
  );

  const value: LocalIdentityContextValue = {
    identity,
    ready,
    hasDisplayName: Boolean(identity?.displayName.trim()),
    refresh,
    requireDisplayName,
    updateDisplayName,
  };

  return createElement(LocalIdentityContext.Provider, { value }, children);
}
