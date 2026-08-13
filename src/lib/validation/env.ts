import { z } from "zod";

export const appEnvSchema = z.enum(["development", "prototype", "production"]);
export const dataProviderSchema = z.enum(["sample", "supabase"]);
export const mapSourceSchema = z.enum(["sample", "packaged", "remote"]);

const boolish = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((value) => {
    if (typeof value === "boolean") return value;
    if (value == null || value === "") return false;
    return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  });

/** Reject browser exposure of a Supabase service-role JWT. */
export function looksLikeServiceRoleKey(key: string): boolean {
  const trimmed = key.trim();
  if (!trimmed) return false;
  if (/service[_-]?role/i.test(trimmed)) return true;

  const parts = trimmed.split(".");
  if (parts.length < 2) return false;

  try {
    const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson) as { role?: unknown };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

function rejectServiceRoleKey(
  key: string | undefined,
  path: string[],
  ctx: z.RefinementCtx,
): void {
  if (!key) return;
  if (looksLikeServiceRoleKey(key)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "Service-role keys must never be exposed via VITE_*. Use the publishable/anon key only.",
      path,
    });
  }
}

/** True for loopback hosts used in local preview / CLI stacks. */
export function isLoopbackSupabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "[::1]" ||
      parsed.hostname === "::1"
    );
  } catch {
    return false;
  }
}

/**
 * Validates a SIDEBURNS Supabase project URL for the given app environment.
 * Production/non-loopback requires https. Loopback may use http for local CLI.
 */
export function isValidSIDEBURNSSupabaseUrl(
  url: string,
  appEnv: z.infer<typeof appEnvSchema>,
): { ok: true } | { ok: false; reason: string } {
  const trimmed = url.trim();
  if (!trimmed) {
    return {
      ok: false,
      reason:
        "VITE_SUPABASE_URL is required when VITE_DATA_PROVIDER=supabase. Use a dedicated SIDEBURNS project URL — never credentials from another product.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      reason: "VITE_SUPABASE_URL must be a valid absolute URL (https://….supabase.co).",
    };
  }

  const loopback = isLoopbackSupabaseUrl(trimmed);
  if (appEnv === "production" && loopback) {
    return {
      ok: false,
      reason:
        "Production builds must not point VITE_SUPABASE_URL at localhost. Use the hosted SIDEBURNS Supabase project URL.",
    };
  }

  if (parsed.protocol === "https:") {
    return { ok: true };
  }

  if (parsed.protocol === "http:" && loopback && appEnv !== "production") {
    return { ok: true };
  }

  return {
    ok: false,
    reason:
      appEnv === "production"
        ? "VITE_SUPABASE_URL must use https in production (secure context for auth cookies / TLS)."
        : "VITE_SUPABASE_URL must use https, or http only for loopback (local Supabase CLI).",
  };
}

export const envSchema = z
  .object({
    VITE_APP_ENV: appEnvSchema.optional().default("development"),
    VITE_DATA_PROVIDER: dataProviderSchema.optional().default("sample"),
    VITE_SUPABASE_URL: z.string().optional().default(""),
    VITE_SUPABASE_ANON_KEY: z.string().optional().default(""),
    VITE_SUPABASE_PUBLISHABLE_KEY: z.string().optional().default(""),
    /** Intentionally rejected if set — browser must never receive this. */
    VITE_SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    VITE_ENABLE_BLUETOOTH_EXPERIMENT: boolish,
    VITE_ENABLE_PROTOTYPE_CONTROLS: boolish,
    VITE_MAP_SOURCE: mapSourceSchema.optional().default("sample"),
  })
  .superRefine((env, ctx) => {
    rejectServiceRoleKey(env.VITE_SUPABASE_ANON_KEY, ["VITE_SUPABASE_ANON_KEY"], ctx);
    rejectServiceRoleKey(env.VITE_SUPABASE_PUBLISHABLE_KEY, ["VITE_SUPABASE_PUBLISHABLE_KEY"], ctx);
    if (env.VITE_SUPABASE_SERVICE_ROLE_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "VITE_SUPABASE_SERVICE_ROLE_KEY is forbidden. Service-role keys belong only in server-side secrets, never in the browser bundle.",
        path: ["VITE_SUPABASE_SERVICE_ROLE_KEY"],
      });
    }

    if (env.VITE_DATA_PROVIDER === "supabase") {
      const key = (env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY).trim();
      const urlCheck = isValidSIDEBURNSSupabaseUrl(env.VITE_SUPABASE_URL, env.VITE_APP_ENV);

      if (urlCheck.ok === false) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: urlCheck.reason,
          path: ["VITE_SUPABASE_URL"],
        });
      }

      if (!key) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            env.VITE_APP_ENV === "production"
              ? "Production supabase mode requires a valid SIDEBURNS publishable/anon key (VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY). Never use a service-role key."
              : "VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY is required when VITE_DATA_PROVIDER=supabase. Use SIDEBURNS project credentials only.",
          path: ["VITE_SUPABASE_ANON_KEY"],
        });
      }
    }

    if (env.VITE_APP_ENV === "production" && env.VITE_ENABLE_PROTOTYPE_CONTROLS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "VITE_ENABLE_PROTOTYPE_CONTROLS must be false (or unset) when VITE_APP_ENV=production.",
        path: ["VITE_ENABLE_PROTOTYPE_CONTROLS"],
      });
    }
  });

export type AppEnvConfig = z.infer<typeof envSchema>;

export function parseEnv(raw: Record<string, unknown> = import.meta.env): AppEnvConfig {
  return envSchema.parse({
    VITE_APP_ENV: raw.VITE_APP_ENV,
    VITE_DATA_PROVIDER: raw.VITE_DATA_PROVIDER,
    VITE_SUPABASE_URL: raw.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: raw.VITE_SUPABASE_ANON_KEY,
    VITE_SUPABASE_PUBLISHABLE_KEY: raw.VITE_SUPABASE_PUBLISHABLE_KEY,
    VITE_SUPABASE_SERVICE_ROLE_KEY: raw.VITE_SUPABASE_SERVICE_ROLE_KEY,
    VITE_ENABLE_BLUETOOTH_EXPERIMENT: raw.VITE_ENABLE_BLUETOOTH_EXPERIMENT,
    VITE_ENABLE_PROTOTYPE_CONTROLS: raw.VITE_ENABLE_PROTOTYPE_CONTROLS,
    VITE_MAP_SOURCE: raw.VITE_MAP_SOURCE,
  });
}

/**
 * Format Zod/env failures for build logs and operators.
 * Prefer this over raw ZodError dumps when failing a production build.
 */
export function formatEnvValidationError(error: unknown): string {
  if (error && typeof error === "object" && "issues" in error) {
    const issues = (error as z.ZodError).issues;
    return [
      "SIDEBURNS environment validation failed:",
      ...issues.map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`),
      "See docs/deployment.md and .env.example. Sample mode needs no Supabase credentials.",
    ].join("\n");
  }
  return error instanceof Error ? error.message : String(error);
}

export function getPublishableSupabaseKey(env: AppEnvConfig): string {
  return env.VITE_SUPABASE_ANON_KEY || env.VITE_SUPABASE_PUBLISHABLE_KEY;
}
