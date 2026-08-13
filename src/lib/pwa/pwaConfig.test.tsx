import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppProviders, createTestAppServices } from "@/app/providers";
import { AppRouter } from "@/app/router";
import { createPromptServiceWorkerBoundary } from "@/lib/pwa/serviceWorkerBoundary";
import { APP_SHELL_CACHE_VERSION } from "@/lib/pwa/versioning";
import { loadAppConfig } from "@/app/config";

describe("pwa offline readiness and config", () => {
  it("loads shell version into app config without requiring Supabase", () => {
    const config = loadAppConfig({
      VITE_APP_ENV: "development",
      VITE_DATA_PROVIDER: "sample",
      VITE_MAP_SOURCE: "sample",
      VITE_ENABLE_BLUETOOTH_EXPERIMENT: "false",
      VITE_ENABLE_PROTOTYPE_CONTROLS: "true",
    });
    expect(config.appName).toBe("SIDEBURNS");
    expect(config.shellVersion).toBe(APP_SHELL_CACHE_VERSION);
    expect(config.env.VITE_DATA_PROVIDER).toBe("sample");
  });

  it("renders install guidance on offline readiness without network", async () => {
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      get: () => false,
    });

    render(
      <AppProviders services={createTestAppServices()}>
        <MemoryRouter initialEntries={["/offline-readiness"]}>
          <AppRouter />
        </MemoryRouter>
      </AppProviders>,
    );

    expect(screen.getByRole("heading", { name: /Offline readiness/i })).toBeInTheDocument();
    expect(screen.getByText(APP_SHELL_CACHE_VERSION)).toBeInTheDocument();
    expect(screen.getByText(/never automatic/i)).toBeInTheDocument();
    expect(screen.getByText("offline")).toBeInTheDocument();
    expect(screen.getByText("prompt")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /Playa pack/i })).toBeInTheDocument();
  });

  it("createAppServices defaults to prompt SW boundary while tests can inject noop", async () => {
    const prompt = createPromptServiceWorkerBoundary();
    expect(prompt.getUpdateStrategy()).toBe("prompt");
    const services = createTestAppServices();
    const result = await services.pwa.register();
    expect(result.registered).toBe(false);
    expect(result.reason).toBe("noop");
  });
});
