import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { AppProviders, createTestAppServices } from "@/app/providers";
import { AppRouter } from "@/app/router";

describe("PrototypeControlsPage", () => {
  it("applies the Black Rock City preset as a labeled session simulation and clears it", async () => {
    const services = createTestAppServices({
      VITE_APP_ENV: "prototype",
      VITE_DATA_PROVIDER: "sample",
      VITE_MAP_SOURCE: "sample",
      VITE_ENABLE_PROTOTYPE_CONTROLS: "true",
    });
    render(
      <AppProviders services={services}>
        <MemoryRouter initialEntries={["/prototype-controls"]}>
          <AppRouter />
        </MemoryRouter>
      </AppProviders>,
    );

    fireEvent.click(screen.getByTestId("location-preset-black-rock-city"));
    await waitFor(() => {
      expect(screen.getByTestId("prototype-location-state")).toHaveTextContent("Simulated");
    });
    expect(await services.location.getCurrent()).toMatchObject({
      source: "simulated",
      coordinates: { latitude: 40.7864, longitude: -119.2065 },
    });

    fireEvent.click(screen.getByTestId("clear-simulated-location"));
    await waitFor(() => {
      expect(screen.getByTestId("prototype-location-state")).not.toHaveTextContent("Simulated");
    });
    expect((await services.location.getCurrent()).source).toBe("device");
  });

  it("does not expose simulation controls in production", () => {
    const services = createTestAppServices({
      VITE_APP_ENV: "production",
      VITE_DATA_PROVIDER: "sample",
      VITE_MAP_SOURCE: "sample",
      VITE_ENABLE_PROTOTYPE_CONTROLS: "false",
    });
    render(
      <AppProviders services={services}>
        <MemoryRouter initialEntries={["/prototype-controls"]}>
          <AppRouter />
        </MemoryRouter>
      </AppProviders>,
    );
    expect(screen.getByText("Disabled in this environment.")).toBeInTheDocument();
    expect(screen.queryByTestId("location-preset-black-rock-city")).not.toBeInTheDocument();
  });
});
