import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBrowserLocationProvider } from "@/features/location/providers/browserLocationProvider";

type GeoMock = {
  getCurrentPosition: ReturnType<typeof vi.fn>;
  watchPosition: ReturnType<typeof vi.fn>;
  clearWatch: ReturnType<typeof vi.fn>;
};

function mockGeolocation(geo: GeoMock | undefined) {
  Object.defineProperty(globalThis.navigator, "geolocation", {
    configurable: true,
    value: geo,
  });
}

describe("createBrowserLocationProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    mockGeolocation(undefined);
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: undefined });
  });

  it("reports unsupported when geolocation is missing", async () => {
    mockGeolocation(undefined);
    const provider = createBrowserLocationProvider();
    const reading = await provider.getCurrent();
    expect(reading.permission).toBe("unsupported");
    expect(reading.coordinates).toBeNull();
    expect(reading.error).toMatch(/unsupported/i);
  });

  it("reports an insecure origin separately before requesting geolocation", async () => {
    const geo: GeoMock = {
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    };
    mockGeolocation(geo);
    Object.defineProperty(window, "isSecureContext", { configurable: true, value: false });

    const reading = await createBrowserLocationProvider().getCurrent();
    expect(reading.permission).toBe("unsupported");
    expect(reading.error).toMatch(/https or localhost/i);
    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("returns device coordinates when geolocation succeeds", async () => {
    const geo: GeoMock = {
      getCurrentPosition: vi.fn((success: PositionCallback) => {
        success({
          coords: {
            latitude: 40.7864,
            longitude: -119.2065,
            accuracy: 12,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            toJSON() {
              return this;
            },
          },
          timestamp: Date.UTC(2026, 7, 3),
          toJSON() {
            return this;
          },
        } as GeolocationPosition);
      }),
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    };
    mockGeolocation(geo);
    Object.defineProperty(globalThis.navigator, "permissions", {
      configurable: true,
      value: { query: vi.fn(async () => ({ state: "granted" })) },
    });

    const provider = createBrowserLocationProvider();
    const reading = await provider.getCurrent();
    expect(reading.source).toBe("device");
    expect(reading.permission).toBe("granted");
    expect(reading.coordinates).toEqual({
      latitude: 40.7864,
      longitude: -119.2065,
      accuracyMeters: 12,
      altitudeMeters: null,
    });
  });

  it("maps permission denied errors", async () => {
    const geo: GeoMock = {
      getCurrentPosition: vi.fn((_success: PositionCallback, error?: PositionErrorCallback) => {
        error?.({
          code: 1,
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
          message: "denied",
        } as GeolocationPositionError);
      }),
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    };
    mockGeolocation(geo);

    const provider = createBrowserLocationProvider();
    const reading = await provider.getCurrent();
    expect(reading.permission).toBe("denied");
    expect(reading.coordinates).toBeNull();
    expect(reading.error).toMatch(/denied/i);
  });

  it("prefers simulated location over device GPS", async () => {
    const geo: GeoMock = {
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn(),
      clearWatch: vi.fn(),
    };
    mockGeolocation(geo);
    const provider = createBrowserLocationProvider();
    provider.setSimulatedLocation({ latitude: 40.78, longitude: -119.2 });
    const reading = await provider.getCurrent();
    expect(reading.source).toBe("simulated");
    expect(reading.coordinates?.latitude).toBe(40.78);
    expect(geo.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("shares one watchPosition and clears it when the last subscriber stops", () => {
    const geo: GeoMock = {
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn(() => 42),
      clearWatch: vi.fn(),
    };
    mockGeolocation(geo);
    const provider = createBrowserLocationProvider();
    const first = provider.watch(vi.fn());
    const second = provider.watch(vi.fn());
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    first.stop();
    expect(geo.clearWatch).not.toHaveBeenCalled();
    second.stop();
    expect(geo.clearWatch).toHaveBeenCalledWith(42);
  });

  it("clears simulation into acquiring state and resumes device GPS", () => {
    const listener = vi.fn();
    const geo: GeoMock = {
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn(() => 9),
      clearWatch: vi.fn(),
    };
    mockGeolocation(geo);
    const provider = createBrowserLocationProvider();
    provider.setSimulatedLocation({ latitude: 40.7864, longitude: -119.2065 });
    const handle = provider.watch(listener);

    expect(listener.mock.calls.at(-1)?.[0].source).toBe("simulated");
    provider.setSimulatedLocation(null);

    expect(listener.mock.calls.at(-1)?.[0].source).toBe("device");
    expect(listener.mock.calls.at(-1)?.[0].error).toMatch(/acquiring/i);
    expect(geo.watchPosition).toHaveBeenCalledTimes(1);
    handle.stop();
  });

  it("does not start watchPosition until watch() is called", () => {
    const geo: GeoMock = {
      getCurrentPosition: vi.fn(),
      watchPosition: vi.fn(() => 7),
      clearWatch: vi.fn(),
    };
    mockGeolocation(geo);
    createBrowserLocationProvider();
    expect(geo.watchPosition).not.toHaveBeenCalled();
  });
});
