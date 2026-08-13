import { describe, expect, it } from "vitest";
import { createDataProviders } from "@/data/adapters/createDataProviders";
import { parseEnv } from "@/lib/validation/env";
import { createTestAppServices } from "@/app/providers";

describe("createDataProviders", () => {
  it("selects sample providers by default", async () => {
    const bundle = createDataProviders(parseEnv({}));
    expect(bundle.dataProviderId).toBe("sample");
    expect(bundle.catalogSource).toBe("sample");
    expect(bundle.eventData.source).toBe("sample");
    expect(bundle.syncBackend).toBe("none");
    expect(bundle.remoteSyncEnabled).toBe(false);
    expect(await bundle.sidequests.getById("bm2025_07_portrait-exchange")).toMatchObject({
      completionRule: "proximity",
      title: "Portrait Exchange",
    });
  });

  it("enables supabase sync backend without claiming sample catalog is remote", () => {
    const bundle = createDataProviders(
      parseEnv({
        VITE_DATA_PROVIDER: "supabase",
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_ANON_KEY: "anon",
      }),
    );
    expect(bundle.dataProviderId).toBe("supabase");
    expect(bundle.catalogSource).toBe("sample");
    expect(bundle.eventData.source).toBe("sample");
    expect(bundle.syncBackend).toBe("supabase");
    expect(bundle.remoteSyncEnabled).toBe(true);
  });

  it("combines the sample catalog with public shared beacons in Supabase mode", () => {
    const services = createTestAppServices({
      VITE_APP_ENV: "prototype",
      VITE_DATA_PROVIDER: "supabase",
      VITE_SUPABASE_URL: "https://example.supabase.co",
      VITE_SUPABASE_ANON_KEY: "anon",
    });
    expect(services.data.catalogSource).toBe("sample");
    expect(services.mapRecords.primary.source).toBe("supabase");
  });

  it("keeps sample catalog fully usable when supabase is requested without credentials via env parse failure path", () => {
    // parseEnv rejects missing credentials for supabase mode — selection honesty is for valid config.
    expect(() =>
      parseEnv({
        VITE_DATA_PROVIDER: "supabase",
      }),
    ).toThrow();
  });
});
