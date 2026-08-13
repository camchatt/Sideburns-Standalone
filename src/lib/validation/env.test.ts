import { describe, expect, it } from "vitest";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  formatEnvValidationError,
  isValidSIDEBURNSSupabaseUrl,
  looksLikeServiceRoleKey,
  parseEnv,
} from "@/lib/validation/env";
import { ZodError } from "zod";

function encodeJwtPayload(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.sig`;
}

describe("parseEnv", () => {
  it("defaults to sample provider without supabase credentials", () => {
    const env = parseEnv({});
    expect(env.VITE_DATA_PROVIDER).toBe("sample");
    expect(env.VITE_APP_ENV).toBe("development");
    expect(env.VITE_ENABLE_BLUETOOTH_EXPERIMENT).toBe(false);
  });

  it("requires supabase credentials when provider is supabase", () => {
    expect(() =>
      parseEnv({
        VITE_DATA_PROVIDER: "supabase",
      }),
    ).toThrow(/VITE_SUPABASE_URL/);
  });

  it("fails clearly in production supabase mode without SIDEBURNS credentials", () => {
    expect(() =>
      parseEnv({
        VITE_APP_ENV: "production",
        VITE_DATA_PROVIDER: "supabase",
      }),
    ).toThrow(/SIDEBURNS/);

    expect(() =>
      parseEnv({
        VITE_APP_ENV: "production",
        VITE_DATA_PROVIDER: "supabase",
        VITE_SUPABASE_URL: "https://example.supabase.co",
      }),
    ).toThrow(/publishable\/anon key/);
  });

  it("rejects http Supabase URLs in production", () => {
    expect(() =>
      parseEnv({
        VITE_APP_ENV: "production",
        VITE_DATA_PROVIDER: "supabase",
        VITE_SUPABASE_URL: "http://example.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
      }),
    ).toThrow(/https/);
  });

  it("rejects loopback Supabase URLs in production", () => {
    expect(() =>
      parseEnv({
        VITE_APP_ENV: "production",
        VITE_DATA_PROVIDER: "supabase",
        VITE_SUPABASE_URL: "http://127.0.0.1:54321",
        VITE_SUPABASE_ANON_KEY: "anon",
      }),
    ).toThrow(/localhost/);
  });

  it("allows loopback http Supabase URLs outside production", () => {
    const env = parseEnv({
      VITE_APP_ENV: "development",
      VITE_DATA_PROVIDER: "supabase",
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_ANON_KEY: "anon",
    });
    expect(env.VITE_SUPABASE_URL).toBe("http://127.0.0.1:54321");
  });

  it("rejects prototype controls in production", () => {
    expect(() =>
      parseEnv({
        VITE_APP_ENV: "production",
        VITE_ENABLE_PROTOTYPE_CONTROLS: "true",
      }),
    ).toThrow(/VITE_ENABLE_PROTOTYPE_CONTROLS/);
  });

  it("accepts supabase mode with url and publishable key", () => {
    const env = parseEnv({
      VITE_DATA_PROVIDER: "supabase",
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "pub-key",
    });
    expect(env.VITE_DATA_PROVIDER).toBe("supabase");
  });

  it("rejects service-role JWTs in publishable/anon slots", () => {
    const serviceRoleJwt = encodeJwtPayload({ role: "service_role", ref: "x" });
    expect(looksLikeServiceRoleKey(serviceRoleJwt)).toBe(true);
    expect(() =>
      parseEnv({
        VITE_DATA_PROVIDER: "supabase",
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_ANON_KEY: serviceRoleJwt,
      }),
    ).toThrow(/Service-role/);
  });

  it("rejects VITE_SUPABASE_SERVICE_ROLE_KEY even when unused", () => {
    expect(() =>
      parseEnv({
        VITE_SUPABASE_SERVICE_ROLE_KEY: "secret",
      }),
    ).toThrow(/VITE_SUPABASE_SERVICE_ROLE_KEY is forbidden/);
  });
});

describe("isValidSIDEBURNSSupabaseUrl", () => {
  it("requires https in production", () => {
    expect(isValidSIDEBURNSSupabaseUrl("https://abc.supabase.co", "production").ok).toBe(true);
    expect(isValidSIDEBURNSSupabaseUrl("http://abc.supabase.co", "production").ok).toBe(false);
  });
});

describe("formatEnvValidationError", () => {
  it("lists issue messages for operators", () => {
    try {
      parseEnv({ VITE_DATA_PROVIDER: "supabase" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ZodError);
      const formatted = formatEnvValidationError(error);
      expect(formatted).toContain("SIDEBURNS environment validation failed");
      expect(formatted).toContain("docs/deployment.md");
    }
  });
});

describe("createSupabaseBrowserClient", () => {
  it("returns null without credentials in sample mode", () => {
    expect(createSupabaseBrowserClient(parseEnv({}))).toBeNull();
  });

  it("throws if a service-role JWT somehow reaches the factory", () => {
    const serviceRoleJwt = encodeJwtPayload({ role: "service_role" });
    expect(() =>
      createSupabaseBrowserClient({
        VITE_APP_ENV: "development",
        VITE_DATA_PROVIDER: "sample",
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_ANON_KEY: serviceRoleJwt,
        VITE_SUPABASE_PUBLISHABLE_KEY: "",
        VITE_ENABLE_BLUETOOTH_EXPERIMENT: false,
        VITE_ENABLE_PROTOTYPE_CONTROLS: false,
        VITE_MAP_SOURCE: "sample",
      }),
    ).toThrow(/service-role/);
  });
});
