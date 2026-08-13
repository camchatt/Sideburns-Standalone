import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createNoopServiceWorkerBoundary,
  createPromptServiceWorkerBoundary,
  type RegisterSWOptions,
} from "@/lib/pwa/serviceWorkerBoundary";

describe("serviceWorkerBoundary", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        register: vi.fn(),
        getRegistration: vi.fn(),
      },
    });
  });

  it("noop boundary reports unsupported and does not register", async () => {
    const boundary = createNoopServiceWorkerBoundary();
    const result = await boundary.register();
    expect(result.registered).toBe(false);
    expect(result.reason).toBe("noop");
    expect(await boundary.getInstallState()).toBe("unsupported");
    expect(boundary.getUpdateStrategy()).toBe("prompt");
  });

  it("prompt boundary registers, surfaces update, and only reloads on applyUpdate", async () => {
    const apply = vi.fn(async () => undefined);
    let captured: RegisterSWOptions | undefined;

    const boundary = createPromptServiceWorkerBoundary({
      loadRegisterSW: async () => (options) => {
        captured = options;
        return apply;
      },
    });

    expect(boundary.getUpdateStrategy()).toBe("prompt");
    const result = await boundary.register();
    expect(result.registered).toBe(true);
    expect(captured?.immediate).toBe(true);

    let latest = false;
    boundary.subscribeUpdateAvailable((available) => {
      latest = available;
    });
    expect(latest).toBe(false);

    captured?.onNeedRefresh?.();
    expect(boundary.isUpdateAvailable()).toBe(true);
    expect(latest).toBe(true);

    boundary.dismissUpdatePrompt();
    expect(boundary.isUpdateAvailable()).toBe(false);
    expect(latest).toBe(false);

    captured?.onNeedRefresh?.();
    expect(boundary.isUpdateAvailable()).toBe(true);
    await boundary.applyUpdate();
    expect(apply).toHaveBeenCalledWith(true);
  });

  it("marks offline-ready from Workbox callback without touching IndexedDB APIs", async () => {
    let captured: RegisterSWOptions | undefined;
    const boundary = createPromptServiceWorkerBoundary({
      loadRegisterSW: async () => (options) => {
        captured = options;
        return async () => undefined;
      },
    });

    const result = await boundary.register();
    expect(result.registered).toBe(true);
    expect(boundary.isOfflineReady()).toBe(false);
    captured?.onOfflineReady?.();
    expect(boundary.isOfflineReady()).toBe(true);
  });

  it("returns unsupported when serviceWorker is missing", async () => {
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: undefined,
    });
    // Ensure `in` check fails: delete if possible
    try {
      // @ts-expect-error test cleanup
      delete navigator.serviceWorker;
    } catch {
      Object.defineProperty(globalThis, "navigator", {
        configurable: true,
        value: { userAgent: "test", onLine: true },
      });
    }

    const boundary = createPromptServiceWorkerBoundary({
      loadRegisterSW: async () => () => async () => undefined,
    });
    const result = await boundary.register();
    expect(result.registered).toBe(false);
    expect(result.reason).toBe("unsupported");
  });
});
