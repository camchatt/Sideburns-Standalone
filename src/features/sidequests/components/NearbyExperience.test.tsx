import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppProviders, createTestAppServices } from "@/app/providers";
import { NearbyExperience } from "@/features/sidequests/components/NearbyExperience";

describe("NearbyExperience", () => {
  it("keeps browsing available before opt-in and lists approximate separately", async () => {
    render(
      <AppProviders services={createTestAppServices()}>
        <MemoryRouter>
          <NearbyExperience />
        </MemoryRouter>
      </AppProviders>,
    );

    expect(screen.getByTestId("nearby-prompt")).toBeInTheDocument();
    expect(screen.getByTestId("nearby-approximate-list")).toBeInTheDocument();
    expect(screen.queryByTestId("nearby-located-list")).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Rumor Camp Wandering/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("enable-foreground-location"));
    expect(screen.getByTestId("location-lifecycle-state")).toBeInTheDocument();
  });
});
