import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ForegroundLocationProvider } from "@/features/location/hooks/ForegroundLocationProvider";
import { useForegroundLocation } from "@/features/location/hooks/useForegroundLocation";
import type { LocationProvider, LocationReading, LocationWatchHandle } from "@/features/location/types/location";

function Probe() {
  const session = useForegroundLocation();
  return (
    <div>
      <span data-testid="opted-in">{String(session.optedIn)}</span>
      <span data-testid="watching">{session.reading ? "yes" : "no"}</span>
      <button type="button" onClick={session.enable}>
        enable
      </button>
      <button type="button" onClick={session.retry}>
        retry
      </button>
    </div>
  );
}

function createMockLocation(): LocationProvider & {
  watchStarts: number;
  watchStops: number;
} {
  const listeners = new Set<(reading: LocationReading) => void>();
  const provider = {
    watchStarts: 0,
    watchStops: 0,
    async getCurrent() {
      return {
        coordinates: null,
        timestamp: new Date().toISOString(),
        permission: "prompt" as const,
        accuracyMeters: null,
        error: null,
        source: "device" as const,
      };
    },
    watch(onChange: (reading: LocationReading) => void): LocationWatchHandle {
      provider.watchStarts += 1;
      listeners.add(onChange);
      onChange({
        coordinates: { latitude: 40.78, longitude: -119.2, accuracyMeters: 10, altitudeMeters: null },
        timestamp: new Date().toISOString(),
        permission: "granted",
        accuracyMeters: 10,
        error: null,
        source: "device",
      });
      return {
        stop() {
          provider.watchStops += 1;
          listeners.delete(onChange);
        },
      };
    },
    async getPermissionState() {
      return "granted" as const;
    },
    setSimulatedLocation() {
      return;
    },
  };
  return provider;
}

describe("ForegroundLocationProvider battery lifecycle", () => {
  it("pauses watchPosition while the document is hidden and resumes when visible", async () => {
    const location = createMockLocation();
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });

    render(
      <ForegroundLocationProvider location={location}>
        <Probe />
      </ForegroundLocationProvider>,
    );

    await act(async () => {
      screen.getByRole("button", { name: "enable" }).click();
    });

    expect(location.watchStarts).toBe(1);
    expect(location.watchStops).toBe(0);

    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(location.watchStops).toBe(1);

    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(location.watchStarts).toBe(2);
  });

  it("restarts the foreground watch when retry is requested", async () => {
    const location = createMockLocation();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    render(
      <ForegroundLocationProvider location={location}>
        <Probe />
      </ForegroundLocationProvider>,
    );

    await act(async () => screen.getByRole("button", { name: "enable" }).click());
    await act(async () => screen.getByRole("button", { name: "retry" }).click());

    expect(location.watchStarts).toBe(2);
    expect(location.watchStops).toBe(1);
  });
});
