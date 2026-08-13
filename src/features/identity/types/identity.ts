import { z } from "zod";

export const localUserIdentitySchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().trim().min(1).max(80),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type LocalUserIdentity = z.infer<typeof localUserIdentitySchema>;

export const LOCAL_USER_IDENTITY_KEY = "current" as const;

export function parseLocalUserIdentity(data: unknown): LocalUserIdentity {
  return localUserIdentitySchema.parse(data);
}

export function createLocalUserIdentity(displayName: string, now = new Date().toISOString()): LocalUserIdentity {
  return parseLocalUserIdentity({
    id: crypto.randomUUID(),
    displayName: displayName.trim(),
    createdAt: now,
    updatedAt: now,
  });
}
