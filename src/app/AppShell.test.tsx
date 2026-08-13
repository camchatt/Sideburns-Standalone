import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppProviders, createTestAppServices } from "@/app/providers";
import { AppRouter } from "@/app/router";

vi.mock("@/features/map/components/PlayaMap", () => ({ PlayaMap: () => <div data-testid="playa-map" /> }));

describe("application shell", () => {
  it("renders the temporary rest landing page on /", () => {
    render(
      <AppProviders services={createTestAppServices()}>
        <MemoryRouter initialEntries={["/"]}>
          <AppRouter />
        </MemoryRouter>
      </AppProviders>,
    );

    expect(
      screen.getByRole("heading", {
        name: "You must sleep, but we need to fix this tomorrow.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "A reminder to rest until tomorrow" }),
    ).toHaveAttribute("src", "/images/sleep-until-tomorrow.jpg");
    expect(
      screen.getByText(
        "This is currently pulling from the Sideburns Git repository, not the sidequester branch of Artelier.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the main page" })).toHaveAttribute("href", "/app");
  });

  it("renders SIDEBURNS branding and map-first chrome on /app", async () => {
    render(
      <AppProviders services={createTestAppServices()}>
        <MemoryRouter initialEntries={["/app"]}>
          <AppRouter />
        </MemoryRouter>
      </AppProviders>,
    );

    expect(screen.getByText("SIDEBURNS")).toBeInTheDocument();
    expect(screen.getByTestId("map-experience")).toBeInTheDocument();
    expect(screen.queryByTestId("map-bottom-nav")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a beacon" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("playa-map")).toBeInTheDocument();
    });
  });

  it("redirects legacy sidequester path to the map app", async () => {
    render(
      <AppProviders services={createTestAppServices()}>
        <MemoryRouter initialEntries={["/burningman/sidequester"]}>
          <AppRouter />
        </MemoryRouter>
      </AppProviders>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("map-experience")).toBeInTheDocument();
    });
  });

  it("keeps status chrome on non-map routes", async () => {
    render(
      <AppProviders services={createTestAppServices()}>
        <MemoryRouter initialEntries={["/nearby"]}>
          <AppRouter />
        </MemoryRouter>
      </AppProviders>,
    );

    expect(screen.getByRole("heading", { name: "Nearby" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/Provider:/i)).toBeInTheDocument();
    });
  });

  it("shows the reference layer taxonomy and counted 2025 selector", async () => {
    render(
      <AppProviders services={createTestAppServices()}>
        <MemoryRouter initialEntries={["/app?year=2025"]}><AppRouter /></MemoryRouter>
      </AppProviders>,
    );
    // 2025 = art Projects inventory + 21 beacon/sidequest demo rows
    const year2025 = await screen.findByRole("button", { name: /2025 · \d+/ }, { timeout: 15_000 });
    expect(year2025).toHaveAttribute("aria-pressed", "true");
    expect(Number(year2025.textContent?.match(/2025 · (\d+)/)?.[1] ?? 0)).toBeGreaterThan(250);
    expect(screen.getByRole("button", { name: /Projects \d+ · on/ })).toBeInTheDocument();
    const sideburns = screen.getByRole("button", { name: /Sideburns 21 · on/ });
    const services = screen.getByRole("button", { name: /Services 0 · on/ });
    fireEvent.click(sideburns);
    expect(screen.getByRole("button", { name: "Food 5 · on" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get Weird 7 · on" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Do Good 6 · on" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sideburns 3 · on" })).toBeInTheDocument();
    fireEvent.click(services);
    expect(screen.getByRole("button", { name: "Med Tent 0 · on" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your Sideburns" })).toBeInTheDocument();
  }, 20_000);

  it("shows the prototype test-area dropdown and switches to Winthrop", async () => {
    const services = createTestAppServices({ VITE_APP_ENV: "prototype", VITE_DATA_PROVIDER: "sample", VITE_MAP_SOURCE: "remote", VITE_ENABLE_PROTOTYPE_CONTROLS: "true" });
    render(<AppProviders services={services}><MemoryRouter initialEntries={["/app?area=winthrop"]}><AppRouter /></MemoryRouter></AppProviders>);
    expect(await screen.findByRole("combobox", { name: "Test area" })).toHaveValue("winthrop");
    expect(screen.queryByRole("button", { name: "Simulate BRC" })).not.toBeInTheDocument();
  });

  it("shows Test location only when prototype controls are enabled", async () => {
    const prototypeServices = createTestAppServices({
      VITE_APP_ENV: "prototype",
      VITE_DATA_PROVIDER: "sample",
      VITE_MAP_SOURCE: "sample",
      VITE_ENABLE_PROTOTYPE_CONTROLS: "true",
    });
    const { unmount } = render(
      <AppProviders services={prototypeServices}>
        <MemoryRouter initialEntries={["/settings"]}>
          <AppRouter />
        </MemoryRouter>
      </AppProviders>,
    );
    expect(await screen.findByRole("link", { name: "Test location" })).toBeInTheDocument();
    unmount();

    const productionServices = createTestAppServices({
      VITE_APP_ENV: "production",
      VITE_DATA_PROVIDER: "sample",
      VITE_MAP_SOURCE: "sample",
      VITE_ENABLE_PROTOTYPE_CONTROLS: "false",
    });
    render(
      <AppProviders services={productionServices}>
        <MemoryRouter initialEntries={["/settings"]}>
          <AppRouter />
        </MemoryRouter>
      </AppProviders>,
    );
    expect(screen.queryByRole("link", { name: "Test location" })).not.toBeInTheDocument();
  });
});
