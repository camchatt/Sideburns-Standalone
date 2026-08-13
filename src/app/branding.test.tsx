import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppProviders, createTestAppServices } from "@/app/providers";
import { AppRouter } from "@/app/router";
import { loadAppConfig } from "@/app/config";
import {
  BRAND_LOGO_SRC,
  LEGACY_INDEXED_DB_NAME,
  PACKAGE_NAME,
  PRODUCT_NAME,
  PRODUCT_TAGLINE,
} from "@/lib/branding";

vi.mock("@/features/map/components/PlayaMap", () => ({ PlayaMap: () => <div data-testid="playa-map" /> }));

describe("SIDEBURNS branding", () => {
  it("exposes SIDEBURNS product identity constants", () => {
    expect(PRODUCT_NAME).toBe("SIDEBURNS");
    expect(PACKAGE_NAME).toBe("sideburn");
    expect(BRAND_LOGO_SRC).toBe("/images/sideburn-logo.png");
    expect(PRODUCT_TAGLINE.toLowerCase()).toContain("burning man");
    expect(PRODUCT_TAGLINE.toLowerCase()).not.toContain("artelier");
    expect(LEGACY_INDEXED_DB_NAME).toBe("artelier-playa");
    expect(loadAppConfig({}).appName).toBe("SIDEBURNS");
  });

  it("renders SIDEBURNS branding and navigation in the shell", async () => {
    render(
      <AppProviders services={createTestAppServices()}>
        <MemoryRouter initialEntries={["/app"]}>
          <AppRouter />
        </MemoryRouter>
      </AppProviders>,
    );

    expect(screen.getByText("SIDEBURNS")).toBeInTheDocument();
    expect(screen.getByLabelText("SIDEBURNS")).toBeInTheDocument();
    const logo = document.querySelector(`img[src="${BRAND_LOGO_SRC}"]`);
    expect(logo).toBeTruthy();
    expect(screen.queryByText(/Artelier/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("map-experience")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a beacon" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("playa-map")).toBeInTheDocument();
    });
  });
});
